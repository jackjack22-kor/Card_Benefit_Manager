import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CARDS, DEFAULT_HIDDEN_CARD_IDS, POINT_DEFAULTS } from '../src/data/cards.js';
import { CATEGORIES } from '../src/data/categories.js';
import {
  getAnnualUsageCount,
  getAllOrderedCards,
  getBenefitAmountInput,
  getBenefitHomeStatus,
  getCardOverride,
  getMonthlyBenefitValue,
  getMonthlyBenefitValueForBenefit,
  getMonthlyShortfall,
  getOrderedCards,
  getTotalMonthlyBenefitValue,
  hasPrevMonthRequirement,
  isCheckOnlyFixedAmountBenefit,
  isCapContainerBenefit,
  recommendCards
} from '../src/lib/recommend.js';
import { createInitialState, importState, migrateState } from '../src/lib/storage.js';

const MONTH = '2026-07';
const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const lazySyncSource = readFileSync(new URL('../src/lib/sync/lazySync.js', import.meta.url), 'utf8');
const syncManagerSource = readFileSync(new URL('../src/lib/sync/syncManager.js', import.meta.url), 'utf8');
const firebaseClientSource = readFileSync(new URL('../src/lib/sync/firebaseClient.js', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function card(id) {
  const item = CARDS.find((candidate) => candidate.id === id);
  assert.ok(item, `Missing card: ${id}`);
  return item;
}

function baseState({ selectedCategory = 'coffee', amount = 10000, monthly = {}, overrides = {}, usage = {}, hiddenCardIds = [] } = {}) {
  return {
    selectedMonth: MONTH,
    selectedCategory,
    selectedSubcategory: '',
    recommendationAmount: amount,
    cardOrder: CARDS.map((item) => item.id),
    hiddenCardIds,
    settings: { pointValues: { ...POINT_DEFAULTS }, darkMode: true },
    cardOverrides: Object.fromEntries(CARDS.map((item) => [
      item.id,
      {
        monthlyTarget: item.defaultMonthlyTarget || 0,
        annualTarget: item.defaultAnnualTarget || 0,
        prevMonthStatus: 'met',
        ...(overrides[item.id] || {})
      }
    ])),
    monthlyCardUsage: {
      [MONTH]: monthly
    },
    usage
  };
}

function withSpend(cardId, spend, options = {}) {
  return baseState({
    ...options,
    monthly: {
      ...(options.monthly || {}),
      [cardId]: { currentMonthSpend: spend, ...(options.monthly?.[cardId] || {}) }
    }
  });
}

function monthlyValue(cardId, spend, options = {}) {
  return getMonthlyBenefitValue(withSpend(cardId, spend, options), card(cardId), MONTH);
}

function findRecommendation(state, cardId) {
  const result = recommendCards(state, state.selectedCategory, state.recommendationAmount, state.selectedSubcategory)
    .find((item) => item.card.id === cardId);
  assert.ok(result, `Missing recommendation result for ${cardId}`);
  return result;
}

function assertEqual(actual, expected, label) {
  assert.equal(actual, expected, `${label}: expected ${expected}, got ${actual}`);
  console.log(`ok - ${label}: ${actual}`);
}

function assertBetween(actual, min, max, label) {
  assert.ok(actual >= min && actual <= max, `${label}: expected ${min}..${max}, got ${actual}`);
  console.log(`ok - ${label}: ${actual}`);
}

const categoryIds = new Set(CATEGORIES.map((item) => item.id));
const unknownCategories = [];
for (const item of CARDS) {
  for (const benefit of item.benefits || []) {
    for (const categoryId of benefit.categories || []) {
      if (!categoryIds.has(categoryId)) unknownCategories.push(`${item.id}:${benefit.id}:${categoryId}`);
    }
  }
}

if (unknownCategories.length) {
  console.warn(`warn - unknown categories: ${unknownCategories.join(', ')}`);
}

assertEqual(getOrderedCards(baseState()).length, CARDS.length, 'all cards are orderable');
assert.deepEqual(createInitialState().hiddenCardIds, DEFAULT_HIDDEN_CARD_IDS, 'new optional cards are hidden by default for fresh installs');
const oldStateWithoutNewCards = migrateState({
  schemaVersion: '2.0.1',
  cardOrder: CARDS.map((item) => item.id).filter((id) => !DEFAULT_HIDDEN_CARD_IDS.includes(id)),
  monthlyCardUsage: { [MONTH]: {} }
});
assert.deepEqual(oldStateWithoutNewCards.hiddenCardIds, DEFAULT_HIDDEN_CARD_IDS, 'new optional cards are hidden when introduced to existing state');
const userUnhiddenOptionalCards = migrateState({
  schemaVersion: '2.0.1',
  cardOrder: CARDS.map((item) => item.id),
  hiddenCardIds: [],
  monthlyCardUsage: { [MONTH]: {} }
});
assert.deepEqual(userUnhiddenOptionalCards.hiddenCardIds, [], 'visible optional cards stay visible after the user enables them');
const hiddenCardState = withSpend('kb-talktalk-my-point', 200000, { hiddenCardIds: ['kb-talktalk-my-point'] });
assertEqual(getAllOrderedCards(hiddenCardState).length, CARDS.length, 'all ordered cards still include hidden cards for settings');
assertEqual(getOrderedCards(hiddenCardState).some((item) => item.id === 'kb-talktalk-my-point'), false, 'hidden card is excluded from visible ordered cards');
assertEqual(recommendCards({ ...hiddenCardState, selectedCategory: 'simplepay', recommendationAmount: 10000 }, 'simplepay', 10000).some((item) => item.card.id === 'kb-talktalk-my-point'), false, 'hidden card is excluded from recommendations');
assertEqual(getTotalMonthlyBenefitValue(hiddenCardState, getOrderedCards(hiddenCardState), MONTH), 0, 'hidden card is excluded from visible benefit totals');
assertEqual(getMonthlyShortfall(card('kb-talktalk-my-point'), { monthlyTarget: 200000, currentMonthSpend: 100000 }), 100000, 'monthly shortfall');
const lazyInitSyncBody = exportedFunctionBody(lazySyncSource, 'initSync');
const lazyQueueCloudSaveBody = exportedFunctionBody(lazySyncSource, 'queueCloudSave');
const managerQueueCloudSaveBody = exportedFunctionBody(syncManagerSource, 'queueCloudSave');
const managerSignInBody = exportedFunctionBody(syncManagerSource, 'requestCloudSignIn');
assert.ok(!mainSource.includes('./lib/sync/syncManager.js'), 'main entry must not statically import Firebase sync runtime');
assert.ok(lazySyncSource.includes("import('./syncManager.js')"), 'sync runtime must stay dynamically imported');
assertContainsInOrder(lazyInitSyncBody, ['queueMicrotask(() =>', 'prepareCloudSync();'], 'sync runtime starts checking auth immediately after app init');
assert.ok(lazySyncSource.includes("const PENDING_SAVE_KEY = 'cardBenefitManager.pendingCloudSave'"), 'lazy sync layer can persist pending saves before runtime loads');
assertContainsInOrder(lazyQueueCloudSaveBody, ['pendingSave = true;', 'markPendingCloudSave();', 'prepareCloudSync();'], 'save before runtime load wakes cloud sync and records a durable pending save');
assert.ok(syncManagerSource.includes('let authSettled = false'), 'sync manager tracks auth readiness before dropping unauthenticated saves');
assertContainsInOrder(managerQueueCloudSaveBody, ['if (!currentUser)', 'if (!authSettled) markPendingCloudSave();', 'return;', 'markPendingCloudSave();'], 'save before auth settles is retained for login recovery');
assert.ok(firebaseClientSource.includes('const persistenceReady = setPersistence(auth, browserLocalPersistence)'), 'auth persistence setup is tracked instead of being silently ignored');
assertContainsInOrder(managerSignInBody, ['await services.persistenceReady', 'new GoogleAuthProvider()'], 'manual Google sign-in waits for local auth persistence setup');
assert.ok(indexHtml.includes('Content-Security-Policy'), 'index.html must include CSP meta');
console.log('ok - sync runtime is lazy-loaded and CSP meta exists');

assertEqual(monthlyValue('skt-woori-card', 300000), 10000, 'SKT Woori 300k telecom pattern');
assertEqual(monthlyValue('skt-woori-card', 300000, { overrides: { 'skt-woori-card': { prevMonthStatus: 'unmet' } } }), 0, 'SKT Woori unmet blocks pattern');
assertEqual('monthlyLimitCount' in benefit('skt-woori-card', 'skt-woori-telecom-tlight'), false, 'SKT Woori telecom status uses only monthly cap');
assertEqual(monthlyValue('woori-point-main', 300000), 10000, 'Woori Point simplepay 300k cap');
assertEqual(monthlyValue('woori-point-main', 600000), 20000, 'Woori Point simplepay 600k cap');
assertEqual(monthlyValue('kb-talktalk-my-point', 200000), 11000, 'KB TalkTalk KB Pay plus base');
assertEqual(monthlyValue('mg-s-hana', 300000), 15000, 'MG+S simplepay 300k cap');
assertEqual(monthlyValue('shinhan-always-on', 10000), 2000, 'Shinhan Always On two transactions pattern');
assertEqual(monthlyValue('coupang-wow-card', 100000), 4000, 'Coupang WOW 4 percent reference benefit');
assertEqual(monthlyValue('marriott-classic-shinhan', 300000), 3000, 'Marriott Classic base 1P auto-counts monthly spend');
assertEqual(monthlyValue('bc-goat-card', 1200000), 17000, 'BC GOAT domestic Paybook tiered reward');
assertEqual(monthlyValue('all-woori-infinite', 300000), 4186, 'ALL Woori base reward uses official ALL point value');
assertEqual(monthlyValue('lotte-hilton-amex', 300000), 200, 'Hilton Amex base point value reflects monthly spend');

function benefit(cardId, benefitId) {
  const found = card(cardId).benefits.find((item) => item.id === benefitId);
  assert.ok(found, `Missing benefit: ${cardId}:${benefitId}`);
  return found;
}

function assertBenefitValue(state, cardId, benefitId, expected, label) {
  assertEqual(getMonthlyBenefitValueForBenefit(state, card(cardId), benefit(cardId, benefitId), MONTH), expected, label);
}

function exportedFunctionBody(source, name) {
  const signatures = [`export function ${name}`, `export async function ${name}`];
  const start = Math.max(...signatures.map((signature) => source.indexOf(signature)));
  assert.ok(start >= 0, `Missing exported function: ${name}`);
  const open = source.indexOf('{', start);
  assert.ok(open >= 0, `Missing function body: ${name}`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }
  throw new Error(`Unclosed function body: ${name}`);
}

function assertContainsInOrder(source, parts, label) {
  let cursor = 0;
  for (const part of parts) {
    const index = source.indexOf(part, cursor);
    assert.ok(index >= 0, `${label}: missing ${part}`);
    cursor = index + part.length;
  }
}

assertEqual(card('shinhan-ace-blue').benefits[0].id, 'ace-reward-mile', 'Shinhan The ACE Skypass mileage appears first');
assertBenefitValue(withSpend('marriott-classic-shinhan', 300000), 'marriott-classic-shinhan', 'mb-classic-point-basic', 3000, 'Marriott Classic base row reflects monthly spend');
assertBenefitValue(withSpend('marriott-best-shinhan', 300000), 'marriott-best-shinhan', 'mb-best-point-basic', 3000, 'Marriott Best base row reflects monthly spend');
assert.ok(
  card('marriott-best-shinhan').benefits.findIndex((item) => item.id === 'mb-best-point-basic')
    < card('marriott-best-shinhan').benefits.findIndex((item) => item.id === 'mb-best-point-marriott'),
  'Marriott Best base 1P benefit appears before Marriott 5P benefit'
);
assertBenefitValue(withSpend('hyundai-amex-platinum', 1000000), 'hyundai-amex-platinum', 'hy-amex-mr-base', 15000, 'Hyundai Amex base MR row reflects monthly spend');
assert.deepEqual(
  card('hyundai-amex-platinum').benefits.slice(0, 4).map((item) => item.id),
  ['hy-amex-mr-base', 'hy-amex-mr-2x', 'hy-amex-mr-3x', 'hy-amex-artisee'],
  'Hyundai Amex MR benefits appear first and Artisee is fourth'
);
const hyundaiAmexSpecialState = withSpend('hyundai-amex-platinum', 1000000, {
  usage: { 'hy-amex-mr-2x': { [MONTH]: { usedAmount: 500000 } } }
});
assertEqual(getMonthlyBenefitValue(hyundaiAmexSpecialState, card('hyundai-amex-platinum'), MONTH), 22500, 'Hyundai Amex base plus special incremental MR');
assertBenefitValue(hyundaiAmexSpecialState, 'hyundai-amex-platinum', 'hy-amex-mr-2x', 7500, 'Hyundai Amex special row counts only extra over base');
assertEqual(getBenefitAmountInput(hyundaiAmexSpecialState, card('hyundai-amex-platinum'), benefit('hyundai-amex-platinum', 'hy-amex-mr-base'), MONTH), 1000000, 'base reward amount input falls back to monthly spend');
assertEqual(getBenefitAmountInput(hyundaiAmexSpecialState, card('hyundai-amex-platinum'), benefit('hyundai-amex-platinum', 'hy-amex-mr-2x'), MONTH), 500000, 'special reward amount input uses explicit category spend');
const hyundaiAmexSpecialOnlyState = withSpend('hyundai-amex-platinum', 0, {
  usage: { 'hy-amex-mr-2x': { [MONTH]: { usedAmount: 100000 } } }
});
assertBenefitValue(hyundaiAmexSpecialOnlyState, 'hyundai-amex-platinum', 'hy-amex-mr-2x', 1500, 'explicit special reward amount works even without card monthly spend');

const the1SpecialState = withSpend('samsung-the1-skypass', 1000000, {
  usage: { 'the1-special-mile': { [MONTH]: { usedAmount: 500000 } } }
});
assertEqual(getMonthlyBenefitValue(the1SpecialState, card('samsung-the1-skypass'), MONTH), 22500, 'THE 1 base plus special incremental Skypass miles');
assertBenefitValue(the1SpecialState, 'samsung-the1-skypass', 'the1-basic-mile', 15000, 'THE 1 base row reflects monthly spend');
assertBenefitValue(the1SpecialState, 'samsung-the1-skypass', 'the1-special-mile', 7500, 'THE 1 special row counts only extra over base');
const the1SpecialCapState = withSpend('samsung-the1-skypass', 2000000, {
  usage: { 'the1-special-mile': { [MONTH]: { usedAmount: 2000000 } } }
});
assertEqual(getMonthlyBenefitValue(the1SpecialCapState, card('samsung-the1-skypass'), MONTH), 30000, 'THE 1 special cap is applied before base-difference math');
assertBenefitValue(the1SpecialCapState, 'samsung-the1-skypass', 'the1-special-mile', 0, 'THE 1 capped special row does not double-count base miles');
assert.deepEqual(
  card('samsung-the1-skypass').benefits.slice(4, 7).map((item) => item.id),
  ['the1-starbucks', 'the1-amex-artisee', 'the1-amex-baekmidang'],
  'THE 1 AMEX cafe benefits appear with core coffee benefits'
);
assertEqual(benefit('samsung-the1-skypass', 'the1-amex-airport-dining').type, 'info_check', 'THE 1 variable airport dining discount is tracked as info check');
assert.deepEqual(
  benefit('samsung-the1-skypass', 'the1-amex-airport-dining').categories,
  ['restaurant', 'coffee', 'travel'],
  'THE 1 airport dining discount is discoverable in dining, coffee, and travel contexts'
);

assertBenefitValue(withSpend('samsung-the-o-asiana', 300000), 'samsung-the-o-asiana', 'the-o-reward-asiana', 3000, 'THE O basic mileage row reflects monthly spend');
assertBenefitValue(withSpend('skt-woori-card', 700000), 'skt-woori-card', 'skt-woori-telecom-tlight', 15000, 'SKT Woori telecom row reflects tiered current-month spend');
assertEqual(card('woori-point-main').benefits[0].id, 'woori-monthly-points', 'Woori Point monthly cap appears first');
assertBenefitValue(withSpend('woori-point-main', 300000), 'woori-point-main', 'woori-basic', 2400, 'Woori Point basic row reflects monthly spend');
assertBenefitValue(withSpend('woori-point-main', 300000), 'woori-point-main', 'woori-pay-plus', 7600, 'Woori Point simplepay row fills remaining monthly cap');
assertBenefitValue(withSpend('woori-point-main', 300000), 'woori-point-main', 'woori-monthly-points', 10000, 'Woori Point cap container displays applied total');
const wooriManualBasicState = withSpend('woori-point-main', 1200000, {
  usage: { 'woori-basic': { [MONTH]: { benefitValue: 5000 } } }
});
assertBenefitValue(wooriManualBasicState, 'woori-point-main', 'woori-pay-plus', 36000, 'Woori Point pay-plus subtracts manually applied basic only once');
assertBenefitValue(withSpend('kb-talktalk-my-point', 200000), 'kb-talktalk-my-point', 'kb-base', 1000, 'KB TalkTalk base row reflects monthly spend');
assertBenefitValue(withSpend('kb-talktalk-my-point', 200000), 'kb-talktalk-my-point', 'kb-pay-5', 10000, 'KB TalkTalk KB Pay row reflects monthly spend');
const kbManualPayAmountState = withSpend('kb-talktalk-my-point', 200000, {
  usage: { 'kb-pay-5': { [MONTH]: { usedAmount: 100000, manualAmountOverride: true } } }
});
assertBenefitValue(kbManualPayAmountState, 'kb-talktalk-my-point', 'kb-pay-5', 5000, 'KB TalkTalk manual amount override recalculates auto-derived pay row');
const kbManualBaseZeroState = withSpend('kb-talktalk-my-point', 200000, {
  usage: { 'kb-base': { [MONTH]: { usedAmount: 0, manualAmountOverride: true } } }
});
assertBenefitValue(kbManualBaseZeroState, 'kb-talktalk-my-point', 'kb-base', 0, 'KB TalkTalk manual zero amount suppresses derived base row');

const mgCapState = withSpend('mg-s-hana', 1000000, {
  usage: { 'mg-ott': { [MONTH]: { benefitValue: 10000 } } }
});
assertEqual(getMonthlyBenefitValue(mgCapState, card('mg-s-hana'), MONTH), 60000, 'MG+S simplepay plus explicit OTT stays within unified cap');
assertEqual(card('mg-s-hana').benefits[0].id, 'mg-monthly-discount', 'MG+S monthly cap appears first');
assertBenefitValue(mgCapState, 'mg-s-hana', 'mg-simplepay', 50000, 'MG+S simplepay row fills remaining unified cap');
assertBenefitValue(mgCapState, 'mg-s-hana', 'mg-monthly-discount', 60000, 'MG+S cap container displays applied total');
assertEqual(isCapContainerBenefit(benefit('mg-s-hana', 'mg-monthly-discount')), true, 'MG+S monthly cap is treated as read-only cap container');
assert.ok(getBenefitHomeStatus(mgCapState, card('mg-s-hana'), benefit('mg-s-hana', 'mg-simplepay')).includes('50,000'), 'MG+S simplepay home status shows applied benefit instead of zero');

assertBenefitValue(withSpend('lotte-green-card', 300000), 'lotte-green-card', 'lotte-green-domestic', 600, 'Lotte Green domestic row reflects monthly spend');
assertBenefitValue(withSpend('kb-skypass-platinum', 300000), 'kb-skypass-platinum', 'kb-skypass-mile', 3000, 'KB Skypass mileage row reflects monthly spend');
assertBenefitValue(withSpend('coupang-wow-card', 100000), 'coupang-wow-card', 'coupang-wow-cashback', 4000, 'Coupang WOW detail row reflects 4 percent Coupang spend');

const bcGoatOverseasState = withSpend('bc-goat-card', 0, {
  usage: { 'bc-goat-overseas-paybook': { [MONTH]: { usedAmount: 1200000 } } }
});
assertBenefitValue(bcGoatOverseasState, 'bc-goat-card', 'bc-goat-overseas-paybook', 34000, 'BC GOAT overseas Paybook tiered reward');

const allWooriSpecialState = withSpend('all-woori-infinite', 300000, {
  usage: { 'all-woori-accor-5p': { [MONTH]: { usedAmount: 300000 } } }
});
assertBenefitValue(allWooriSpecialState, 'all-woori-infinite', 'all-woori-basic-reward', 4186, 'ALL Woori base reward row reflects monthly spend');
assertBenefitValue(allWooriSpecialState, 'all-woori-infinite', 'all-woori-accor-5p', 11915, 'ALL Woori Accor special row counts only extra over base');

const hiltonSpecialState = withSpend('lotte-hilton-amex', 300000, {
  usage: { 'hilton-special-point': { [MONTH]: { usedAmount: 150000 } } }
});
assertBenefitValue(hiltonSpecialState, 'lotte-hilton-amex', 'hilton-base-point', 200, 'Hilton base reward row reflects monthly spend');
assertBenefitValue(hiltonSpecialState, 'lotte-hilton-amex', 'hilton-special-point', 100, 'Hilton special row counts only extra over base');

const lotteAmexOverseasState = withSpend('lotte-amex-skypass', 1000000, {
  usage: { 'lotte-amex-overseas-mile': { [MONTH]: { usedAmount: 500000 } } }
});
assertEqual(getMonthlyBenefitValue(lotteAmexOverseasState, card('lotte-amex-skypass'), MONTH), 22500, 'Lotte Amex base plus overseas incremental miles');
assertBenefitValue(lotteAmexOverseasState, 'lotte-amex-skypass', 'lotte-amex-domestic-mile', 15000, 'Lotte Amex base row reflects monthly spend');
assertBenefitValue(lotteAmexOverseasState, 'lotte-amex-skypass', 'lotte-amex-overseas-mile', 7500, 'Lotte Amex overseas row counts only extra over base');

const zeroManualState = withSpend('kb-talktalk-my-point', 200000, {
  usage: {
    'kb-base': {
      [MONTH]: { benefitValue: 0 }
    }
  }
});
assertEqual(getMonthlyBenefitValue(zeroManualState, card('kb-talktalk-my-point'), MONTH), 11000, 'legacy zero without override keeps auto');

const explicitZeroOverrideState = withSpend('kb-talktalk-my-point', 200000, {
  usage: {
    'kb-base': {
      [MONTH]: { benefitValue: 0, manualBenefitOverride: true }
    }
  }
});
assertEqual(getMonthlyBenefitValue(explicitZeroOverrideState, card('kb-talktalk-my-point'), MONTH), 10000, 'explicit manual zero suppresses one auto line');

const manualOverrideState = withSpend('kb-talktalk-my-point', 200000, {
  usage: {
    'kb-base': {
      [MONTH]: { benefitValue: 500 }
    }
  }
});
assertEqual(getMonthlyBenefitValue(manualOverrideState, card('kb-talktalk-my-point'), MONTH), 10500, 'positive manual benefit overrides one auto line');

const theOStarbucksChecked = baseState({
  usage: {
    'the-o-starbucks': {
      [MONTH]: { checked: true }
    }
  }
});
assertEqual(getMonthlyBenefitValue(theOStarbucksChecked, card('samsung-the-o-asiana'), MONTH), 3000, 'THE O Starbucks checked applies fixed benefit');
assertEqual(getAnnualUsageCount(theOStarbucksChecked, card('samsung-the-o-asiana'), card('samsung-the-o-asiana').benefits.find((benefit) => benefit.id === 'the-o-starbucks'), new Date(`${MONTH}-01T00:00:00`)), 1, 'THE O checked count is not doubled');
assertEqual(isCheckOnlyFixedAmountBenefit(card('samsung-the-o-asiana').benefits.find((benefit) => benefit.id === 'the-o-starbucks')), true, 'THE O Starbucks is check-only fixed amount');
assertEqual(isCheckOnlyFixedAmountBenefit(card('samsung-the-o-asiana').benefits.find((benefit) => benefit.id === 'the-o-movie')), false, 'THE O CGV keeps amount input because it is rate-based');
assertEqual(isCheckOnlyFixedAmountBenefit(card('samsung-the1-skypass').benefits.find((benefit) => benefit.id === 'the1-megabox')), false, 'tiered fixed amount benefit keeps amount input');
assertEqual(isCheckOnlyFixedAmountBenefit(card('samsung-the1-skypass').benefits.find((benefit) => benefit.id === 'the1-amex-artisee')), true, 'THE 1 AMEX Artisee is check-only fixed amount');
assertEqual(isCheckOnlyFixedAmountBenefit(card('samsung-the1-skypass').benefits.find((benefit) => benefit.id === 'the1-amex-baekmidang')), true, 'THE 1 AMEX Baekmidang is check-only fixed amount');

const the1AmexCafeChecked = baseState({
  usage: {
    'the1-amex-artisee': {
      [MONTH]: { checked: true }
    },
    'the1-amex-baekmidang': {
      [MONTH]: { checked: true }
    }
  }
});
assertBenefitValue(the1AmexCafeChecked, 'samsung-the1-skypass', 'the1-amex-artisee', 4500, 'THE 1 AMEX Artisee checked applies fixed benefit');
assertBenefitValue(the1AmexCafeChecked, 'samsung-the1-skypass', 'the1-amex-baekmidang', 5000, 'THE 1 AMEX Baekmidang checked applies fixed benefit');

const theOStarbucksStaleBelowMin = baseState({
  usage: {
    'the-o-starbucks': {
      [MONTH]: { checked: true, count: 1, usedAmount: 5000 }
    }
  }
});
assertEqual(getMonthlyBenefitValue(theOStarbucksStaleBelowMin, card('samsung-the-o-asiana'), MONTH), 3000, 'check-only fixed benefit ignores stale below-min used amount');

const theOStarbucksCountAndChecked = baseState({
  usage: {
    'the-o-starbucks': {
      [MONTH]: { count: 1, checked: true }
    }
  }
});
assertEqual(getAnnualUsageCount(theOStarbucksCountAndChecked, card('samsung-the-o-asiana'), card('samsung-the-o-asiana').benefits.find((benefit) => benefit.id === 'the-o-starbucks'), new Date(`${MONTH}-01T00:00:00`)), 1, 'THE O count plus checked remains one use');

const theOOutbackBelowMin = baseState({
  usage: {
    'the-o-outback': {
      [MONTH]: { count: 1, usedAmount: 50000 }
    }
  }
});
assertEqual(getMonthlyBenefitValue(theOOutbackBelowMin, card('samsung-the-o-asiana'), MONTH), 30000, 'THE O Outback check-only fixed benefit ignores stale below-min amount');

const theOOutbackMet = baseState({
  usage: {
    'the-o-outback': {
      [MONTH]: { count: 1, usedAmount: 60000 }
    }
  }
});
assertEqual(getMonthlyBenefitValue(theOOutbackMet, card('samsung-the-o-asiana'), MONTH), 30000, 'THE O Outback met amount applies fixed benefit');

const theOMovieRate = baseState({
  usage: {
    'the-o-movie': {
      [MONTH]: { count: 1, usedAmount: 12000 }
    }
  }
});
assertEqual(getMonthlyBenefitValue(theOMovieRate, card('samsung-the-o-asiana'), MONTH), 6000, 'THE O CGV rate benefit reflects used amount');
const theOMovieBelowMin = baseState({
  usage: {
    'the-o-movie': {
      [MONTH]: { count: 1, usedAmount: 10000 }
    }
  }
});
assertEqual(getMonthlyBenefitValue(theOMovieBelowMin, card('samsung-the-o-asiana'), MONTH), 0, 'rate-based count amount benefit still respects minimum amount');

const prevMonthAutoMet = baseState();
prevMonthAutoMet.selectedMonth = '2026-06';
prevMonthAutoMet.monthlyCardUsage['2026-06'] = {
  'shinhan-ace-blue': { prevMonthStatus: 'manual' }
};
prevMonthAutoMet.monthlyCardUsage['2026-05'] = {
  'shinhan-ace-blue': { currentMonthSpend: 780000 }
};
assertEqual(getCardOverride(prevMonthAutoMet, 'shinhan-ace-blue').prevMonthStatus, 'met', 'prev-month spend auto marks selected month as met');
assertEqual(getCardOverride(prevMonthAutoMet, 'shinhan-ace-blue').prevMonthSpend, 780000, 'prev-month spend is exposed for tier calculations');

const prevMonthAutoUnmet = baseState();
prevMonthAutoUnmet.selectedMonth = '2026-06';
prevMonthAutoUnmet.monthlyCardUsage['2026-06'] = {
  'shinhan-ace-blue': { prevMonthStatus: 'manual' }
};
prevMonthAutoUnmet.monthlyCardUsage['2026-05'] = {
  'shinhan-ace-blue': { currentMonthSpend: 200000 }
};
assertEqual(getCardOverride(prevMonthAutoUnmet, 'shinhan-ace-blue').prevMonthStatus, 'unmet', 'prev-month spend auto marks selected month as unmet');

const explicitPrevStatusOverride = baseState();
explicitPrevStatusOverride.selectedMonth = '2026-06';
explicitPrevStatusOverride.monthlyCardUsage['2026-06'] = {
  'shinhan-ace-blue': { prevMonthStatus: 'manual', prevMonthStatusOverride: true }
};
explicitPrevStatusOverride.monthlyCardUsage['2026-05'] = {
  'shinhan-ace-blue': { currentMonthSpend: 780000 }
};
assertEqual(getCardOverride(explicitPrevStatusOverride, 'shinhan-ace-blue').prevMonthStatus, 'met', 'legacy explicit prev-month override is ignored when spend proves met');
const marriottBestUnmanaged = baseState({
  overrides: {
    'marriott-best-shinhan': { monthlyTarget: 0 }
  }
});
assertEqual(getCardOverride(marriottBestUnmanaged, 'marriott-best-shinhan').monthlyTarget, 0, 'explicit zero monthly target is preserved');
assertEqual(hasPrevMonthRequirement(card('marriott-best-shinhan'), getCardOverride(marriottBestUnmanaged, 'marriott-best-shinhan')), false, 'explicit zero monthly target disables prev-month requirement');
assertEqual(hasPrevMonthRequirement(card('kb-skypass-platinum'), getCardOverride(baseState(), 'kb-skypass-platinum')), false, 'zero-target card is not treated as prev-month achievement managed');
assert.ok(mainSource.includes('전월실적 무관'), 'dashboard has neutral prev-month label for unmanaged cards');
console.log('ok - dashboard has neutral prev-month label for unmanaged cards');
assert.ok(!mainSource.includes('function renderMonthlyCardInputs'), 'card detail monthly input section is removed');
assert.ok(!mainSource.includes('data-monthly-card-field="prevMonthStatus"'), 'manual prev-month status selector is removed');
assert.ok(!mainSource.includes('data-cycle-field="issueMonth"'), 'issue month setting is removed');
console.log('ok - redundant card detail inputs are removed');
assert.ok(stylesSource.includes('appearance: none'), 'native checkbox rendering is removed from benefit check controls');
assert.ok(stylesSource.includes('border-width: 0 2px 2px 0'), 'custom check mark is drawn with centered CSS shape');
assert.ok(stylesSource.includes('rotate(45deg) scale(1)'), 'custom check mark selected state stays centered');
console.log('ok - benefit checkbox controls use custom theme-safe rendering');
assert.ok(mainSource.includes('isCheckOnlyFixedAmountBenefit(benefit)'), 'fixed amount count benefits use check-only UI policy');
assert.ok(mainSource.includes("!isCheckOnlyFixed ? `"), 'amount input is skipped for check-only fixed count benefits');
assert.ok(mainSource.includes('조건 충족 시 혜택'), 'check-only fixed count benefits explain deterministic benefit value');
console.log('ok - check-only fixed amount benefit UI policy is preserved');
assert.ok(mainSource.includes('initialRawValue'), 'auto-rendered usage fields skip no-op blur saves');
assert.ok(mainSource.includes('isCapContainerBenefit(benefit)'), 'cap container benefits render as read-only summaries');
assert.ok(mainSource.includes('isMonetaryBenefit(benefit)'), 'monetary benefits show calculated monthly value in status chips');
assert.ok(mainSource.includes('effectiveMonthlyCap(card, benefit, capBasis)'), 'benefit status chips use unified monthly cap including cap pools');
assert.ok(mainSource.includes('if (cap && !isMonetaryBenefit(benefit))'), 'monetary benefit status avoids duplicate monthly value and cap chips');
console.log('ok - auto-derived usage UI avoids sticky no-op overrides and read-only cap containers');
assert.ok(mainSource.includes('sticky-month-bar'), 'dashboard/card detail month bar stays in a dedicated sticky region');
assert.ok(stylesSource.includes('.sticky-month-bar { position: sticky;'), 'sticky month bar CSS is preserved');
assert.ok(stylesSource.includes('background: var(--bg); backdrop-filter: blur(20px);'), 'app header uses an opaque backdrop to avoid iOS sticky bleed-through');
assert.ok(stylesSource.includes('top: calc(54px + env(safe-area-inset-top));'), 'sticky month bar overlaps directly under compact app header');
assert.ok(stylesSource.includes('margin: -8px 0 8px; padding: 8px 0 4px;'), 'sticky month bar top spacing overlaps the header edge');
assert.ok(stylesSource.includes('.sticky-month-bar::before'), 'sticky month bar has an iOS gap cover pseudo-element');
assert.ok(mainSource.includes('getConfiguredMonthlyTarget(card, override)'), 'card detail monthly metric uses configured monthly target');
assert.ok(mainSource.includes('/ ${won(target)} (${status})'), 'card detail monthly metric shows spend, target, and status together');
console.log('ok - sticky month bar and amount-bearing card detail metrics are preserved');

const the1LargeDepartment = baseState({
  selectedCategory: 'department',
  amount: 2000000
});
const the1Recommendation = findRecommendation(the1LargeDepartment, 'samsung-the1-skypass');
assertBetween(the1Recommendation.value, 30000, 60000, 'THE 1 special mileage recommendation respects monthly point cap');

const allUnmetOverrides = Object.fromEntries(CARDS.map((item) => [item.id, { prevMonthStatus: 'unmet' }]));
const hotelUnmetState = baseState({
  selectedCategory: 'hotel',
  amount: 100000,
  overrides: allUnmetOverrides
});
const hyundaiHotelUnmet = findRecommendation(hotelUnmetState, 'hyundai-amex-platinum');
assertEqual(hyundaiHotelUnmet.value, 1500, 'prev-month unmet blocks conditional reward recommendations');

assert.throws(() => importState('{}'), /복원할 카드\/혜택 데이터/, 'empty backup JSON is rejected');
const imported = importState(JSON.stringify({
  schemaVersion: '2.0.1',
  selectedTab: 'dashboard hacked',
  selectedCategory: 'travel',
  hiddenCardIds: ['kb-talktalk-my-point', 'unknown-card'],
  pointValues: { koreanAir: 17, evil: '<img>' },
  monthlyCardUsage: {
    [MONTH]: {
      'kb-talktalk-my-point': { currentMonthSpend: '200000', prevMonthStatus: 'bad-class' },
      'unknown-card': { currentMonthSpend: 999999 }
    }
  }
}));
assertEqual(imported.selectedTab, 'dashboard', 'import sanitizes selected tab');
assert.deepEqual(imported.hiddenCardIds, ['kb-talktalk-my-point', ...DEFAULT_HIDDEN_CARD_IDS], 'import sanitizes hidden card ids and adds default-hidden optional cards');
assertEqual(imported.settings.pointValues.koreanAir, 17, 'import keeps known point values');
assert.equal(imported.settings.pointValues.evil, undefined, 'import drops unknown point value keys');
assertEqual(imported.monthlyCardUsage[MONTH]['kb-talktalk-my-point'].prevMonthStatus, 'manual', 'import sanitizes monthly status');
assert.equal(imported.monthlyCardUsage[MONTH]['unknown-card'], undefined, 'import drops unknown monthly card ids');

console.log('audit-check passed');
