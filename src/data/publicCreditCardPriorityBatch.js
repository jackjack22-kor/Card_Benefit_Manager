import { PUBLIC_CARD_CATALOG } from './publicCardCatalogIndex.js';
import { PUBLIC_CREDIT_CARD_ISSUANCE_INDEX } from './publicCreditCardIssuanceIndex.js';

export const PRIORITY_CREDIT_CARD_BATCH_CHECKED_AT = '2026-07-10';
export const PRIORITY_CREDIT_CARD_TARGET_PER_ISSUER = 20;
export const PRIORITY_PREMIUM_TARGET_PER_ISSUER = 8;

export const PRIORITY_CREDIT_CARD_ISSUERS = [
  {
    issuer: '삼성카드',
    cardGorillaTeamId: 1,
    officialEntryUrl: 'https://www.samsungcard.com/',
    popularNames: ['삼성 iD SELECT ALL 카드', '삼성카드 & MILEAGE PLATINUM (스카이패스)', '삼성카드 taptap O', '삼성 iD SELECT ON 카드', '삼성 iD GLOBAL 카드']
  },
  {
    issuer: '신한카드',
    cardGorillaTeamId: 2,
    officialEntryUrl: 'https://www.shinhancard.com/',
    popularNames: ['신한카드 Mr.Life', '신한카드 Discount Plan+', '신한카드 처음(ANNIVERSE)', '신한카드 Deep Oil', '신한카드 Simple Plan+']
  },
  {
    issuer: '현대카드',
    cardGorillaTeamId: 7,
    officialEntryUrl: 'https://www.hyundaicard.com/',
    popularNames: ['현대카드 M', '현대카드ZERO Edition3(할인형)', 'American Express Gold Card Edition2', 'the Orange', '현대카드 X']
  },
  {
    issuer: 'KB국민카드',
    cardGorillaTeamId: 3,
    officialEntryUrl: 'https://mapps.kbcard.com/CRD/DVIEW/HCAM0101',
    popularNames: ['굿데이카드', 'KB국민 My WE:SH 카드', 'KB NEED Pay 카드', 'KB YOU Prime 카드', 'KB YOU Wish 카드']
  },
  {
    issuer: '롯데카드',
    cardGorillaTeamId: 4,
    officialEntryUrl: 'https://www.lottecard.co.kr/',
    popularNames: ['LOCA LIKIT 2.0', 'LOCA LIKIT 1.5', 'LOCA 365 카드', '디지로카 London', '디지로카 Las Vegas']
  },
  {
    issuer: '우리카드',
    cardGorillaTeamId: 5,
    officialEntryUrl: 'https://pc.wooricard.com/',
    popularNames: ['카드의정석 SHOPPING+', '카드의정석2', '카드의정석2 SUPER', '카드의정석 EVERY MILE SKYPASS', '스타트래블 우리카드']
  },
  {
    issuer: '하나카드',
    cardGorillaTeamId: 8,
    officialEntryUrl: 'https://www.hanacard.co.kr/',
    popularNames: ['트래블로그+(플러스) 신용카드', '하나 스카이패스 아멕스 플래티늄 카드', 'JADE Classic', '트래블로그 신용카드', 'Mile1 하나카드']
  },
  {
    issuer: 'NH농협카드',
    cardGorillaTeamId: 9,
    officialEntryUrl: 'https://card.nonghyup.com/',
    popularNames: ['올바른 FLEX 카드', 'zgm.streaming카드', '클래시 트래블카드', 'zgm.the pay카드', 'NH20해봄카드']
  },
  {
    issuer: 'IBK기업은행',
    cardGorillaTeamId: 10,
    officialEntryUrl: 'https://www.ibk.co.kr/',
    popularNames: ['K-패스 (신용)', 'IBK포인트(신용)', 'IBK포인트3.8(신용)', 'I-Mileage (대한항공)', 'I-ALL']
  },
  {
    issuer: 'BC 바로카드',
    cardGorillaTeamId: 32,
    officialEntryUrl: 'https://www.bccard.com/',
    popularNames: ['BC 바로 MACAO 카드', 'BC 바로 ZONE 카드', 'BC 바로 Air Max 카드', 'BC 바로 Air Master 카드', 'BC 바로 On&Off 카드']
  }
];

const PREMIUM_NAME_KEYWORDS = [
  'premium', 'platinum', 'signature', 'reserve', 'classic', 'the best', 'the ace',
  'the 1', 'the id.', 'heritage', 'bev', 'jade', 'bliss', 'professional', '위카드',
  '테라카드', '메리어트', '힐튼'
];

function normalizeName(value) {
  return String(value || '')
    .toLocaleLowerCase('ko-KR')
    .replace(/삼성카드|신한카드|현대카드|kb국민카드|롯데카드|우리카드|하나카드|nh농협카드|ibk기업은행|bc바로카드/g, '')
    .replace(/[™®\s()[\]{}._:-]/g, '');
}

function namesMatch(left, right) {
  const normalizedLeft = normalizeName(left);
  const normalizedRight = normalizeName(right);
  return normalizedLeft === normalizedRight;
}

export function getAnnualFeeMaximum(annualFeeText) {
  const amounts = [...String(annualFeeText || '').matchAll(/[\d,]+(?=\s*원)/g)]
    .map((match) => Number(match[0].replaceAll(',', '')))
    .filter(Number.isFinite);
  return amounts.length ? Math.max(...amounts) : 0;
}

export function isPremiumCreditCard(card) {
  const normalizedName = String(card.name || '').toLocaleLowerCase('ko-KR');
  return getAnnualFeeMaximum(card.annualFeeText) >= 100000
    || PREMIUM_NAME_KEYWORDS.some((keyword) => normalizedName.includes(keyword));
}

function popularityRank(card, config) {
  const rank = config.popularNames.findIndex((name) => namesMatch(card.name, name));
  return rank >= 0 ? rank + 1 : null;
}

function recencyScore(releasedAt) {
  const year = Number(String(releasedAt || '').slice(0, 4));
  return Number.isFinite(year) ? Math.max(0, year - 2020) * 5 : 0;
}

function representativeScore(card, config) {
  const rank = popularityRank(card, config);
  const maxAnnualFee = getAnnualFeeMaximum(card.annualFeeText);
  let score = 0;
  if (card.collectionStatus === 'official_detail_verified') score += 1000;
  if (card.collectionStatus === 'official_catalog') score += 500;
  if (rank) score += 800 - rank * 25;
  if (isPremiumCreditCard(card)) score += 180 + Math.min(120, Math.floor(maxAnnualFee / 10000));
  if (card.networks?.length) score += 20;
  if (card.summaryBenefits?.length >= 3) score += 20;
  score += recencyScore(card.releasedAt);
  return score;
}

function availabilityStatus(card) {
  if (card.collectionStatus === 'official_detail_verified') return 'officially_issuable';
  if (card.collectionStatus === 'official_catalog') return 'officially_listed';
  if (card.issuanceStatus) return card.issuanceStatus;
  return 'pending_official_check';
}

function selectIssuerBatch(config, catalog) {
  const candidates = catalog
    .filter((card) => card.issuer === config.issuer && card.productType === 'credit' && card.isDiscontinued !== true)
    .map((card) => ({
      ...card,
      popularityRank: popularityRank(card, config),
      premium: isPremiumCreditCard(card),
      maxAnnualFee: getAnnualFeeMaximum(card.annualFeeText),
      priorityScore: representativeScore(card, config)
    }))
    .sort((left, right) => right.priorityScore - left.priorityScore || left.name.localeCompare(right.name, 'ko-KR'));

  const selected = [];
  const selectedIds = new Set();
  const add = (card, reason) => {
    if (!card || selectedIds.has(card.id) || selected.length >= PRIORITY_CREDIT_CARD_TARGET_PER_ISSUER) return;
    selectedIds.add(card.id);
    selected.push({
      ...card,
      selectionReason: reason,
      availabilityStatus: availabilityStatus(card),
      officialEntryUrl: config.officialEntryUrl,
      popularitySourceUrl: `https://www.card-gorilla.com/team/detail/${config.cardGorillaTeamId}`
    });
  };

  const frozenCandidateIds = PUBLIC_CREDIT_CARD_ISSUANCE_INDEX
    .filter((record) => record.issuer === config.issuer)
    .map((record) => record.cardId);
  if (frozenCandidateIds.length) {
    let premiumSelectionCount = 0;
    for (const cardId of frozenCandidateIds) {
      const card = candidates.find((candidate) => candidate.id === cardId);
      if (!card) continue;
      let reason = card.popularityRank ? 'popular_rank' : 'representative_candidate';
      if (card.popularityRank && card.premium) premiumSelectionCount += 1;
      if (!card.popularityRank && card.premium && premiumSelectionCount < PRIORITY_PREMIUM_TARGET_PER_ISSUER) {
        reason = 'premium_line';
        premiumSelectionCount += 1;
      }
      add(card, reason);
    }
    candidates.filter((card) => card.collectionStatus === 'official_detail_verified').forEach((card) => add(card, 'official_detail_verified'));
    candidates.filter((card) => card.collectionStatus === 'official_catalog').forEach((card) => add(card, 'official_catalog'));
    return selected;
  }

  candidates.filter((card) => card.popularityRank).sort((left, right) => left.popularityRank - right.popularityRank).forEach((card) => add(card, 'popular_rank'));
  candidates.filter((card) => card.collectionStatus === 'official_detail_verified').forEach((card) => add(card, 'official_detail_verified'));
  candidates.filter((card) => card.collectionStatus === 'official_catalog').forEach((card) => add(card, 'official_catalog'));
  for (const card of candidates.filter((candidate) => candidate.premium)) {
    if (selected.filter((candidate) => candidate.premium).length >= PRIORITY_PREMIUM_TARGET_PER_ISSUER) break;
    add(card, 'premium_line');
  }
  candidates.filter((card) => !card.premium).forEach((card) => add(card, 'representative_candidate'));
  candidates.filter((card) => card.premium).forEach((card) => add(card, 'representative_candidate'));

  return selected;
}

export const PRIORITY_CREDIT_CARD_BATCH = PRIORITY_CREDIT_CARD_ISSUERS.flatMap((config) => selectIssuerBatch(config, PUBLIC_CARD_CATALOG));

export const PRIORITY_CREDIT_CARD_BATCH_BY_ISSUER = Object.fromEntries(
  PRIORITY_CREDIT_CARD_ISSUERS.map((config) => [
    config.issuer,
    PRIORITY_CREDIT_CARD_BATCH.filter((card) => card.issuer === config.issuer)
  ])
);
