import { writeFile } from 'node:fs/promises';

const CHECKED_AT = '2026-07-09';
const CARD_GORILLA_API = 'https://api.card-gorilla.com/v1/cards';
const CARD_GORILLA_HOME = 'https://www.card-gorilla.com/home';
const KB_CREDIT_LIST_URL = 'https://card.kbcard.com/CRD/DVIEW/HCAMCXPRICAC0047';
const KB_CHECK_LIST_URL = 'https://card.kbcard.com/CRD/DVIEW/HCAMCXPRICAC0056';

const KB_OFFICIAL_CARDS = [
  ['credit', '09297', 'WE:SH All+ 카드', 'https://img1.kbcard.com/ST/img/cxc/kbcard/upload/img/product/09297_img.png'],
  ['credit', '09922', 'ALL 카드', 'https://img1.kbcard.com/ST/img/cxc/kbcard/upload/img/product/09922_img.png'],
  ['credit', '09570', 'WE:SH Daily 카드', 'https://img1.kbcard.com/ST/img/cxc/kbcard/upload/img/product/09570_img.png'],
  ['credit', '09162', 'ALL point 카드', 'https://img1.kbcard.com/ST/img/cxc/kbcard/upload/img/product/09162_img.png'],
  ['credit', '09137', 'NEED Global 카드', 'https://img1.kbcard.com/ST/img/cxc/kbcard/upload/img/product/09137_img.png'],
  ['credit', '09250', 'The Easy카드', 'https://img1.kbcard.com/ST/img/cxc/kbcard/upload/img/product/09250_img.png'],
  ['credit', '09247', '마이핏카드(적립형)', 'https://img1.kbcard.com/ST/img/cxc/kbcard/upload/img/product/09247_img.png'],
  ['credit', '09113', 'KB Pay 챌린지카드', 'https://img1.kbcard.com/ST/img/cxc/kbcard/upload/img/product/09113_img.png'],
  ['credit', '09114', 'KB Pay 챌린지+카드', 'https://img1.kbcard.com/ST/img/cxc/kbcard/upload/img/product/09114_img.png'],
  ['credit', '04350', 'toss KB국민카드', 'https://img1.kbcard.com/ST/img/cxc/kbcard/upload/img/product/04350_img.png'],
  ['check', '04124', 'Youth Club 체크카드', 'https://img1.kbcard.com/ST/img/cxc/kbcard/upload/img/product/04124_img.png'],
  ['check', '07964', '노리2 체크카드(KB Pay)', 'https://img1.kbcard.com/ST/img/cxc/kbcard/upload/img/product/07964_img.png'],
  ['check', '09562', '트래블러스 체크카드', 'https://img1.kbcard.com/ST/img/cxc/kbcard/upload/img/product/69562_img.png'],
  ['check', '09659', '틴업 체크카드', 'https://img1.kbcard.com/ST/img/cxc/kbcard/upload/img/product/09659_img.png'],
  ['check', '01914', '첵첵 체크카드', 'https://img1.kbcard.com/ST/img/cxc/kbcard/upload/img/product/01914_img.png']
];

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Fetch failed: ${response.status} ${url}`);
  return response.json();
}

async function collectCardGorillaCategory(cate) {
  const perPage = 200;
  const first = await fetchJson(`${CARD_GORILLA_API}?p=1&perPage=${perPage}&cate=${cate}`);
  const pages = Math.ceil(first.total / perPage);
  const records = [...first.data];

  for (let page = 2; page <= pages; page += 1) {
    const next = await fetchJson(`${CARD_GORILLA_API}?p=${page}&perPage=${perPage}&cate=${cate}`);
    records.push(...next.data);
  }

  return records;
}

function compactBenefit(benefit) {
  return {
    title: benefit.title || '',
    tags: Array.isArray(benefit.tags) ? benefit.tags.filter(Boolean) : []
  };
}

function normalizeCandidate(card) {
  const productType = card.cate === 'CHK' ? 'check' : 'credit';
  return {
    id: `cg-${String(card.cate || 'card').toLowerCase()}-${card.idx}`,
    issuer: card.corp_txt || card.corp?.name || '',
    issuerCode: card.corp?.name_eng || '',
    name: card.name || '',
    productType,
    collectionStatus: 'candidate_index',
    cardGorillaId: card.idx,
    cardGorillaCid: card.cid || '',
    referenceUrl: `https://www.card-gorilla.com/card/detail/${card.idx}`,
    imageUrl: card.card_img?.url || '',
    networks: String(card.brands_txt || card.brand_txt || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    annualFeeText: card.annual_fee_basic || '',
    previousMonthSpend: Number.isFinite(Number(card.pre_month_money)) ? Number(card.pre_month_money) : null,
    releasedAt: card.release_dt || '',
    isDiscontinued: Boolean(card.is_discon),
    summaryBenefits: Array.isArray(card.top_benefit) ? card.top_benefit.map(compactBenefit) : [],
    source: {
      type: 'third_party_index',
      label: 'CardGorilla card search API',
      url: CARD_GORILLA_HOME,
      checkedAt: CHECKED_AT,
      note: '대량 후보 인덱스입니다. 배포용 상세 계산에 쓰기 전 카드사 공식 상품설명서 또는 공식 상세 페이지 검증이 필요합니다.'
    }
  };
}

function normalizeKbOfficial([productType, code, name, imageUrl]) {
  const listUrl = productType === 'check' ? KB_CHECK_LIST_URL : KB_CREDIT_LIST_URL;
  return {
    id: `kb-${code}`,
    issuer: 'KB국민카드',
    issuerCode: 'kb',
    name,
    productType,
    collectionStatus: 'official_catalog',
    issuerProductCode: code,
    officialUrl: `https://card.kbcard.com/CRD/DVIEW/HCAMCXPRICAC0076?mainCC=a&cooperationcode=${code}`,
    imageUrl,
    networks: [],
    annualFeeText: '',
    previousMonthSpend: null,
    releasedAt: '',
    isDiscontinued: false,
    summaryBenefits: [],
    source: {
      type: 'official_issuer_catalog',
      label: productType === 'check' ? 'KB국민카드 체크카드 목록' : 'KB국민카드 신용카드 목록',
      url: listUrl,
      checkedAt: CHECKED_AT,
      note: '카드사 공식 목록에서 상품명, 상품코드, 이미지 URL을 확인했습니다. 상세 혜택/연회비/전월실적은 공식 상세 페이지 또는 상품설명서로 추가 검증해야 합니다.'
    }
  };
}

function renderCatalog(records) {
  return `export const PUBLIC_CARD_CATALOG_CHECKED_AT = ${JSON.stringify(CHECKED_AT)};\n\n`
    + "export const PUBLIC_CARD_CATALOG_STATUSES = ['official_catalog', 'candidate_index', 'official_detail_verified'];\n\n"
    + `export const PUBLIC_CARD_CATALOG = ${JSON.stringify(records, null, 2)};\n\n`
    + 'export const PUBLIC_CARD_CATALOG_BY_ID = new Map(PUBLIC_CARD_CATALOG.map((card) => [card.id, card]));\n';
}

const [creditCards, checkCards] = await Promise.all([
  collectCardGorillaCategory('CRD'),
  collectCardGorillaCategory('CHK')
]);

const officialCards = KB_OFFICIAL_CARDS.map(normalizeKbOfficial);
const candidateCards = [...creditCards, ...checkCards].map(normalizeCandidate);
const catalog = [...officialCards, ...candidateCards].sort((a, b) => {
  if (a.collectionStatus !== b.collectionStatus) return a.collectionStatus.localeCompare(b.collectionStatus);
  if (a.issuer !== b.issuer) return a.issuer.localeCompare(b.issuer, 'ko');
  return a.name.localeCompare(b.name, 'ko');
});

await writeFile(new URL('../src/data/publicCardCatalog.js', import.meta.url), renderCatalog(catalog));

console.log(`Collected public catalog records: ${catalog.length}`);
console.log(`- official_catalog: ${officialCards.length}`);
console.log(`- candidate_index: ${candidateCards.length}`);
