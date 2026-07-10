import {
  PUBLIC_CARD_CATALOG as RAW_PUBLIC_CARD_CATALOG,
  PUBLIC_CARD_CATALOG_CHECKED_AT as RAW_PUBLIC_CARD_CATALOG_CHECKED_AT,
  PUBLIC_CARD_CATALOG_STATUSES as RAW_PUBLIC_CARD_CATALOG_STATUSES
} from './publicCardCatalog.js';
import { PUBLIC_CARD_VERIFICATION_OVERLAYS } from './publicCardVerificationOverlays.js';
import { PUBLIC_CREDIT_CARD_ISSUANCE_INDEX_BY_ID } from './publicCreditCardIssuanceIndex.js';
import { PUBLIC_CARD_PUBLICATION_IMAGES } from './publicCardPublicationImages.js';

const STATUS_ORDER = {
  official_detail_verified: 0,
  official_catalog: 1,
  operational_candidate: 2,
  candidate_index: 3
};
const DUPLICATE_CANDIDATE_IDS = new Set(
  Object.values(PUBLIC_CARD_VERIFICATION_OVERLAYS).flatMap((overlay) => overlay.candidateAliases || [])
);

function applyVerificationOverlay(card) {
  const overlay = PUBLIC_CARD_VERIFICATION_OVERLAYS[card.id];
  const merged = overlay ? {
    ...card,
    ...overlay,
    source: { ...card.source, ...overlay.source },
    verification: { ...(card.verification || {}), ...(overlay.verification || {}) }
  } : card;
  if (card.productType !== 'check') return merged;
  return {
    ...merged,
    collectionStatus: 'operational_candidate',
    calculationStatus: 'catalog_only',
    verification: undefined
  };
}

function applyIssuanceVerification(card) {
  const issuance = PUBLIC_CREDIT_CARD_ISSUANCE_INDEX_BY_ID.get(card.id);
  if (!issuance) return card;
  return {
    ...card,
    officialUrl: issuance.officialUrl || card.officialUrl,
    annualFeeText: issuance.annualFeeText || card.annualFeeText,
    networks: issuance.networks?.length ? issuance.networks : card.networks,
    previousMonthSpend: issuance.previousMonthSpend ?? card.previousMonthSpend,
    summaryBenefits: issuance.summaryBenefits?.length ? issuance.summaryBenefits : card.summaryBenefits,
    issuanceStatus: issuance.issuanceStatus,
    issuanceVerification: {
      checkedAt: issuance.checkedAt,
      detailedBenefitCount: issuance.detailedBenefitCount,
      officialEvidence: issuance.officialEvidence
    }
  };
}

function applyPublicationImage(card) {
  const publicationImage = PUBLIC_CARD_PUBLICATION_IMAGES[card.id];
  return publicationImage ? { ...card, publicationImage } : card;
}

export const PUBLIC_CARD_CATALOG = RAW_PUBLIC_CARD_CATALOG
  .filter((card) => !DUPLICATE_CANDIDATE_IDS.has(card.id))
  .map(applyVerificationOverlay)
  .map(applyIssuanceVerification)
  .map(applyPublicationImage)
  .sort((left, right) => {
    const statusOrder = (STATUS_ORDER[left.collectionStatus] ?? 99) - (STATUS_ORDER[right.collectionStatus] ?? 99);
    if (statusOrder) return statusOrder;
    if (left.issuer !== right.issuer) return left.issuer.localeCompare(right.issuer, 'ko-KR');
    return left.name.localeCompare(right.name, 'ko-KR');
  });

export const PUBLIC_CARD_CATALOG_CHECKED_AT = [
  RAW_PUBLIC_CARD_CATALOG_CHECKED_AT,
  ...Object.values(PUBLIC_CARD_VERIFICATION_OVERLAYS).map((overlay) => overlay.verification?.verifiedAt || overlay.source?.checkedAt || '')
].sort().at(-1);

export const PUBLIC_CARD_CATALOG_STATUSES = [...RAW_PUBLIC_CARD_CATALOG_STATUSES, 'operational_candidate'];

export { RAW_PUBLIC_CARD_CATALOG, RAW_PUBLIC_CARD_CATALOG_CHECKED_AT };

export const PUBLIC_CARD_CATALOG_DUPLICATE_IDS = [...DUPLICATE_CANDIDATE_IDS];

export const PUBLIC_CARD_CATALOG_BY_ID = new Map(PUBLIC_CARD_CATALOG.map((card) => [card.id, card]));

const PUBLIC_ISSUANCE_STATUSES = new Set(['official_application_reachable', 'official_application_url_verified']);

export const PUBLIC_CARD_PUBLICATION_CATALOG = PUBLIC_CARD_CATALOG.filter((card) => {
  if (card.productType === 'check') return card.collectionStatus === 'operational_candidate';
  if (card.isDiscontinued === true) return false;
  return card.collectionStatus === 'official_detail_verified'
    || card.collectionStatus === 'official_catalog'
    || PUBLIC_ISSUANCE_STATUSES.has(card.issuanceStatus);
}).sort((left, right) => {
  if (left.productType !== right.productType) return left.productType === 'credit' ? -1 : 1;
  const statusOrder = (STATUS_ORDER[left.collectionStatus] ?? 99) - (STATUS_ORDER[right.collectionStatus] ?? 99);
  if (statusOrder) return statusOrder;
  if (left.issuer !== right.issuer) return left.issuer.localeCompare(right.issuer, 'ko-KR');
  return left.name.localeCompare(right.name, 'ko-KR');
});
