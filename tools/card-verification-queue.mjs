import { PUBLIC_CARD_CATALOG } from '../src/data/publicCardCatalogIndex.js';

const issuerWeights = new Map([
  ['신한카드', 30], ['현대카드', 30], ['KB국민카드', 30], ['삼성카드', 28],
  ['우리카드', 26], ['롯데카드', 26], ['하나카드', 26], ['BC 바로카드', 24],
  ['NH농협카드', 20], ['IBK기업은행', 18]
]);
const priorityKeywords = ['SOL', 'Deep', 'Mr.Life', 'ZERO', 'M', 'MX', 'WE:SH', '탄탄대로', 'iD', 'taptap', '카드의정석', 'DA@', 'LOCA', 'LIKIT', 'MULTI', 'JADE', '트래블', '마일', '플래티넘'];

function priorityScore(card) {
  let score = issuerWeights.get(card.issuer) || 5;
  if (card.collectionStatus === 'official_catalog') score += 50;
  if (card.collectionStatus === 'official_detail_verified') score += 100;
  if (!card.isDiscontinued) score += 15;
  if (card.releasedAt >= '2024-01-01') score += 15;
  if (card.imageUrl) score += 3;
  if (card.networks?.length) score += 3;
  if (card.summaryBenefits?.length >= 3) score += 4;
  if (priorityKeywords.some((keyword) => card.name.toLocaleLowerCase('ko-KR').includes(keyword.toLocaleLowerCase('ko-KR')))) score += 18;
  return score;
}

const queue = PUBLIC_CARD_CATALOG
  .filter((card) => card.collectionStatus !== 'official_detail_verified')
  .map((card) => ({ ...card, priorityScore: priorityScore(card) }))
  .sort((left, right) => right.priorityScore - left.priorityScore || left.issuer.localeCompare(right.issuer, 'ko-KR') || left.name.localeCompare(right.name, 'ko-KR'));

const byIssuer = new Map();
for (const card of queue) byIssuer.set(card.issuer, (byIssuer.get(card.issuer) || 0) + 1);

console.log('# Card Verification Queue');
console.log('');
console.log(`Pending: ${queue.length}`);
console.log(`Verified: ${PUBLIC_CARD_CATALOG.length - queue.length}`);
console.log('');
console.log('## Pending By Issuer');
for (const [issuer, count] of [...byIssuer.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'ko-KR'))) {
  console.log(`- ${issuer}: ${count}`);
}
console.log('');
console.log('## Next 100');
for (const card of queue.slice(0, 100)) {
  console.log(`- P${card.priorityScore} | ${card.id} | ${card.issuer} | ${card.name} | ${card.collectionStatus} | ${card.officialUrl || card.referenceUrl}`);
}
