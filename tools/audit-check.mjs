import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CARDS, POINT_DEFAULTS } from '../src/data/cards.js';
import { CATEGORIES } from '../src/data/categories.js';
import {
  getAnnualUsageCount,
  getAllOrderedCards,
  getCardOverride,
  getMonthlyBenefitValue,
  getMonthlyShortfall,
  getOrderedCards,
  getTotalMonthlyBenefitValue,
  hasPrevMonthRequirement,
  recommendCards
} from '../src/lib/recommend.js';
import { importState } from '../src/lib/storage.js';

const MONTH = '2026-07';
const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const lazySyncSource = readFileSync(new URL('../src/lib/sync/lazySync.js', import.meta.url), 'utf8');
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
const hiddenCardState = withSpend('kb-talktalk-my-point', 200000, { hiddenCardIds: ['kb-talktalk-my-point'] });
assertEqual(getAllOrderedCards(hiddenCardState).length, CARDS.length, 'all ordered cards still include hidden cards for settings');
assertEqual(getOrderedCards(hiddenCardState).some((item) => item.id === 'kb-talktalk-my-point'), false, 'hidden card is excluded from visible ordered cards');
assertEqual(recommendCards({ ...hiddenCardState, selectedCategory: 'simplepay', recommendationAmount: 10000 }, 'simplepay', 10000).some((item) => item.card.id === 'kb-talktalk-my-point'), false, 'hidden card is excluded from recommendations');
assertEqual(getTotalMonthlyBenefitValue(hiddenCardState, getOrderedCards(hiddenCardState), MONTH), 0, 'hidden card is excluded from visible benefit totals');
assertEqual(getMonthlyShortfall(card('kb-talktalk-my-point'), { monthlyTarget: 200000, currentMonthSpend: 100000 }), 100000, 'monthly shortfall');
assert.ok(!mainSource.includes('./lib/sync/syncManager.js'), 'main entry must not statically import Firebase sync runtime');
assert.ok(lazySyncSource.includes("import('./syncManager.js')"), 'sync runtime must stay dynamically imported');
assert.ok(indexHtml.includes('Content-Security-Policy'), 'index.html must include CSP meta');
console.log('ok - sync runtime is lazy-loaded and CSP meta exists');

assertEqual(monthlyValue('skt-woori-card', 300000), 10000, 'SKT Woori 300k telecom pattern');
assertEqual(monthlyValue('skt-woori-card', 300000, { overrides: { 'skt-woori-card': { prevMonthStatus: 'unmet' } } }), 0, 'SKT Woori unmet blocks pattern');
assertEqual(monthlyValue('woori-point-main', 300000), 10000, 'Woori Point simplepay 300k cap');
assertEqual(monthlyValue('woori-point-main', 600000), 20000, 'Woori Point simplepay 600k cap');
assertEqual(monthlyValue('kb-talktalk-my-point', 200000), 11000, 'KB TalkTalk KB Pay plus base');
assertEqual(monthlyValue('mg-s-hana', 300000), 15000, 'MG+S simplepay 300k cap');
assertEqual(monthlyValue('shinhan-always-on', 10000), 2000, 'Shinhan Always On two transactions pattern');
assertEqual(monthlyValue('coupang-wow-card', 100000), 4000, 'Coupang WOW 4 percent reference benefit');
assertEqual(monthlyValue('marriott-classic-shinhan', 300000), 0, 'Marriott Classic conditional bonus is not auto-counted from monthly spend');

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
assertEqual(getMonthlyBenefitValue(theOOutbackBelowMin, card('samsung-the-o-asiana'), MONTH), 0, 'THE O Outback below min amount is zero');

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
assert.ok(stylesSource.includes('input:checked::after'), 'custom check mark is rendered for selected benefit check controls');
console.log('ok - benefit checkbox controls use custom theme-safe rendering');

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
assert.deepEqual(imported.hiddenCardIds, ['kb-talktalk-my-point'], 'import sanitizes hidden card ids');
assertEqual(imported.settings.pointValues.koreanAir, 17, 'import keeps known point values');
assert.equal(imported.settings.pointValues.evil, undefined, 'import drops unknown point value keys');
assertEqual(imported.monthlyCardUsage[MONTH]['kb-talktalk-my-point'].prevMonthStatus, 'manual', 'import sanitizes monthly status');
assert.equal(imported.monthlyCardUsage[MONTH]['unknown-card'], undefined, 'import drops unknown monthly card ids');

console.log('audit-check passed');
