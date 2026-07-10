import { CARDS, CARD_MAP } from '../data/cards.js';

export function getCatalogOwnershipId(card) {
  const modeledId = String(card?.verification?.relatedCardModelId || '');
  return modeledId && CARD_MAP[modeledId] ? modeledId : String(card?.id || '');
}

export function createOwnedCatalogCard(card) {
  const id = getCatalogOwnershipId(card);
  if (!id || CARD_MAP[id]) return CARD_MAP[id] || null;

  const previousMonthSpend = Math.max(0, Number(card.previousMonthSpend || card.defaultMonthlyTarget || 0));
  const image = sanitizeImageUrl(card.publicationImage || card.localImage || card.imageUrl || card.image);
  const summaryBenefits = sanitizeSummaryBenefits(card.summaryBenefits || card.catalogSummaryBenefits);
  const checkedAt = String(card.verification?.verifiedAt || card.source?.checkedAt || '');
  const sourceStatus = card.source?.status || (card.collectionStatus === 'official_detail_verified'
    ? 'official_verified'
    : 'needs_official_recheck');

  return {
    id,
    issuer: String(card.issuer || '카드사 확인 필요'),
    name: String(card.name || '카드명 확인 필요'),
    shortName: String(card.name || '카드명 확인 필요'),
    productType: card.productType === 'check' ? 'check' : 'credit',
    theme: 'catalog',
    image,
    annualFee: Number(card.annualFee || parseAnnualFee(card.annualFeeText)),
    annualFeeText: String(card.annualFeeText || ''),
    defaultCycle: { type: 'calendar', startMonth: 1 },
    monthlyTargets: previousMonthSpend ? [previousMonthSpend] : [],
    defaultMonthlyTarget: previousMonthSpend,
    annualTargets: [],
    tags: [...new Set(summaryBenefits.flatMap((benefit) => benefit.tags))],
    networks: Array.isArray(card.networks) ? card.networks.map(String).filter(Boolean) : [],
    sourceNote: '공개 카드목록에서 추가한 카드입니다. 공식 상세 검증 전에는 혜택 추천 계산에 반영하지 않습니다.',
    source: {
      status: sourceStatus,
      checkedAt,
      url: sanitizeHttpsUrl(card.officialUrl || card.referenceUrl || card.source?.url),
      note: String(card.source?.note || '공개 카드목록 수집 정보')
    },
    catalogOnly: true,
    calculationStatus: 'catalog_only',
    catalogSummaryBenefits: summaryBenefits,
    benefits: []
  };
}

export function createDefaultCardOverride(card) {
  const startMonth = Number(card?.defaultCycle?.startMonth || 1);
  return {
    prevMonthStatus: 'met',
    currentMonthSpend: 0,
    monthlyTarget: Number(card?.defaultMonthlyTarget || 0),
    monthlyTargetUserSet: false,
    monthlyTargetUpdatedAt: '',
    annualSpend: 0,
    annualSpendUserSet: false,
    annualSpendUpdatedAt: '',
    annualTarget: Number(card?.annualTargets?.[0] || 0),
    annualTargetUserSet: false,
    annualTargetUpdatedAt: '',
    cycleTypeUserSet: false,
    cycleTypeUpdatedAt: '',
    annualFeeStartMonthUserSet: false,
    annualFeeStartMonthUpdatedAt: '',
    cycle: {
      ...(card?.defaultCycle || { type: 'calendar', startMonth: 1 }),
      annualFeeStartMonth: startMonth,
      issueMonth: startMonth
    },
    memo: '',
    memoUserSet: false,
    memoUpdatedAt: ''
  };
}

export function getRuntimeCardMap(state = {}) {
  return new Map([
    ...CARDS.map((card) => [card.id, card]),
    ...Object.entries(state.ownedCatalogCards || {})
  ]);
}

export function getRuntimeCardById(state, cardId) {
  return getRuntimeCardMap(state).get(cardId) || null;
}

export function sanitizeOwnedCatalogCards(cards = {}) {
  return Object.fromEntries(Object.entries(cards || {})
    .filter(([id, card]) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && card && typeof card === 'object' && !CARD_MAP[id])
    .map(([id, card]) => {
      const normalized = createOwnedCatalogCard({ ...card, id });
      return normalized ? [id, normalized] : null;
    })
    .filter(Boolean));
}

function sanitizeSummaryBenefits(benefits) {
  return (Array.isArray(benefits) ? benefits : []).slice(0, 12).map((benefit) => ({
    title: String(benefit?.title || '혜택'),
    tags: (Array.isArray(benefit?.tags) ? benefit.tags : []).map(String).filter(Boolean).slice(0, 8)
  }));
}

function parseAnnualFee(text) {
  const match = String(text || '').match(/([\d,]+)\s*원/);
  return match ? Number(match[1].replace(/,/g, '')) : 0;
}

function sanitizeImageUrl(value) {
  const url = String(value || '').trim();
  return /^image\/[a-z0-9/_-]+\.png$/i.test(url) || url.startsWith('https://') ? url : '';
}

function sanitizeHttpsUrl(value) {
  const url = String(value || '').trim();
  return url.startsWith('https://') ? url : '';
}
