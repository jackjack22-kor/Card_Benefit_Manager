import {
  PUBLIC_CARD_CATALOG as RAW_PUBLIC_CARD_CATALOG,
  PUBLIC_CARD_CATALOG_CHECKED_AT as RAW_PUBLIC_CARD_CATALOG_CHECKED_AT,
  PUBLIC_CARD_CATALOG_STATUSES
} from './publicCardCatalog.js';
import { PUBLIC_CARD_VERIFICATION_OVERLAYS } from './publicCardVerificationOverlays.js';

const STATUS_ORDER = {
  official_detail_verified: 0,
  official_catalog: 1,
  candidate_index: 2
};
const DUPLICATE_CANDIDATE_IDS = new Set(
  Object.values(PUBLIC_CARD_VERIFICATION_OVERLAYS).flatMap((overlay) => overlay.candidateAliases || [])
);

function applyVerificationOverlay(card) {
  const overlay = PUBLIC_CARD_VERIFICATION_OVERLAYS[card.id];
  if (!overlay) return card;
  return {
    ...card,
    ...overlay,
    source: { ...card.source, ...overlay.source },
    verification: { ...(card.verification || {}), ...(overlay.verification || {}) }
  };
}

export const PUBLIC_CARD_CATALOG = RAW_PUBLIC_CARD_CATALOG
  .filter((card) => !DUPLICATE_CANDIDATE_IDS.has(card.id))
  .map(applyVerificationOverlay)
  .sort((left, right) => {
    const statusOrder = (STATUS_ORDER[left.collectionStatus] ?? 99) - (STATUS_ORDER[right.collectionStatus] ?? 99);
    if (statusOrder) return statusOrder;
    if (left.issuer !== right.issuer) return left.issuer.localeCompare(right.issuer, 'ko-KR');
    return left.name.localeCompare(right.name, 'ko-KR');
  });

export const PUBLIC_CARD_CATALOG_CHECKED_AT = [
  RAW_PUBLIC_CARD_CATALOG_CHECKED_AT,
  ...Object.values(PUBLIC_CARD_VERIFICATION_OVERLAYS).map((overlay) => overlay.verification?.verifiedAt || '')
].sort().at(-1);

export { PUBLIC_CARD_CATALOG_STATUSES, RAW_PUBLIC_CARD_CATALOG, RAW_PUBLIC_CARD_CATALOG_CHECKED_AT };

export const PUBLIC_CARD_CATALOG_DUPLICATE_IDS = [...DUPLICATE_CANDIDATE_IDS];

export const PUBLIC_CARD_CATALOG_BY_ID = new Map(PUBLIC_CARD_CATALOG.map((card) => [card.id, card]));
