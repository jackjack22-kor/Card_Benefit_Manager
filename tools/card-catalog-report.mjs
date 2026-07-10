import {
  PUBLIC_CARD_CATALOG,
  PUBLIC_CARD_CATALOG_CHECKED_AT,
  PUBLIC_CARD_CATALOG_DUPLICATE_IDS,
  PUBLIC_CARD_PUBLICATION_CATALOG,
  RAW_PUBLIC_CARD_CATALOG
} from '../src/data/publicCardCatalogIndex.js';

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
console.log(`Raw collected records: ${RAW_PUBLIC_CARD_CATALOG.length}`);
console.log(`Hidden duplicate candidates: ${PUBLIC_CARD_CATALOG_DUPLICATE_IDS.length}`);
console.log(`Publication-safe records: ${PUBLIC_CARD_PUBLICATION_CATALOG.length}`);
console.log(`Publication-safe credit cards: ${PUBLIC_CARD_PUBLICATION_CATALOG.filter((card) => card.productType === 'credit').length}`);
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

const verifiedCards = PUBLIC_CARD_CATALOG.filter((card) => card.collectionStatus === 'official_detail_verified');
console.log('## Official Detail Verified');
for (const card of verifiedCards) {
  console.log(`- ${card.id} | ${card.issuer} | ${card.name} | ${card.verification.verifiedAt} | ${card.source.url}`);
}
console.log('');

const operationalCandidates = PUBLIC_CARD_CATALOG.filter((card) => card.collectionStatus === 'operational_candidate');
console.log('## Operational Check-card Candidates');
console.log(`- total: ${operationalCandidates.length}`);
console.log('');

const candidateSample = PUBLIC_CARD_CATALOG.filter((card) => card.collectionStatus === 'candidate_index').slice(0, 20);
console.log('## Candidate Sample');
for (const card of candidateSample) {
  const benefits = card.summaryBenefits.map((benefit) => benefit.title).filter(Boolean).join(', ') || 'benefits pending';
  console.log(`- ${card.id} | ${card.issuer} | ${card.name} | ${card.productType} | ${card.networks.join(', ') || 'network pending'} | ${benefits}`);
}
