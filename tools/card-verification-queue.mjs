import { PUBLIC_CARD_CATALOG } from '../src/data/publicCardCatalogIndex.js';
import {
  PRIORITY_CREDIT_CARD_BATCH,
  PRIORITY_CREDIT_CARD_BATCH_BY_ISSUER,
  PRIORITY_CREDIT_CARD_BATCH_CHECKED_AT,
  PRIORITY_CREDIT_CARD_ISSUERS,
  PRIORITY_CREDIT_CARD_TARGET_PER_ISSUER
} from '../src/data/publicCreditCardPriorityBatch.js';

const statusLabels = {
  officially_issuable: 'official detail verified',
  officially_listed: 'official catalog listed; detail pending',
  pending_official_check: 'official issuance check pending'
};

const creditCards = PUBLIC_CARD_CATALOG.filter((card) => card.productType === 'credit');
const discontinuedCreditCards = creditCards.filter((card) => card.isDiscontinued === true);
const pendingOfficialCheck = PRIORITY_CREDIT_CARD_BATCH.filter((card) => card.availabilityStatus === 'pending_official_check');

console.log('# Priority Credit Card Verification Batch');
console.log('');
console.log(`Snapshot: ${PRIORITY_CREDIT_CARD_BATCH_CHECKED_AT}`);
console.log(`Scope: ${PRIORITY_CREDIT_CARD_ISSUERS.length} issuers x ${PRIORITY_CREDIT_CARD_TARGET_PER_ISSUER} currently non-discontinued credit-card candidates`);
console.log(`Selected: ${PRIORITY_CREDIT_CARD_BATCH.length}`);
console.log(`Officially issuable: ${PRIORITY_CREDIT_CARD_BATCH.filter((card) => card.availabilityStatus === 'officially_issuable').length}`);
console.log(`Officially listed, detail pending: ${PRIORITY_CREDIT_CARD_BATCH.filter((card) => card.availabilityStatus === 'officially_listed').length}`);
console.log(`Official issuance check pending: ${pendingOfficialCheck.length}`);
console.log(`Excluded discontinued credit cards: ${discontinuedCreditCards.length}`);
console.log(`Operational check-card candidates outside this batch: ${PUBLIC_CARD_CATALOG.filter((card) => card.productType === 'check').length}`);
console.log('');
console.log('## Selection Rules');
console.log('- Credit cards only; check cards remain operational candidates.');
console.log('- Records marked discontinued are excluded even if old detail data exists.');
console.log('- CardGorilla issuer ranking is a popularity signal, not issuance proof.');
console.log('- Issuance is confirmed only from the issuer official product/application page.');
console.log('- Premium lines are selected by official line naming and annual fee, then the batch is filled with representative candidates.');

for (const config of PRIORITY_CREDIT_CARD_ISSUERS) {
  const cards = PRIORITY_CREDIT_CARD_BATCH_BY_ISSUER[config.issuer];
  console.log('');
  console.log(`## ${config.issuer} (${cards.length})`);
  console.log(`Popularity: https://www.card-gorilla.com/team/detail/${config.cardGorillaTeamId}`);
  console.log(`Official entry: ${config.officialEntryUrl}`);
  for (const card of cards) {
    const tags = [card.selectionReason, card.premium ? 'premium' : null, statusLabels[card.availabilityStatus]].filter(Boolean).join(', ');
    console.log(`- ${card.id} | ${card.name} | ${tags} | ${card.officialUrl || card.referenceUrl}`);
  }
}
