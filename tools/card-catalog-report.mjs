import { PUBLIC_CARD_CATALOG, PUBLIC_CARD_CATALOG_CHECKED_AT } from '../src/data/publicCardCatalog.js';

const byIssuer = new Map();
const byStatus = new Map();
const byType = new Map();

for (const card of PUBLIC_CARD_CATALOG) {
  byIssuer.set(card.issuer, (byIssuer.get(card.issuer) || 0) + 1);
  byStatus.set(card.collectionStatus, (byStatus.get(card.collectionStatus) || 0) + 1);
  byType.set(card.productType, (byType.get(card.productType) || 0) + 1);
}

function printCounts(title, counts, locale = 'ko') {
  console.log(`## ${title}`);
  for (const [key, count] of [...counts.entries()].sort(([a], [b]) => a.localeCompare(b, locale))) {
    console.log(`- ${key}: ${count}`);
  }
  console.log('');
}

console.log('# Public Card Catalog');
console.log('');
console.log(`Checked at: ${PUBLIC_CARD_CATALOG_CHECKED_AT}`);
console.log(`Total records: ${PUBLIC_CARD_CATALOG.length}`);
console.log('');
printCounts('By Status', byStatus);
printCounts('By Product Type', byType);
printCounts('By Issuer', byIssuer);

const officialCards = PUBLIC_CARD_CATALOG.filter((card) => card.collectionStatus === 'official_catalog');
console.log('## Official Catalog Seeds');
for (const card of officialCards) {
  console.log(`- ${card.id} | ${card.issuer} | ${card.name} | ${card.productType} | ${card.source.url}`);
}
console.log('');

const candidateSample = PUBLIC_CARD_CATALOG.filter((card) => card.collectionStatus === 'candidate_index').slice(0, 20);
console.log('## Candidate Sample');
for (const card of candidateSample) {
  const benefits = card.summaryBenefits.map((benefit) => benefit.title).filter(Boolean).join(', ') || 'benefits pending';
  console.log(`- ${card.id} | ${card.issuer} | ${card.name} | ${card.productType} | ${card.networks.join(', ') || 'network pending'} | ${benefits}`);
}
