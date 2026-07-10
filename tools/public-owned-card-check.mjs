import assert from 'node:assert/strict';

process.env.VITE_APP_EDITION = 'public';

const { createInitialState, exportState, importState, migrateState } = await import('../src/lib/storage.js');
const { createDefaultCardOverride, createOwnedCatalogCard } = await import('../src/lib/ownedCards.js');
const { getAllOrderedCards } = await import('../src/lib/recommend.js');

const initial = createInitialState();
assert.deepEqual(initial.ownedCardIds, [], 'new public users must start without owned cards');
assert.deepEqual(initial.cardOrder, [], 'new public users must build their own card order');
assert.equal(initial.selectedCardId, '', 'new public users must not inherit a personal selected card');

const migratedLegacy = migrateState({
  schemaVersion: '2.0.1',
  selectedCardId: 'hyundai-amex-platinum',
  cardOrder: ['shinhan-ace-blue', 'hyundai-amex-platinum'],
  hiddenCardIds: ['shinhan-ace-blue'],
  cardOverrides: {
    'hyundai-amex-platinum': {
      monthlyTarget: 1500000,
      monthlyTargetUserSet: true,
      annualTarget: 36000000,
      annualTargetUserSet: true,
      cycle: { type: 'anniversary', startMonth: 7, annualFeeStartMonth: 7 }
    }
  }
});
assert.deepEqual(migratedLegacy.ownedCardIds, ['hyundai-amex-platinum'], 'legacy public visibility migrates to ownership');
assert.equal(migratedLegacy.cardOverrides['hyundai-amex-platinum'].annualTarget, 36000000, 'legacy annual target survives ownership migration');
assert.equal(migratedLegacy.cardOverrides['hyundai-amex-platinum'].cycle.annualFeeStartMonth, 7, 'legacy annual-fee month survives ownership migration');

const catalogCard = createOwnedCatalogCard({
  id: 'catalog-test-card',
  issuer: '테스트카드',
  name: '공개 카탈로그 테스트',
  productType: 'credit',
  annualFeeText: '국내전용 20,000원',
  previousMonthSpend: 400000,
  publicationImage: 'image/public-catalog/test.png',
  networks: ['VISA'],
  summaryBenefits: [{ title: '생활 할인', tags: ['커피', '통신'] }],
  officialUrl: 'https://example.com/card',
  source: { checkedAt: '2026-07-10', note: '회귀검사용' }
});
const unsafeCatalogCard = createOwnedCatalogCard({
  id: 'unsafe-catalog-card',
  name: '안전성 검사',
  imageUrl: 'javascript:alert(1)',
  officialUrl: 'javascript:alert(1)'
});
assert.equal(unsafeCatalogCard.image, '', 'owned card snapshots reject unsafe image URLs');
assert.equal(unsafeCatalogCard.source.url, '', 'owned card snapshots reject unsafe official URLs');
const catalogOverride = {
  ...createDefaultCardOverride(catalogCard),
  monthlyTarget: 700000,
  monthlyTargetUserSet: true,
  annualTarget: 12000000,
  annualTargetUserSet: true
};
const withCatalogCard = migrateState({
  ...initial,
  ownedCardIds: [catalogCard.id],
  ownedCatalogCards: { [catalogCard.id]: catalogCard },
  cardOrder: [catalogCard.id],
  selectedCardId: catalogCard.id,
  cardOverrides: { ...initial.cardOverrides, [catalogCard.id]: catalogOverride }
});
assert.equal(getAllOrderedCards(withCatalogCard)[0]?.id, catalogCard.id, 'added catalog card joins public runtime cards');
assert.equal(withCatalogCard.cardOverrides[catalogCard.id].monthlyTarget, 700000, 'user monthly target overrides catalog default');
assert.equal(withCatalogCard.cardOverrides[catalogCard.id].annualTarget, 12000000, 'user annual target survives catalog-card migration');

const removed = migrateState({ ...withCatalogCard, ownedCardIds: [], removedOwnedCardIds: [catalogCard.id], cardOrder: [], selectedCardId: '' });
assert.equal(getAllOrderedCards(removed).length, 0, 'removed card leaves active public cards');
assert.deepEqual(removed.removedOwnedCardIds, [catalogCard.id], 'removed card remains available for settings restoration');
assert.equal(removed.cardOverrides[catalogCard.id].monthlyTarget, 700000, 'removing a card preserves its settings');
assert.ok(removed.ownedCatalogCards[catalogCard.id], 'removing a card preserves its catalog snapshot for restoration');

const restored = importState(exportState({ ...removed, ownedCardIds: [catalogCard.id], removedOwnedCardIds: [], cardOrder: [catalogCard.id] }));
assert.equal(getAllOrderedCards(restored)[0]?.id, catalogCard.id, 'JSON backup restores owned catalog cards');
assert.equal(restored.cardOverrides[catalogCard.id].monthlyTarget, 700000, 'JSON backup restores owned card settings');

console.log('public-owned-card-check passed');
