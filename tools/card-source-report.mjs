import { CARDS } from '../src/data/cards.js';

const byIssuer = new Map();
const byStatus = new Map();
const operationalCandidates = CARDS.filter((card) => card.operationalCandidate);

for (const card of CARDS.filter((item) => !item.operationalCandidate)) {
  const issuerCards = byIssuer.get(card.issuer) || [];
  issuerCards.push(card);
  byIssuer.set(card.issuer, issuerCards);

  const statusCards = byStatus.get(card.source.status) || [];
  statusCards.push(card);
  byStatus.set(card.source.status, statusCards);
}

function sourceLabel(source) {
  if (source.url) return source.url;
  if (source.pdf) return source.pdf;
  if (source.appCapture) return source.appCapture;
  return 'source missing';
}

function batchLabel(source) {
  return source.recheckBatch || 'unbatched';
}

console.log('# Card Source Recheck Queue');
console.log('');
console.log(`Stored card models: ${CARDS.length}`);
console.log(`Active credit-card models: ${CARDS.length - operationalCandidates.length}`);
console.log(`Dormant operational candidates: ${operationalCandidates.length}`);
for (const [status, cards] of [...byStatus.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`- ${status}: ${cards.length}`);
}
console.log('');

for (const [issuer, cards] of [...byIssuer.entries()].sort(([a], [b]) => a.localeCompare(b, 'ko'))) {
  console.log(`## ${issuer}`);
  for (const card of cards) {
    console.log(`- ${card.id} | ${card.name} | ${card.source.status} | ${card.source.checkedAt} | ${sourceLabel(card.source)} | ${batchLabel(card.source)}`);
    console.log(`  - ${card.source.note}`);
  }
  console.log('');
}

console.log('## Operational Candidates (Excluded From Recheck Queue)');
for (const card of operationalCandidates) {
  console.log(`- ${card.id} | ${card.name} | saved-data slot preserved`);
}
