import assert from 'node:assert/strict';
import { CARDS, POINT_DEFAULTS } from '../src/data/cards.js';
import { CATEGORIES } from '../src/data/categories.js';
import {
  getMonthlyBenefitValue,
  getMonthlyShortfall,
  getOrderedCards,
  recommendCards
} from '../src/lib/recommend.js';
import { importState } from '../src/lib/storage.js';

const MONTH = '2026-07';

function card(id) {
  const item = CARDS.find((candidate) => candidate.id === id);
  assert.ok(item, `Missing card: ${id}`);
  return item;
}

function baseState({ selectedCategory = 'coffee', amount = 10000, monthly = {}, overrides = {}, usage = {} } = {}) {
  return {
    selectedMonth: MONTH,
    selectedCategory,
    selectedSubcategory: '',
    recommendationAmount: amount,
    cardOrder: CARDS.map((item) => item.id),
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
assertEqual(getMonthlyShortfall(card('kb-talktalk-my-point'), { monthlyTarget: 200000, currentMonthSpend: 100000 }), 100000, 'monthly shortfall');

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
  pointValues: { koreanAir: 17, evil: '<img>' },
  monthlyCardUsage: {
    [MONTH]: {
      'kb-talktalk-my-point': { currentMonthSpend: '200000', prevMonthStatus: 'bad-class' },
      'unknown-card': { currentMonthSpend: 999999 }
    }
  }
}));
assertEqual(imported.selectedTab, 'dashboard', 'import sanitizes selected tab');
assertEqual(imported.settings.pointValues.koreanAir, 17, 'import keeps known point values');
assert.equal(imported.settings.pointValues.evil, undefined, 'import drops unknown point value keys');
assertEqual(imported.monthlyCardUsage[MONTH]['kb-talktalk-my-point'].prevMonthStatus, 'manual', 'import sanitizes monthly status');
assert.equal(imported.monthlyCardUsage[MONTH]['unknown-card'], undefined, 'import drops unknown monthly card ids');

console.log('audit-check passed');
