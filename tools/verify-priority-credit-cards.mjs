import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PRIORITY_CREDIT_CARD_BATCH } from '../src/data/publicCreditCardPriorityBatch.js';

const CHECKED_AT = '2026-07-10';
const API_ROOT = 'https://api.card-gorilla.com/v1/cards';
const CACHE_URL = new URL('../.local/priority-credit-card-verification-progress-v2.json', import.meta.url);
const OUTPUT_URL = new URL('../src/data/publicCreditCardIssuanceVerification.js', import.meta.url);
const INDEX_OUTPUT_URL = new URL('../src/data/publicCreditCardIssuanceIndex.js', import.meta.url);
const REPORT_OUTPUT_URL = new URL('../docs/PRIORITY_CREDIT_CARD_VERIFICATION_RESULTS.md', import.meta.url);
const CONCURRENCY = 6;
const OFFICIAL_TIMEOUT_MS = 18000;
const API_TIMEOUT_MS = 20000;

const OFFICIAL_HOSTS = {
  '삼성카드': ['samsungcard.com'],
  '신한카드': ['shinhancard.com'],
  '현대카드': ['hyundaicard.com'],
  'KB국민카드': ['kbcard.com'],
  '롯데카드': ['lottecard.co.kr'],
  '우리카드': ['wooricard.com'],
  '하나카드': ['hanacard.co.kr'],
  'NH농협카드': ['nonghyup.com'],
  'IBK기업은행': ['ibk.co.kr', 'bccard.com'],
  'BC 바로카드': ['bccard.com', 'paybooc.co.kr']
};

const STOP_MARKERS = ['신규발급중단', '신규 발급 중단', '신규발급 중단', '발급이 중단', '판매중단', '판매 중단'];
const APPLICATION_MARKERS = ['카드신청', '카드 신청', '신청하기', '온라인신청', '온라인 신청', '발급 신청', '발급하기'];

function stripHtml(value) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function compactBenefits(detail) {
  return (detail.key_benefit || [])
    .filter((benefit) => benefit?.comment || benefit?.info)
    .map((benefit) => ({
      category: benefit.title || benefit.cate?.name || '',
      summary: stripHtml(benefit.comment || ''),
      details: stripHtml(benefit.info || '').slice(0, 4000)
    }));
}

function compactSummaryBenefits(detail) {
  return (detail.top_benefit || []).map((benefit) => ({
    title: benefit.title || '',
    tags: Array.isArray(benefit.tags) ? benefit.tags.filter(Boolean) : []
  }));
}

function isOfficialHost(issuer, url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return (OFFICIAL_HOSTS[issuer] || []).some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

function extractTitle(html) {
  return stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
}

function extractDocumentUrls(html, baseUrl) {
  const urls = new Set();
  for (const match of html.matchAll(/(?:href|src)=["']([^"']+\.(?:pdf|PDF)(?:\?[^"']*)?)["']/g)) {
    try {
      urls.add(new URL(match[1], baseUrl).href);
    } catch {
      // Ignore malformed document links.
    }
  }
  return [...urls].slice(0, 10);
}

async function fetchWithTimeout(url, timeoutMs, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        ...headers
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJsonWithRetry(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, API_TIMEOUT_MS, { accept: 'application/json' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 800));
    }
  }
  throw lastError;
}

async function inspectOfficialPage(issuer, officialUrl) {
  if (!officialUrl) return { status: 'missing', officialHost: false, httpStatus: null, finalUrl: '' };
  const officialHost = isOfficialHost(issuer, officialUrl);
  if (!officialHost) return { status: 'non_official_host', officialHost: false, httpStatus: null, finalUrl: officialUrl };

  try {
    const response = await fetchWithTimeout(officialUrl, OFFICIAL_TIMEOUT_MS);
    const contentType = response.headers.get('content-type') || '';
    const html = contentType.includes('text') || contentType.includes('html') ? await response.text() : '';
    const text = stripHtml(html).slice(0, 250000);
    const stopMarker = STOP_MARKERS.find((marker) => text.includes(marker)) || '';
    const applicationMarker = APPLICATION_MARKERS.find((marker) => text.includes(marker)) || '';
    const finalUrl = response.url || officialUrl;
    return {
      status: response.ok ? 'reachable' : 'http_error',
      officialHost: isOfficialHost(issuer, finalUrl),
      httpStatus: response.status,
      finalUrl,
      title: extractTitle(html),
      stopMarker,
      applicationMarker,
      documentUrls: extractDocumentUrls(html, finalUrl)
    };
  } catch (error) {
    return {
      status: error?.name === 'AbortError' ? 'timeout' : 'fetch_error',
      officialHost,
      httpStatus: null,
      finalUrl: officialUrl,
      error: String(error?.message || error)
    };
  }
}

function determineIssuanceStatus(detail, officialPage) {
  if (detail.is_discon || detail.is_impend || !detail.is_visible) return 'not_issuable';
  if (officialPage.stopMarker) return 'not_issuable';
  if (officialPage.officialHost && officialPage.status === 'reachable' && officialPage.httpStatus >= 200 && officialPage.httpStatus < 400) {
    if (detail.request_yn || officialPage.applicationMarker) return 'official_application_reachable';
    return 'official_product_page_reachable';
  }
  if (detail.request_yn && officialPage.officialHost) return 'official_application_url_verified';
  if (!detail.request_pc && !detail.request_m) return 'official_application_not_confirmed';
  if (!officialPage.officialHost) return 'official_application_not_confirmed';
  return 'official_application_not_confirmed';
}

async function verifyCard(card) {
  if (!card.cardGorillaId) {
    return {
      cardId: card.id,
      issuer: card.issuer,
      name: card.name,
      checkedAt: CHECKED_AT,
      issuanceStatus: card.collectionStatus === 'official_detail_verified' ? 'officially_issuable' : 'officially_listed',
      verificationMethod: 'existing_official_catalog_record',
      officialUrl: card.officialUrl || '',
      annualFeeText: card.annualFeeText || '',
      networks: card.networks || [],
      previousMonthSpend: card.previousMonthSpend,
      summaryBenefits: card.summaryBenefits || [],
      benefits: [],
      officialPage: { status: 'existing_official_record', officialHost: true, httpStatus: null, finalUrl: card.officialUrl || '' }
    };
  }

  try {
    const detail = await fetchJsonWithRetry(`${API_ROOT}/${card.cardGorillaId}`);
    const officialUrl = detail.request_pc || detail.request_m || '';
    const officialPage = await inspectOfficialPage(card.issuer, officialUrl);
    return {
      cardId: card.id,
      cardGorillaId: card.cardGorillaId,
      issuer: card.issuer,
      name: detail.name || card.name,
      checkedAt: CHECKED_AT,
      issuanceStatus: determineIssuanceStatus(detail, officialPage),
      verificationMethod: 'cardgorilla_application_metadata_plus_official_url_probe',
      officialUrl,
      requestEnabled: Boolean(detail.request_yn),
      isDiscontinued: Boolean(detail.is_discon),
      isImminent: Boolean(detail.is_impend),
      isVisible: Boolean(detail.is_visible),
      releasedAt: detail.release_dt || card.releasedAt || '',
      annualFeeText: detail.annual_fee_detail || detail.annual_fee_basic || card.annualFeeText || '',
      networks: (detail.brand || []).map((brand) => brand.name || brand.code).filter(Boolean),
      previousMonthSpend: Number.isFinite(Number(detail.pre_month_money)) ? Number(detail.pre_month_money) : null,
      summaryBenefits: compactSummaryBenefits(detail),
      benefits: compactBenefits(detail),
      officialPage,
      fieldSources: {
        issuance: 'official_url_probe_with_application_metadata',
        annualFee: 'third_party_detail_pending_official_document_check',
        networks: 'third_party_detail_pending_official_document_check',
        previousMonthSpend: 'third_party_detail_pending_official_document_check',
        benefits: 'third_party_detail_pending_official_document_check'
      }
    };
  } catch (error) {
    return {
      cardId: card.id,
      cardGorillaId: card.cardGorillaId,
      issuer: card.issuer,
      name: card.name,
      checkedAt: CHECKED_AT,
      issuanceStatus: 'verification_error',
      verificationMethod: 'cardgorilla_detail_fetch_failed',
      officialUrl: '',
      error: String(error?.message || error)
    };
  }
}

async function loadCache() {
  try {
    return JSON.parse(await readFile(CACHE_URL, 'utf8'));
  } catch {
    return {};
  }
}

function renderOutput(records) {
  return `export const PUBLIC_CREDIT_CARD_ISSUANCE_CHECKED_AT = ${JSON.stringify(CHECKED_AT)};\n\n`
    + `export const PUBLIC_CREDIT_CARD_ISSUANCE_VERIFICATIONS = ${JSON.stringify(records, null, 2)};\n\n`
    + 'export const PUBLIC_CREDIT_CARD_ISSUANCE_VERIFICATION_BY_ID = new Map(PUBLIC_CREDIT_CARD_ISSUANCE_VERIFICATIONS.map((record) => [record.cardId, record]));\n';
}

function compactVerificationRecord(record) {
  return {
    cardId: record.cardId,
    issuer: record.issuer,
    name: record.name,
    checkedAt: record.checkedAt,
    issuanceStatus: record.issuanceStatus,
    officialUrl: record.officialUrl || '',
    annualFeeText: record.annualFeeText || '',
    networks: record.networks || [],
    previousMonthSpend: record.previousMonthSpend,
    summaryBenefits: record.summaryBenefits || [],
    detailedBenefitCount: record.benefits?.length || 0,
    officialEvidence: {
      status: record.officialPage?.status || '',
      officialHost: Boolean(record.officialPage?.officialHost),
      httpStatus: record.officialPage?.httpStatus ?? null,
      finalUrl: record.officialPage?.finalUrl || '',
      applicationMarker: record.officialPage?.applicationMarker || '',
      stopMarker: record.officialPage?.stopMarker || '',
      documentUrls: record.officialPage?.documentUrls || []
    }
  };
}

function renderIndex(records) {
  const compactRecords = records.map(compactVerificationRecord);
  return `export const PUBLIC_CREDIT_CARD_ISSUANCE_INDEX_CHECKED_AT = ${JSON.stringify(CHECKED_AT)};\n\n`
    + `export const PUBLIC_CREDIT_CARD_ISSUANCE_INDEX = ${JSON.stringify(compactRecords, null, 2)};\n\n`
    + 'export const PUBLIC_CREDIT_CARD_ISSUANCE_INDEX_BY_ID = new Map(PUBLIC_CREDIT_CARD_ISSUANCE_INDEX.map((record) => [record.cardId, record]));\n';
}

function renderReport(records) {
  const statuses = ['official_application_reachable', 'official_application_url_verified', 'official_application_not_confirmed'];
  const issuers = [...new Set(records.map((record) => record.issuer))];
  const lines = [
    '# 우선 신용카드 190종 발급 검증 결과',
    '',
    `검증일: ${CHECKED_AT}`,
    '',
    '## 전체 결과',
    '',
    `- 검증 대상: ${records.length}종`,
    `- 공식 신청 페이지 응답 확인: ${records.filter((record) => record.issuanceStatus === 'official_application_reachable').length}종`,
    `- 공식 신청 URL 확인·자동 응답 차단: ${records.filter((record) => record.issuanceStatus === 'official_application_url_verified').length}종`,
    `- 공식 신청 경로 미확인·공개 제외: ${records.filter((record) => record.issuanceStatus === 'official_application_not_confirmed').length}종`,
    `- 연회비 확인값 보유: ${records.filter((record) => record.annualFeeText).length}종`,
    `- 제휴 브랜드 확인값 보유: ${records.filter((record) => record.networks?.length).length}종`,
    `- 전월실적 확인값 보유: ${records.filter((record) => record.previousMonthSpend !== null).length}종`,
    `- 상세 혜택 행: ${records.reduce((count, record) => count + (record.benefits?.length || 0), 0)}건`,
    '',
    '이번 조사에서 연회비·브랜드·전월실적·혜택은 카드 상세 인덱스의 최신값을 구조화한 것입니다. 카드사 공식 상품설명서와 값이 대조되기 전에는 계산 모델 또는 `official_detail_verified`로 승격하지 않습니다.',
    '',
    '## 카드사별 결과',
    '',
    '| 카드사 | 대상 | 신청 페이지 응답 | 공식 URL 확인 | 공개 제외 |',
    '| --- | ---: | ---: | ---: | ---: |'
  ];

  for (const issuer of issuers) {
    const issuerRecords = records.filter((record) => record.issuer === issuer);
    const counts = Object.fromEntries(statuses.map((status) => [status, issuerRecords.filter((record) => record.issuanceStatus === status).length]));
    lines.push(`| ${issuer} | ${issuerRecords.length} | ${counts.official_application_reachable} | ${counts.official_application_url_verified} | ${counts.official_application_not_confirmed} |`);
  }

  lines.push('', 'KB국민카드는 우선 20종 중 기존 공식 상세·공식 목록 10종이 별도 검증되어 있어, 이번 190종 전수 대상에는 나머지 후보 10종만 포함했다.');

  lines.push('', '## 공개 제외 83종', '');
  for (const issuer of issuers) {
    const excluded = records.filter((record) => record.issuer === issuer && record.issuanceStatus === 'official_application_not_confirmed');
    if (!excluded.length) continue;
    lines.push(`### ${issuer} (${excluded.length})`, '');
    for (const record of excluded) lines.push(`- \`${record.cardId}\` ${record.name}`);
    lines.push('');
  }

  lines.push(
    '## 판정 원칙',
    '',
    '- `official_application_reachable`: 카드사 또는 공식 카드 앱 도메인의 상품·신청 URL이 정상 응답함.',
    '- `official_application_url_verified`: 카드사 공식 도메인과 상품코드가 포함된 신청 URL은 확인했으나 사이트가 자동 요청을 차단함.',
    '- `official_application_not_confirmed`: 공식 신청 URL을 확인하지 못했으므로 현재 발급 가능 상품으로 공개하지 않음.',
    '- 단종 표시, 출시 예정, 비공개, 공식 페이지의 발급 중단 문구가 확인되면 `not_issuable`로 판정함.',
    '- 발급 검증 상태는 상세 혜택의 공식 검증 상태와 별도이며, 발급 확인만으로 추천 계산에 연결하지 않음.',
    ''
  );

  return lines.join('\n');
}

const targetCards = PRIORITY_CREDIT_CARD_BATCH.filter((card) => card.cardGorillaId && card.collectionStatus !== 'official_detail_verified');
const cache = await loadCache();
const results = new Map(Object.entries(cache));
let cursor = 0;
let saveChain = Promise.resolve();

await mkdir(new URL('../.local/', import.meta.url), { recursive: true });

async function persistProgress() {
  const ordered = Object.fromEntries([...results.entries()].sort(([left], [right]) => left.localeCompare(right)));
  saveChain = saveChain.then(() => writeFile(CACHE_URL, JSON.stringify(ordered, null, 2)));
  await saveChain;
}

async function worker() {
  while (cursor < targetCards.length) {
    const index = cursor;
    cursor += 1;
    const card = targetCards[index];
    if (results.has(card.id)) continue;
    const result = await verifyCard(card);
    results.set(card.id, result);
    console.log(`[${results.size}/${targetCards.length}] ${card.issuer} | ${card.name} | ${result.issuanceStatus}`);
    await persistProgress();
  }
}

await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targetCards.length) }, () => worker()));
await saveChain;

const orderedResults = targetCards.map((card) => results.get(card.id)).filter(Boolean);
await writeFile(OUTPUT_URL, renderOutput(orderedResults));
await writeFile(INDEX_OUTPUT_URL, renderIndex(orderedResults));
await writeFile(REPORT_OUTPUT_URL, renderReport(orderedResults));

const statusCounts = orderedResults.reduce((counts, record) => {
  counts[record.issuanceStatus] = (counts[record.issuanceStatus] || 0) + 1;
  return counts;
}, {});

console.log('');
console.log(`# Verified priority credit cards: ${orderedResults.length}/${targetCards.length}`);
for (const [status, count] of Object.entries(statusCounts).sort()) console.log(`- ${status}: ${count}`);
