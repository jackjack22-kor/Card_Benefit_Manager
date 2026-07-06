import { CARDS, DEFAULT_HIDDEN_CARD_IDS, POINT_DEFAULTS } from '../data/cards.js';
import { CATEGORIES } from '../data/categories.js';
import { getMonthKey } from './cycles.js';

export const STORAGE_KEY = 'cardBenefitManager.v1';
export const SCHEMA_VERSION = '2.0.1';
export const APP_VERSION = '1.0.0-single-html';

const MONTHLY_TARGET_MIGRATIONS = {
  'kb-talktalk-my-point': 200000,
  'shinhan-always-on': 10000
};
const UNMANAGED_MONTHLY_TARGET_REPAIRS = new Set(['marriott-best-shinhan']);
const VALID_TABS = new Set(['dashboard', 'cards', 'recommend', 'settings']);
const CATEGORY_IDS = new Set(CATEGORIES.map((item) => item.id));
const POINT_KEYS = new Set(Object.keys(POINT_DEFAULTS));

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
    hiddenCardIds: [...DEFAULT_HIDDEN_CARD_IDS],
    cardOverrides: Object.fromEntries(CARDS.map((card) => [card.id, {
      prevMonthStatus: 'met',
      currentMonthSpend: 0,
      monthlyTarget: card.defaultMonthlyTarget || 0,
      monthlyTargetUserSet: false,
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
    syncConflicts: [],
    backupMeta: {
      lastBackupAt: '',
      lastImportAt: ''
    }
  };
}

export function loadState() {
  let raw = '';
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    return migrateState(parsed);
  } catch (error) {
    console.error('Failed to load state', error);
    preserveCorruptState(raw);
    return createInitialState();
  }
}

export function saveState(state, options = {}) {
  const next = {
    ...state,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    updatedAt: options.touch === false ? state.updatedAt : new Date().toISOString()
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.error('Failed to save state', error);
    notifyStorageError(error);
  }
  return next;
}

export function migrateState(state) {
  if (!state || typeof state !== 'object') {
    throw new Error('백업 파일 형식이 올바르지 않습니다.');
  }
  const base = createInitialState();
  const importedSettings = state.settings || {};
  const importedPointValues = sanitizePointValues(state.pointValues || importedSettings.pointValues || {});
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
    syncConflicts: Array.isArray(state.syncConflicts) ? state.syncConflicts : [],
    backupMeta: { ...base.backupMeta, ...importedBackupMeta }
  };
  const known = new Set(CARDS.map((card) => card.id));
  merged.selectedTab = VALID_TABS.has(state.selectedTab) ? state.selectedTab : base.selectedTab;
  merged.selectedCategory = CATEGORY_IDS.has(state.selectedCategory) ? state.selectedCategory : base.selectedCategory;
  merged.selectedMonth = state.selectedMonth || base.selectedMonth;
  merged.selectedSubcategory = state.selectedSubcategory || '';
  const previousCardOrder = Array.isArray(state.cardOrder) ? state.cardOrder : [];
  const newlyIntroducedDefaultHidden = DEFAULT_HIDDEN_CARD_IDS.filter((id) => !previousCardOrder.includes(id));
  merged.cardOrder = [...new Set([...(state.cardOrder || []), ...base.cardOrder])].filter((id) => known.has(id));
  merged.hiddenCardIds = sanitizeCardIdList([...(state.hiddenCardIds || []), ...newlyIntroducedDefaultHidden], known);
  for (const card of CARDS) {
    const importedOverride = importedCardSettings?.[card.id] || {};
    const hasImportedMonthlyTarget = Object.prototype.hasOwnProperty.call(importedOverride, 'monthlyTarget');
    const monthlyTarget = Object.prototype.hasOwnProperty.call(merged.cardOverrides[card.id] || {}, 'monthlyTarget')
      ? Number(merged.cardOverrides[card.id]?.monthlyTarget || 0)
      : Number(base.cardOverrides[card.id]?.monthlyTarget || 0);
    const defaultMonthlyTarget = Number(card.defaultMonthlyTarget || 0);
    const monthlyTargetUpdatedAt = String(merged.cardOverrides[card.id]?.monthlyTargetUpdatedAt || '');
    const monthlyTargetUserSet = merged.cardOverrides[card.id]?.monthlyTargetUserSet === true
      || Boolean(monthlyTargetUpdatedAt)
      || (hasImportedMonthlyTarget && monthlyTarget !== defaultMonthlyTarget);
    const repairUnmanagedTarget = UNMANAGED_MONTHLY_TARGET_REPAIRS.has(card.id)
      && hasImportedMonthlyTarget
      && !monthlyTargetUserSet
      && monthlyTarget === defaultMonthlyTarget
      && defaultMonthlyTarget > 0;
    const normalizedMonthlyTarget = repairUnmanagedTarget ? 0 : monthlyTarget;
    const normalizedMonthlyTargetUpdatedAt = repairUnmanagedTarget
      ? (monthlyTargetUpdatedAt || new Date().toISOString())
      : monthlyTargetUpdatedAt;
    merged.cardOverrides[card.id] = {
      ...base.cardOverrides[card.id],
      ...(merged.cardOverrides[card.id] || {}),
      prevMonthStatus: normalizePrevMonthStatus(merged.cardOverrides[card.id]?.prevMonthStatus),
      currentMonthSpend: Number(merged.cardOverrides[card.id]?.currentMonthSpend || 0),
      monthlyTarget: normalizedMonthlyTarget,
      monthlyTargetUserSet: monthlyTargetUserSet || repairUnmanagedTarget,
      monthlyTargetUpdatedAt: normalizedMonthlyTargetUpdatedAt,
      annualSpend: Number(merged.cardOverrides[card.id]?.annualSpend || 0),
      annualTarget: Number(merged.cardOverrides[card.id]?.annualTarget || base.cardOverrides[card.id]?.annualTarget || 0),
      cycle: {
        ...(base.cardOverrides[card.id]?.cycle || {}),
        ...(card.defaultCycle || {}),
        ...(merged.cardOverrides[card.id]?.cycle || {})
      }
    };
  }
  merged.monthlyCardUsage = sanitizeMonthlyCardUsage(merged.monthlyCardUsage, known);
  if (String(state.schemaVersion || '') !== SCHEMA_VERSION) {
    for (const [cardId, target] of Object.entries(MONTHLY_TARGET_MIGRATIONS)) {
      if (Number(merged.cardOverrides[cardId]?.monthlyTarget || 0) === 0) {
        merged.cardOverrides[cardId].monthlyTarget = target;
        merged.cardOverrides[cardId].monthlyTargetUserSet = true;
        merged.cardOverrides[cardId].monthlyTargetUpdatedAt = merged.cardOverrides[cardId].monthlyTargetUpdatedAt || new Date().toISOString();
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
    hiddenCardIds: state.hiddenCardIds || [],
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
  if (!hasImportPayloadData(parsed)) {
    throw new Error('백업 파일에 복원할 카드/혜택 데이터가 없습니다.');
  }
  return migrateState({
    ...parsed,
    backupMeta: { ...(parsed.backupMeta || {}), lastImportAt: new Date().toISOString() }
  });
}

export function resetState() {
  const state = createInitialState();
  return saveState(state);
}

function sanitizePointValues(values = {}) {
  return Object.fromEntries(Object.entries(values)
    .filter(([key]) => POINT_KEYS.has(key))
    .map(([key, value]) => [key, Number(value) || POINT_DEFAULTS[key] || 1]));
}

function sanitizeMonthlyCardUsage(monthlyCardUsage = {}, knownCards = new Set()) {
  return Object.fromEntries(Object.entries(monthlyCardUsage || {}).map(([monthKey, cards]) => [
    monthKey,
    Object.fromEntries(Object.entries(cards || {})
      .filter(([cardId]) => knownCards.has(cardId))
      .map(([cardId, value]) => [cardId, {
        ...value,
        prevMonthStatus: normalizePrevMonthStatus(value?.prevMonthStatus),
        prevMonthStatusOverride: value?.prevMonthStatusOverride === true,
        currentMonthSpend: Number(value?.currentMonthSpend || 0)
      }]))
  ]));
}

function sanitizeCardIdList(ids = [], knownCards = new Set()) {
  return [...new Set(Array.isArray(ids) ? ids : [])].filter((id) => knownCards.has(id));
}

function normalizePrevMonthStatus(value) {
  return ['met', 'unmet', 'manual'].includes(value) ? value : 'manual';
}

function hasImportPayloadData(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  return [
    parsed.cardOverrides,
    parsed.cardSettings,
    parsed.monthlyCardUsage,
    parsed.usage,
    parsed.benefitUsage,
    parsed.notes,
    parsed.cardOrder,
    parsed.hiddenCardIds,
    parsed.settings,
    parsed.pointValues
  ].some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    return value && typeof value === 'object' && Object.keys(value).length > 0;
  });
}

function preserveCorruptState(raw) {
  if (!raw) return;
  try {
    localStorage.setItem(`${STORAGE_KEY}.corrupt.${Date.now()}`, raw);
  } catch {
    // Best effort only.
  }
}

function notifyStorageError(error) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('cardfit-storage-error', {
    detail: { message: error?.message || String(error) }
  }));
}
