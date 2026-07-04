import { CARDS, POINT_DEFAULTS } from '../data/cards.js';
import { getMonthKey } from './cycles.js';

export const STORAGE_KEY = 'cardBenefitManager.v1';
export const SCHEMA_VERSION = '2.0.1';
export const APP_VERSION = '1.0.0-single-html';

const MONTHLY_TARGET_MIGRATIONS = {
  'kb-talktalk-my-point': 200000,
  'shinhan-always-on': 10000
};

export function createInitialState() {
  const currentMonth = getMonthKey();
  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: {
      darkMode: true,
      pointValues: { ...POINT_DEFAULTS },
      recommendMode: 'bestValue'
    },
    selectedTab: 'dashboard',
    selectedMonth: currentMonth,
    selectedCategory: 'evcharge',
    selectedSubcategory: '',
    recommendationAmount: 10000,
    selectedCardId: CARDS[0]?.id || '',
    isSortingCards: false,
    cardSettingsOpen: false,
    cardOrder: CARDS.map((card) => card.id),
    cardOverrides: Object.fromEntries(CARDS.map((card) => [card.id, {
      prevMonthStatus: 'met',
      currentMonthSpend: 0,
      monthlyTarget: card.defaultMonthlyTarget || 0,
      annualSpend: 0,
      annualTarget: card.annualTargets?.[0] || 0,
      cycle: {
        ...(card.defaultCycle || { type: 'calendar', startMonth: 1 }),
        annualFeeStartMonth: card.defaultCycle?.startMonth || 1,
        issueMonth: card.defaultCycle?.startMonth || 1
      },
      memo: ''
    }])),
    monthlyCardUsage: {},
    usage: {},
    notes: {},
    backupMeta: {
      lastBackupAt: '',
      lastImportAt: ''
    }
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    return migrateState(parsed);
  } catch (error) {
    console.error('Failed to load state', error);
    return createInitialState();
  }
}

export function saveState(state) {
  const next = { ...state, schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, updatedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function migrateState(state) {
  if (!state || typeof state !== 'object') {
    throw new Error('백업 파일 형식이 올바르지 않습니다.');
  }
  const base = createInitialState();
  const importedSettings = state.settings || {};
  const importedPointValues = state.pointValues || importedSettings.pointValues || {};
  const importedCardSettings = state.cardSettings || state.cardOverrides || {};
  const importedBenefitUsage = state.benefitUsage || state.usage || {};
  const importedMonthlyCardUsage = state.monthlyCardUsage || {};
  const importedNotes = state.notes || {};
  const importedBackupMeta = {
    ...(state.backupMeta || {}),
    ...(state.lastBackupAt ? { lastBackupAt: state.lastBackupAt } : {})
  };
  const merged = {
    ...base,
    ...state,
    settings: { ...base.settings, ...importedSettings, pointValues: { ...base.settings.pointValues, ...importedPointValues } },
    cardOverrides: { ...base.cardOverrides, ...importedCardSettings },
    monthlyCardUsage: { ...importedMonthlyCardUsage },
    usage: { ...importedBenefitUsage },
    notes: { ...importedNotes },
    backupMeta: { ...base.backupMeta, ...importedBackupMeta }
  };
  const known = new Set(CARDS.map((card) => card.id));
  merged.selectedMonth = state.selectedMonth || base.selectedMonth;
  merged.selectedSubcategory = state.selectedSubcategory || '';
  merged.cardOrder = [...new Set([...(state.cardOrder || []), ...base.cardOrder])].filter((id) => known.has(id));
  for (const card of CARDS) {
    merged.cardOverrides[card.id] = {
      ...base.cardOverrides[card.id],
      ...(merged.cardOverrides[card.id] || {}),
      cycle: {
        ...(base.cardOverrides[card.id]?.cycle || {}),
        ...(card.defaultCycle || {}),
        ...(merged.cardOverrides[card.id]?.cycle || {})
      }
    };
  }
  if (String(state.schemaVersion || '') !== SCHEMA_VERSION) {
    for (const [cardId, target] of Object.entries(MONTHLY_TARGET_MIGRATIONS)) {
      if (Number(merged.cardOverrides[cardId]?.monthlyTarget || 0) === 0) {
        merged.cardOverrides[cardId].monthlyTarget = target;
      }
    }
  }
  if (!state.monthlyCardUsage) {
    merged.monthlyCardUsage[merged.selectedMonth] = Object.fromEntries(CARDS.map((card) => {
      const override = merged.cardOverrides[card.id] || {};
      return [card.id, {
        prevMonthStatus: override.prevMonthStatus || 'manual',
        currentMonthSpend: Number(override.currentMonthSpend || 0)
      }];
    }));
  }
  merged.schemaVersion = SCHEMA_VERSION;
  merged.appVersion = APP_VERSION;
  return merged;
}

export function exportState(state) {
  const cardSettings = state.cardOverrides || {};
  const exportedAt = new Date().toISOString();
  const lastBackupAt = state.backupMeta?.lastBackupAt || exportedAt;
  return JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt,
    pointValues: state.settings?.pointValues || {},
    cardOrder: state.cardOrder || [],
    cardSettings,
    selectedMonth: state.selectedMonth || getMonthKey(),
    selectedCategory: state.selectedCategory || '',
    selectedSubcategory: state.selectedSubcategory || '',
    monthlyCardUsage: state.monthlyCardUsage || {},
    monthlyUsage: Object.fromEntries(Object.entries(cardSettings).map(([cardId, card]) => [cardId, {
      target: Number(card.monthlyTarget || 0),
      current: Number(card.currentMonthSpend || 0),
      prevMonthStatus: card.prevMonthStatus || 'manual'
    }])),
    annualUsage: Object.fromEntries(Object.entries(cardSettings).map(([cardId, card]) => [cardId, {
      target: Number(card.annualTarget || 0),
      current: Number(card.annualSpend || 0),
      cycle: card.cycle || {}
    }])),
    benefitUsage: state.usage || {},
    notes: state.notes || {},
    lastBackupAt,
    backupMeta: { ...(state.backupMeta || {}), lastBackupAt }
  }, null, 2);
}

export function importState(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('JSON 문법이 올바르지 않습니다. 이 앱에서 내보낸 백업 파일인지 확인해 주세요.');
  }
  if (parsed.schemaVersion && !['1.0.0', '2.0.0', '2.0.1'].includes(String(parsed.schemaVersion))) {
    throw new Error(`지원하지 않는 schemaVersion(${parsed.schemaVersion})입니다. 최신 백업 파일인지 확인해 주세요.`);
  }
  return migrateState({
    ...parsed,
    backupMeta: { ...(parsed.backupMeta || {}), lastImportAt: new Date().toISOString() }
  });
}

export function resetState() {
  const state = createInitialState();
  saveState(state);
  return state;
}
