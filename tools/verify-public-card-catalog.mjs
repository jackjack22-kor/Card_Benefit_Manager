import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { CARDS } from '../src/data/cards.js';
import { PUBLIC_CARD_CATALOG_BY_ID, PUBLIC_CARD_CATALOG_DUPLICATE_IDS, PUBLIC_CARD_PUBLICATION_CATALOG, RAW_PUBLIC_CARD_CATALOG } from '../src/data/publicCardCatalogIndex.js';
import { PUBLIC_CARD_VERIFICATION_OVERLAYS } from '../src/data/publicCardVerificationOverlays.js';
import { PRIORITY_CREDIT_CARD_BATCH } from '../src/data/publicCreditCardPriorityBatch.js';

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
const discontinuedVerified = verified.filter((card) => card.isDiscontinued === true);
const currentlyIssuablePriorityCards = PRIORITY_CREDIT_CARD_BATCH.filter((card) => card.availabilityStatus === 'officially_issuable');
const reachablePriorityCards = PRIORITY_CREDIT_CARD_BATCH.filter((card) => card.availabilityStatus === 'official_application_reachable');
const verifiedUrlPriorityCards = PRIORITY_CREDIT_CARD_BATCH.filter((card) => card.availabilityStatus === 'official_application_url_verified');
const unconfirmedPriorityCards = PRIORITY_CREDIT_CARD_BATCH.filter((card) => card.availabilityStatus === 'official_application_not_confirmed');
const publishedCreditCards = PUBLIC_CARD_PUBLICATION_CATALOG.filter((card) => card.productType === 'credit');
assert.equal(verified.length, verifiedOverlays.length, 'effective verified count must match credit-card verification overlays');
assert.ok(verified.every((card) => card.productType === 'credit'), 'only credit cards may be officially verified');
assert.ok(operationalCheckCards.every((card) => card.collectionStatus === 'operational_candidate'), 'all check cards must remain operational candidates');
assert.ok(PRIORITY_CREDIT_CARD_BATCH.every((card) => card.isDiscontinued !== true), 'priority verification batch must exclude discontinued cards');
assert.ok(currentlyIssuablePriorityCards.every((card) => card.collectionStatus === 'official_detail_verified'), 'officially issuable priority cards require official detail verification');
assert.ok(discontinuedVerified.every((card) => !PRIORITY_CREDIT_CARD_BATCH.some((candidate) => candidate.id === card.id)), 'discontinued verified cards must stay outside the priority batch');
assert.equal(reachablePriorityCards.length, 94, 'all reachable official application pages are tracked');
assert.equal(verifiedUrlPriorityCards.length, 13, 'blocked official application URLs are tracked separately');
assert.equal(unconfirmedPriorityCards.length, 83, 'unconfirmed application records remain excluded');
assert.equal(publishedCreditCards.length, 117, 'publication catalog includes 107 issuance-confirmed candidates and 10 official records');
assert.ok(publishedCreditCards.every((card) => card.isDiscontinued !== true), 'publication credit cards exclude discontinued products');
assert.ok(publishedCreditCards.every((card) => card.issuanceStatus !== 'official_application_not_confirmed'), 'publication credit cards exclude unconfirmed application records');
assert.equal(new Set(PUBLIC_CARD_CATALOG_DUPLICATE_IDS).size, PUBLIC_CARD_CATALOG_DUPLICATE_IDS.length, 'candidate aliases must be unique');

console.log(`ok - official detail verification records: ${verified.length}`);
console.log(`ok - currently issuable priority cards: ${currentlyIssuablePriorityCards.length}`);
console.log(`ok - official application pages reachable: ${reachablePriorityCards.length}`);
console.log(`ok - official application URLs verified, probe blocked: ${verifiedUrlPriorityCards.length}`);
console.log(`ok - official application not confirmed, publication excluded: ${unconfirmedPriorityCards.length}`);
console.log(`ok - published credit-card candidates: ${publishedCreditCards.length}`);
console.log(`ok - discontinued cards retained as verification history only: ${discontinuedVerified.length}`);
console.log(`ok - operational check-card candidates: ${operationalCheckCards.length}`);
for (const card of verified) {
  const scope = card.isDiscontinued ? 'historical/discontinued' : 'priority issuable';
  console.log(`- ${card.id} | ${card.issuer} | ${card.name} | ${scope} | ${card.verification.verifiedAt}`);
}
