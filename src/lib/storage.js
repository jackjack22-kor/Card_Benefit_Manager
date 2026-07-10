import { CARDS, DEFAULT_HIDDEN_CARD_IDS, POINT_DEFAULTS } from '../data/cards.js';
import { CATEGORIES } from '../data/categories.js';
import { APP_STORAGE_KEY, IS_PUBLIC_EDITION } from './appEdition.js';
import { getMonthKey } from './cycles.js';
import { createDefaultCardOverride, getRuntimeCardMap, sanitizeOwnedCatalogCards } from './ownedCards.js';

export const STORAGE_KEY = APP_STORAGE_KEY;
export const SCHEMA_VERSION = '2.1.0';
export const APP_VERSION = '1.0.0-single-html';

const MONTHLY_TARGET_MIGRATIONS = {
  'kb-talktalk-my-point': 200000,
  'shinhan-always-on': 10000
};
const UNMANAGED_MONTHLY_TARGET_REPAIRS = new Set(['marriott-best-shinhan']);
const VALID_TABS = new Set(['dashboard', 'cards', 'recommend', ...(IS_PUBLIC_EDITION ? ['catalog'] : []), 'settings']);
const CATEGORY_IDS = new Set(CATEGORIES.map((item) => item.id));
const POINT_KEYS = new Set(Object.keys(POINT_DEFAULTS));

export function createInitialState() {
  const currentMonth = getMonthKey();
  const ownedCardIds = IS_PUBLIC_EDITION ? [] : CARDS.map((card) => card.id);
  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: {
      darkMode: true,
      pointValues: { ...POINT_DEFAULTS },
      pointValuesUpdatedAt: {},
      recommendMode: 'bestValue'
    },
    selectedTab: 'dashboard',
    selectedMonth: currentMonth,
    selectedCategory: 'evcharge',
    selectedSubcategory: '',
    recommendationAmount: 10000,
    selectedCardId: ownedCardIds[0] || '',
    isSortingCards: false,
    cardSettingsOpen: false,
    ownedCardIds,
    removedOwnedCardIds: [],
    ownedCatalogCards: {},
    cardOrder: IS_PUBLIC_EDITION ? [] : CARDS.map((card) => card.id),
    cardOrderUpdatedAt: '',
    hiddenCardIds: IS_PUBLIC_EDITION ? [] : [...DEFAULT_HIDDEN_CARD_IDS],
    hiddenCardIdsUpdatedAt: '',
    cardOverrides: Object.fromEntries(CARDS.map((card) => [card.id, createDefaultCardOverride(card)])),
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
  const importedPointValuesUpdatedAt = sanitizePointValueTimestamps(state.pointValuesUpdatedAt || importedSettings.pointValuesUpdatedAt || {});
  const importedCardSettings = state.cardSettings || state.cardOverrides || {};
  const importedBenefitUsage = state.benefitUsage || state.usage || {};
  const importedMonthlyCardUsage = state.monthlyCardUsage || {};
  const importedNotes = state.notes || {};
  const importedOwnedCatalogCards = sanitizeOwnedCatalogCards(state.ownedCatalogCards || {});
  const importedBackupMeta = {
    ...(state.backupMeta || {}),
    ...(state.lastBackupAt ? { lastBackupAt: state.lastBackupAt } : {})
  };
  const merged = {
    ...base,
    ...state,
    settings: {
      ...base.settings,
      ...importedSettings,
      pointValues: { ...base.settings.pointValues, ...importedPointValues },
      pointValuesUpdatedAt: { ...importedPointValuesUpdatedAt }
    },
    cardOverrides: { ...base.cardOverrides, ...importedCardSettings },
    ownedCatalogCards: importedOwnedCatalogCards,
    monthlyCardUsage: { ...importedMonthlyCardUsage },
    usage: { ...importedBenefitUsage },
    notes: { ...importedNotes },
    syncConflicts: Array.isArray(state.syncConflicts) ? state.syncConflicts : [],
    backupMeta: { ...base.backupMeta, ...importedBackupMeta }
  };
  const runtimeCardMap = getRuntimeCardMap(merged);
  const known = new Set(runtimeCardMap.keys());
  merged.selectedTab = VALID_TABS.has(state.selectedTab) ? state.selectedTab : base.selectedTab;
  merged.selectedCategory = CATEGORY_IDS.has(state.selectedCategory) ? state.selectedCategory : base.selectedCategory;
  merged.selectedMonth = state.selectedMonth || base.selectedMonth;
  merged.selectedSubcategory = state.selectedSubcategory || '';
  const previousCardOrder = Array.isArray(state.cardOrder) ? state.cardOrder : [];
  const previousHidden = new Set(Array.isArray(state.hiddenCardIds) ? state.hiddenCardIds : []);
  const hasOwnedCardState = Array.isArray(state.ownedCardIds);
  const migratedPublicOwnedIds = previousCardOrder.filter((id) => known.has(id) && !previousHidden.has(id));
  merged.ownedCardIds = sanitizeCardIdList(
    hasOwnedCardState
      ? state.ownedCardIds
      : (IS_PUBLIC_EDITION ? migratedPublicOwnedIds : CARDS.map((card) => card.id)),
    known
  );
  const ownedCardIdSet = new Set(merged.ownedCardIds);
  merged.removedOwnedCardIds = sanitizeCardIdList(state.removedOwnedCardIds || [], known)
    .filter((id) => !ownedCardIdSet.has(id));
  const newlyIntroducedDefaultHidden = IS_PUBLIC_EDITION
    ? []
    : DEFAULT_HIDDEN_CARD_IDS.filter((id) => !previousCardOrder.includes(id));
  merged.cardOrder = [...new Set([
    ...(state.cardOrder || []),
    ...merged.ownedCardIds,
    ...(IS_PUBLIC_EDITION ? [] : base.cardOrder)
  ])].filter((id) => known.has(id) && (!IS_PUBLIC_EDITION || ownedCardIdSet.has(id)));
  merged.hiddenCardIds = sanitizeCardIdList(
    [...(state.hiddenCardIds || []), ...newlyIntroducedDefaultHidden],
    IS_PUBLIC_EDITION ? ownedCardIdSet : known
  );
  if (IS_PUBLIC_EDITION && !ownedCardIdSet.has(merged.selectedCardId)) {
    merged.selectedCardId = merged.cardOrder.find((id) => !merged.hiddenCardIds.includes(id)) || '';
  }
  merged.cardOrderUpdatedAt = state.cardOrderUpdatedAt || (isDefaultCardOrder(merged.cardOrder) ? '' : new Date().toISOString());
  merged.hiddenCardIdsUpdatedAt = state.hiddenCardIdsUpdatedAt || (isDefaultHiddenCardIds(merged.hiddenCardIds) ? '' : new Date().toISOString());
  for (const key of Object.keys(importedPointValues)) {
    if (!merged.settings.pointValuesUpdatedAt[key] && Number(importedPointValues[key] || 0) !== Number(POINT_DEFAULTS[key] || 1)) {
      merged.settings.pointValuesUpdatedAt[key] = new Date().toISOString();
    }
  }
  for (const card of runtimeCardMap.values()) {
    const baseOverride = base.cardOverrides[card.id] || createDefaultCardOverride(card);
    const importedOverride = importedCardSettings?.[card.id] || {};
    const importedCycle = importedOverride.cycle || {};
    const hasImportedMonthlyTarget = Object.prototype.hasOwnProperty.call(importedOverride, 'monthlyTarget');
    const monthlyTarget = Object.prototype.hasOwnProperty.call(merged.cardOverrides[card.id] || {}, 'monthlyTarget')
      ? Number(merged.cardOverrides[card.id]?.monthlyTarget || 0)
      : Number(baseOverride.monthlyTarget || 0);
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
    const hasImportedAnnualTarget = Object.prototype.hasOwnProperty.call(importedOverride, 'annualTarget');
    const annualTarget = Object.prototype.hasOwnProperty.call(merged.cardOverrides[card.id] || {}, 'annualTarget')
      ? Number(merged.cardOverrides[card.id]?.annualTarget || 0)
      : Number(baseOverride.annualTarget || 0);
    const defaultAnnualTarget = Number(baseOverride.annualTarget || 0);
    const annualTargetUpdatedAt = String(merged.cardOverrides[card.id]?.annualTargetUpdatedAt || '');
    const annualTargetUserSet = merged.cardOverrides[card.id]?.annualTargetUserSet === true
      || Boolean(annualTargetUpdatedAt)
      || (hasImportedAnnualTarget && annualTarget !== defaultAnnualTarget);
    const hasImportedAnnualSpend = Object.prototype.hasOwnProperty.call(importedOverride, 'annualSpend');
    const annualSpend = Number(merged.cardOverrides[card.id]?.annualSpend || 0);
    const annualSpendUpdatedAt = String(merged.cardOverrides[card.id]?.annualSpendUpdatedAt || '');
    const annualSpendUserSet = merged.cardOverrides[card.id]?.annualSpendUserSet === true
      || Boolean(annualSpendUpdatedAt)
      || (hasImportedAnnualSpend && annualSpend !== 0);
    const defaultCycleType = card.defaultCycle?.type || 'calendar';
    const cycleType = merged.cardOverrides[card.id]?.cycle?.type || defaultCycleType;
    const cycleTypeUpdatedAt = String(merged.cardOverrides[card.id]?.cycleTypeUpdatedAt || '');
    const cycleTypeUserSet = merged.cardOverrides[card.id]?.cycleTypeUserSet === true
      || Boolean(cycleTypeUpdatedAt)
      || (Object.prototype.hasOwnProperty.call(importedCycle, 'type') && cycleType !== defaultCycleType);
    const defaultAnnualFeeStartMonth = Number(card.defaultCycle?.startMonth || 1);
    const annualFeeStartMonth = Number(
      merged.cardOverrides[card.id]?.cycle?.annualFeeStartMonth
      || merged.cardOverrides[card.id]?.cycle?.startMonth
      || defaultAnnualFeeStartMonth
    );
    const annualFeeStartMonthUpdatedAt = String(merged.cardOverrides[card.id]?.annualFeeStartMonthUpdatedAt || '');
    const hasImportedAnnualFeeStartMonth = Object.prototype.hasOwnProperty.call(importedCycle, 'annualFeeStartMonth')
      || (Object.prototype.hasOwnProperty.call(importedCycle, 'startMonth') && Number(importedCycle.startMonth || 1) !== defaultAnnualFeeStartMonth);
    const annualFeeStartMonthUserSet = merged.cardOverrides[card.id]?.annualFeeStartMonthUserSet === true
      || Boolean(annualFeeStartMonthUpdatedAt)
      || (hasImportedAnnualFeeStartMonth && annualFeeStartMonth !== defaultAnnualFeeStartMonth);
    const memo = String(merged.cardOverrides[card.id]?.memo || '');
    const memoUpdatedAt = String(merged.cardOverrides[card.id]?.memoUpdatedAt || '');
    const memoUserSet = merged.cardOverrides[card.id]?.memoUserSet === true
      || Boolean(memoUpdatedAt)
      || Boolean(memo);
    merged.cardOverrides[card.id] = {
      ...baseOverride,
      ...(merged.cardOverrides[card.id] || {}),
      prevMonthStatus: normalizePrevMonthStatus(merged.cardOverrides[card.id]?.prevMonthStatus),
      currentMonthSpend: Number(merged.cardOverrides[card.id]?.currentMonthSpend || 0),
      monthlyTarget: normalizedMonthlyTarget,
      monthlyTargetUserSet: monthlyTargetUserSet || repairUnmanagedTarget,
      monthlyTargetUpdatedAt: normalizedMonthlyTargetUpdatedAt,
      annualSpend,
      annualSpendUserSet,
      annualSpendUpdatedAt,
      annualTarget,
      annualTargetUserSet,
      annualTargetUpdatedAt,
      cycleTypeUserSet,
      cycleTypeUpdatedAt,
      annualFeeStartMonthUserSet,
      annualFeeStartMonthUpdatedAt,
      cycle: {
        ...(baseOverride.cycle || {}),
        ...(card.defaultCycle || {}),
        ...(merged.cardOverrides[card.id]?.cycle || {}),
        annualFeeStartMonth
      },
      memo,
      memoUserSet,
      memoUpdatedAt
    };
  }
  merged.monthlyCardUsage = sanitizeMonthlyCardUsage(merged.monthlyCardUsage, known);
  if (String(state.schemaVersion || '') !== SCHEMA_VERSION) {
    for (const [cardId, target] of Object.entries(MONTHLY_TARGET_MIGRATIONS)) {
      const override = merged.cardOverrides[cardId];
      if (override && Number(override.monthlyTarget || 0) === 0 && override.monthlyTargetUserSet !== true && !override.monthlyTargetUpdatedAt) {
        merged.cardOverrides[cardId].monthlyTarget = target;
        merged.cardOverrides[cardId].monthlyTargetUserSet = true;
        merged.cardOverrides[cardId].monthlyTargetUpdatedAt = merged.cardOverrides[cardId].monthlyTargetUpdatedAt || new Date().toISOString();
      }
    }
  }
  if (!state.monthlyCardUsage) {
    merged.monthlyCardUsage[merged.selectedMonth] = Object.fromEntries([...runtimeCardMap.values()].map((card) => {
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
    pointValuesUpdatedAt: state.settings?.pointValuesUpdatedAt || {},
    ownedCardIds: state.ownedCardIds || [],
    removedOwnedCardIds: state.removedOwnedCardIds || [],
    ownedCatalogCards: state.ownedCatalogCards || {},
    cardOrder: state.cardOrder || [],
    cardOrderUpdatedAt: state.cardOrderUpdatedAt || '',
    hiddenCardIds: state.hiddenCardIds || [],
    hiddenCardIdsUpdatedAt: state.hiddenCardIdsUpdatedAt || '',
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
  if (parsed.schemaVersion && !['1.0.0', '2.0.0', '2.0.1', '2.1.0'].includes(String(parsed.schemaVersion))) {
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
    .map(([key, value]) => {
      const numeric = Number(value);
      return [key, Number.isFinite(numeric) && numeric >= 0 ? numeric : (POINT_DEFAULTS[key] || 1)];
    }));
}

function sanitizePointValueTimestamps(values = {}) {
  return Object.fromEntries(Object.entries(values || {})
    .filter(([key]) => POINT_KEYS.has(key))
    .map(([key, value]) => [key, String(value || '')]));
}

function isDefaultCardOrder(order = []) {
  const defaultOrder = CARDS.map((card) => card.id);
  return JSON.stringify(order || []) === JSON.stringify(defaultOrder);
}

function isDefaultHiddenCardIds(ids = []) {
  return JSON.stringify([...(ids || [])].sort()) === JSON.stringify([...DEFAULT_HIDDEN_CARD_IDS].sort());
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
    parsed.ownedCardIds,
    parsed.removedOwnedCardIds,
    parsed.ownedCatalogCards,
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
