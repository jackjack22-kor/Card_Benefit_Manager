import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { CARDS } from '../src/data/cards.js';
import { PUBLIC_CARD_CATALOG_BY_ID, PUBLIC_CARD_CATALOG_DUPLICATE_IDS, RAW_PUBLIC_CARD_CATALOG } from '../src/data/publicCardCatalogIndex.js';
import { PUBLIC_CARD_VERIFICATION_OVERLAYS } from '../src/data/publicCardVerificationOverlays.js';

const rawIds = new Set(RAW_PUBLIC_CARD_CATALOG.map((card) => card.id));
const calculationCardIds = new Set(CARDS.map((card) => card.id));
const requiredVerifiedFields = ['annualFee', 'networks', 'previousMonthSpend', 'benefits', 'exclusions'];
const overlayEntries = Object.entries(PUBLIC_CARD_VERIFICATION_OVERLAYS);

for (const [cardId, overlay] of overlayEntries) {
  assert.ok(rawIds.has(cardId), `verification overlay points to an unknown card: ${cardId}`);
  const rawCard = RAW_PUBLIC_CARD_CATALOG.find((card) => card.id === cardId);
  for (const aliasId of overlay.candidateAliases || []) {
    assert.ok(rawIds.has(aliasId), `candidate alias points to an unknown card: ${cardId}:${aliasId}`);
    assert.notEqual(aliasId, cardId, `candidate alias cannot point to itself: ${cardId}`);
  }
  if (overlay.collectionStatus === 'operational_candidate') {
    assert.equal(rawCard?.productType, 'check', `operational candidate must be a check card: ${cardId}`);
    assert.equal(overlay.calculationStatus, 'catalog_only', `operational candidate cannot enable calculation: ${cardId}`);
    assert.equal(overlay.verification, undefined, `operational candidate cannot claim official verification: ${cardId}`);
    continue;
  }

  assert.equal(rawCard?.productType, 'credit', `official verification is limited to credit cards: ${cardId}`);
  assert.equal(overlay.collectionStatus, 'official_detail_verified', `overlay status must be verified: ${cardId}`);
  assert.ok(/^https:\/\//.test(overlay.officialUrl || PUBLIC_CARD_CATALOG_BY_ID.get(cardId)?.officialUrl || ''), `official URL is required: ${cardId}`);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(overlay.verification?.verifiedAt || ''), `verifiedAt is required: ${cardId}`);
  assert.ok(overlay.verification?.method?.startsWith('official_'), `official verification method is required: ${cardId}`);
  assert.ok(Array.isArray(overlay.verification?.fields), `verified fields are required: ${cardId}`);
  for (const field of requiredVerifiedFields) {
    assert.ok(overlay.verification.fields.includes(field), `verified field ${field} is required: ${cardId}`);
  }
  assert.ok(Array.isArray(overlay.networks) && overlay.networks.length > 0, `verified networks are required: ${cardId}`);
  assert.ok(overlay.annualFeeText, `verified annual fee is required: ${cardId}`);
  assert.ok(String(overlay.localImage || '').startsWith('image/clean/'), `verified local image is required: ${cardId}`);
  assert.ok(existsSync(new URL(`../${overlay.localImage}`, import.meta.url)), `verified local image must exist: ${cardId}`);
  assert.ok(Array.isArray(overlay.summaryBenefits) && overlay.summaryBenefits.length >= 3, `verified benefit summary is required: ${cardId}`);
  assert.equal(overlay.source?.type, 'official_issuer_detail', `verified source type is required: ${cardId}`);
  assert.equal(overlay.source?.checkedAt, overlay.verification.verifiedAt, `source date must match verification date: ${cardId}`);
  assert.ok(['catalog_only', 'modeled'].includes(overlay.calculationStatus), `calculation status is required: ${cardId}`);
  if (overlay.calculationStatus === 'modeled') {
    assert.ok(calculationCardIds.has(overlay.verification?.relatedCardModelId), `modeled card must link to a calculation model: ${cardId}`);
    const calculationCard = CARDS.find((card) => card.id === overlay.verification.relatedCardModelId);
    assert.equal(calculationCard.source?.status, 'official_verified', `linked calculation model must be officially verified: ${cardId}`);
  } else {
    assert.equal(overlay.verification?.relatedCardModelId, undefined, `catalog-only card must not claim a calculation model: ${cardId}`);
  }
}

const verified = [...PUBLIC_CARD_CATALOG_BY_ID.values()].filter((card) => card.collectionStatus === 'official_detail_verified');
const verifiedOverlays = overlayEntries.filter(([, overlay]) => overlay.collectionStatus === 'official_detail_verified');
const operationalCheckCards = [...PUBLIC_CARD_CATALOG_BY_ID.values()].filter((card) => card.productType === 'check');
assert.equal(verified.length, verifiedOverlays.length, 'effective verified count must match credit-card verification overlays');
assert.ok(verified.every((card) => card.productType === 'credit'), 'only credit cards may be officially verified');
assert.ok(operationalCheckCards.every((card) => card.collectionStatus === 'operational_candidate'), 'all check cards must remain operational candidates');
assert.equal(new Set(PUBLIC_CARD_CATALOG_DUPLICATE_IDS).size, PUBLIC_CARD_CATALOG_DUPLICATE_IDS.length, 'candidate aliases must be unique');

console.log(`ok - verified public card overlays: ${verified.length}`);
console.log(`ok - operational check-card candidates: ${operationalCheckCards.length}`);
for (const card of verified) console.log(`- ${card.id} | ${card.issuer} | ${card.name} | ${card.verification.verifiedAt}`);
