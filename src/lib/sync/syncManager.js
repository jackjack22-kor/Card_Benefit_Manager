import { GoogleAuthProvider, getRedirectResult, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { CARDS } from '../../data/cards.js';
import { migrateState } from '../storage.js';
import { getFirebaseServices, isFirebaseConfigured } from './firebaseClient.js';

const DEVICE_KEY = 'cardBenefitManager.deviceId';
const PENDING_SAVE_KEY = 'cardBenefitManager.pendingCloudSave';
const SYNC_DEBOUNCE_MS = 1200;
const CLOUD_DOC_ID = 'cardfit';
const CONFLICT_ROOTS = ['cardOverrides', 'monthlyCardUsage', 'usage', 'notes', 'settings.pointValues', 'cardOrder', 'hiddenCardIds'];
const MAX_CONFLICTS = 20;
const CARD_OVERRIDE_FIELDS = [
  { field: 'monthlyTarget', userSet: 'monthlyTargetUserSet', updatedAt: 'monthlyTargetUpdatedAt', defaultValue: (card) => Number(card?.defaultMonthlyTarget || 0), normalize: numberValue },
  { field: 'annualTarget', userSet: 'annualTargetUserSet', updatedAt: 'annualTargetUpdatedAt', defaultValue: (card) => Number(card?.annualTargets?.[0] || 0), normalize: numberValue },
  { field: 'annualSpend', userSet: 'annualSpendUserSet', updatedAt: 'annualSpendUpdatedAt', defaultValue: () => 0, normalize: numberValue },
  { field: 'memo', userSet: 'memoUserSet', updatedAt: 'memoUpdatedAt', defaultValue: () => '', normalize: stringValue }
];
const CARD_CYCLE_FIELDS = [
  { field: 'type', userSet: 'cycleTypeUserSet', updatedAt: 'cycleTypeUpdatedAt', defaultValue: (card) => card?.defaultCycle?.type || 'calendar', normalize: stringValue },
  { field: 'annualFeeStartMonth', userSet: 'annualFeeStartMonthUserSet', updatedAt: 'annualFeeStartMonthUpdatedAt', defaultValue: (card) => Number(card?.defaultCycle?.startMonth || 1), normalize: numberValue }
];

let callbacks = {
  getState: () => ({}),
  applyRemoteState: () => {},
  onStatusChange: () => {}
};
let services = null;
let currentUser = null;
let unsubscribeCloud = null;
let saveTimer = null;
let initialized = false;
let lastAppliedRevision = 0;
let lastSyncedState = null;
let savingRemote = false;
let authSettled = false;

let syncStatus = {
  configured: isFirebaseConfigured(),
  state: isFirebaseConfigured() ? 'initializing' : 'disabled',
  message: isFirebaseConfigured() ? '클라우드 동기화 준비 중' : 'Firebase 설정이 없습니다.',
  user: null,
  lastSyncedAt: '',
  error: ''
};

export function getInitialSyncStatus() {
  return { ...syncStatus };
}

export function initSync(nextCallbacks) {
  callbacks = { ...callbacks, ...nextCallbacks };
  if (initialized) return;
  initialized = true;
  bindPageLifecycleFlush();

  services = getFirebaseServices();
  if (!services) {
    publish({ state: 'disabled', message: 'Firebase 설정이 없어 로컬 전용으로 실행 중입니다.' });
    return;
  }

  const startAuthListener = () => {
    getRedirectResult(services.auth).catch(() => {});

    onAuthStateChanged(services.auth, async (user) => {
      authSettled = true;
      currentUser = user;
      clearCloudSubscription();
      if (!user) {
        lastAppliedRevision = 0;
        lastSyncedState = null;
      publish({ state: 'signed-out', user: null, message: '로그인하지 않음: 이 기기에만 저장됩니다.' });
        return;
      }

    publish({
      state: 'loading',
      user: userSummary(user),
      message: '클라우드 데이터를 확인하는 중입니다.'
    });

    try {
      await connectCloudState(user);
      if (hasPendingCloudSave()) await flushCloudSave(callbacks.getState());
    } catch (error) {
      publish({
        state: 'error',
        user: userSummary(user),
        message: '클라우드 동기화를 시작하지 못했습니다.',
        error: error.message || String(error)
      });
    }
  });
  };

  (services.persistenceReady || Promise.resolve())
    .catch((error) => {
      publish({
        state: 'error',
        user: null,
        message: '로그인 저장소를 준비하지 못했습니다.',
        error: error.message || String(error)
      });
    })
    .finally(startAuthListener);
}

export async function requestCloudSignIn() {
  services = services || getFirebaseServices();
  if (!services) return;
  await services.persistenceReady;
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(services.auth, provider);
  } catch (error) {
    if (['auth/popup-blocked', 'auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(error.code)) {
      await signInWithRedirect(services.auth, provider);
      return;
    }
    throw error;
  }
}

export async function requestCloudSignOut() {
  if (!services) return;
  await flushCloudSave();
  await signOut(services.auth);
}

export function queueCloudSave(state) {
  if (!services || savingRemote) return;
  if (!currentUser) {
    markPendingCloudSave();
    return;
  }
  markPendingCloudSave();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    flushCloudSave(callbacks.getState()).catch((error) => {
      publish({
        state: 'error',
        user: userSummary(currentUser),
        message: '클라우드 저장에 실패했습니다. 로컬 데이터는 유지됩니다.',
        error: error.message || String(error)
      });
    });
  }, SYNC_DEBOUNCE_MS);
}

export async function requestCloudSyncNow() {
  if (!currentUser || !services) return;
  markPendingCloudSave();
  await flushCloudSave(callbacks.getState());
}

async function connectCloudState(user) {
  const ref = cloudDocRef(user.uid);
  const snapshot = await getDoc(ref);
  const localState = callbacks.getState();

  if (!snapshot.exists()) {
    const result = await writeCloudState(localState);
    lastAppliedRevision = result.revision;
    lastSyncedState = result.state;
    clearPendingCloudSave();
    subscribeCloud(user.uid);
    publish({
      state: 'synced',
      user: userSummary(user),
      message: '이 기기의 데이터를 클라우드에 처음 저장했습니다.',
      lastSyncedAt: new Date().toISOString()
    });
    return;
  }

  const cloud = snapshot.data();
  const cloudState = cloud?.state ? migrateState(cloud.state) : null;
  const cloudRevision = Number(cloud?.revision || 0);
  const merged = cloudState ? mergeStates(localState, cloudState) : localState;
  lastAppliedRevision = Math.max(cloudRevision, Number(merged.syncMeta?.revision || 0));
  lastSyncedState = cloudState || merged;

  try {
    savingRemote = true;
    callbacks.applyRemoteState(withSyncMeta(merged, {
      lastCloudSyncAt: new Date().toISOString(),
      revision: lastAppliedRevision,
      cloudRevision,
      cloudUserId: user.uid
    }));
  } finally {
    savingRemote = false;
  }

  const result = await writeCloudState(callbacks.getState());
  lastAppliedRevision = result.revision;
  lastSyncedState = result.state;
  clearPendingCloudSave();
  subscribeCloud(user.uid);
  publish({
    state: 'synced',
    user: userSummary(user),
    message: '클라우드와 이 기기의 데이터를 병합했습니다.',
    lastSyncedAt: new Date().toISOString()
  });
}

function subscribeCloud(uid) {
  const ref = cloudDocRef(uid);
  unsubscribeCloud = onSnapshot(ref, (snapshot) => {
    if (!snapshot.exists() || snapshot.metadata.hasPendingWrites) return;
    const data = snapshot.data();
    const revision = Number(data?.revision || 0);
    if (revision <= lastAppliedRevision) return;
    if (!data.state) return;

    try {
      const incomingState = migrateState(data.state);
      const localState = callbacks.getState();
      const nextState = mergeStates(localState, incomingState);
      lastAppliedRevision = revision;
      lastSyncedState = incomingState;
      const remoteState = withSyncMeta(nextState, {
        lastCloudSyncAt: new Date().toISOString(),
        revision,
        cloudRevision: revision,
        cloudUserId: uid
      });
      try {
        savingRemote = true;
        callbacks.applyRemoteState(remoteState);
      } finally {
        savingRemote = false;
      }
      publish({
        state: 'synced',
        user: userSummary(currentUser),
        message: '다른 기기의 변경사항을 반영했습니다.',
        lastSyncedAt: new Date().toISOString()
      });
    } catch (error) {
      publish({
        state: 'error',
        user: userSummary(currentUser),
        message: '클라우드 데이터를 읽지 못했습니다.',
        error: error.message || String(error)
      });
    }
  }, (error) => {
    publish({
      state: 'error',
      user: userSummary(currentUser),
      message: '클라우드 변경 감시에 실패했습니다.',
      error: error.message || String(error)
    });
  });
}

async function flushCloudSave(state = callbacks.getState()) {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!currentUser || !services || savingRemote) return;
  publish({ state: 'syncing', user: userSummary(currentUser), message: '클라우드에 저장 중입니다.' });
  markPendingCloudSave();
  const result = await writeCloudState(state);
  lastAppliedRevision = result.revision;
  lastSyncedState = result.state;
  clearPendingCloudSave();
  try {
    savingRemote = true;
    callbacks.applyRemoteState(result.state);
  } finally {
    savingRemote = false;
  }
  publish({
    state: 'synced',
    user: userSummary(currentUser),
    message: '클라우드에 저장되었습니다.',
    lastSyncedAt: new Date().toISOString()
  });
}

async function writeCloudState(state) {
  const now = new Date().toISOString();
  const ref = cloudDocRef(currentUser.uid);
  return runTransaction(services.db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const cloud = snapshot.exists() ? snapshot.data() : null;
    const cloudRevision = Number(cloud?.revision || 0);
    const cloudState = cloud?.state ? migrateState(cloud.state) : null;
    const conflicts = cloudState && cloudRevision > lastAppliedRevision
      ? detectFieldConflicts(lastSyncedState, state, cloudState)
      : [];
    const merged = cloudState && cloudRevision > lastAppliedRevision ? mergeStates(state, cloudState) : state;
    const nextState = conflicts.length ? withConflicts(merged, conflicts) : merged;
    const revision = Math.max(cloudRevision, lastAppliedRevision, Number(nextState.syncMeta?.revision || 0)) + 1;
    const next = withSyncMeta(nextState, {
      deviceId: getDeviceId(),
      lastCloudSyncAt: now,
      lastLocalEditAt: state.updatedAt || now,
      revision,
      cloudRevision: revision,
      cloudUserId: currentUser.uid
    });
    transaction.set(ref, {
      appId: 'cardfit',
      schemaVersion: next.schemaVersion || '2.0.0',
      clientUpdatedAt: now,
      deviceId: getDeviceId(),
      revision,
      updatedAt: serverTimestamp(),
      state: toPlainJson(next)
    }, { merge: true });
    return { revision, state: next };
  });
}

function mergeStates(localState, cloudState) {
  const localHasData = hasMeaningfulData(localState);
  const cloudHasData = hasMeaningfulData(cloudState);
  if (!cloudHasData) return localState;
  if (!localHasData) return cloudState;

  const localNewer = timestamp(localState.updatedAt) >= timestamp(cloudState.updatedAt);
  const primary = localNewer ? localState : cloudState;
  const secondary = localNewer ? cloudState : localState;

  return migrateState({
    ...secondary,
    ...primary,
    settings: {
      ...(secondary.settings || {}),
      ...(primary.settings || {}),
      pointValues: mergePointValues(secondary.settings || {}, primary.settings || {}),
      pointValuesUpdatedAt: mergePointValueTimestamps(secondary.settings || {}, primary.settings || {})
    },
    cardOrder: newerListField('cardOrder', secondary, primary, mergeOrder(primary.cardOrder, secondary.cardOrder)),
    hiddenCardIds: newerListField('hiddenCardIds', secondary, primary, Array.isArray(primary.hiddenCardIds) ? primary.hiddenCardIds : (secondary.hiddenCardIds || [])),
    cardOrderUpdatedAt: newerTimestamp(primary.cardOrderUpdatedAt, secondary.cardOrderUpdatedAt),
    hiddenCardIdsUpdatedAt: newerTimestamp(primary.hiddenCardIdsUpdatedAt, secondary.hiddenCardIdsUpdatedAt),
    cardOverrides: mergeCardOverrides(secondary.cardOverrides || {}, primary.cardOverrides || {}),
    monthlyCardUsage: mergeTimestampedRecords(secondary.monthlyCardUsage || {}, primary.monthlyCardUsage || {}),
    usage: mergeTimestampedRecords(secondary.usage || {}, primary.usage || {}),
    notes: deepMerge(secondary.notes || {}, primary.notes || {}),
    backupMeta: { ...(secondary.backupMeta || {}), ...(primary.backupMeta || {}) },
    syncMeta: { ...(secondary.syncMeta || {}), ...(primary.syncMeta || {}) }
  });
}

function detectFieldConflicts(baseState, localState, remoteState) {
  if (!baseState || !localState || !remoteState) return [];
  const paths = new Set();
  for (const root of CONFLICT_ROOTS) {
    flattenPaths(getPathValue(baseState, root), root, paths);
    flattenPaths(getPathValue(localState, root), root, paths);
    flattenPaths(getPathValue(remoteState, root), root, paths);
  }

  const conflicts = [];
  for (const path of paths) {
    const baseValue = getPathValue(baseState, path);
    const localValue = getPathValue(localState, path);
    const remoteValue = getPathValue(remoteState, path);
    const localChanged = !sameValue(localValue, baseValue);
    const remoteChanged = !sameValue(remoteValue, baseValue);
    if (!localChanged || !remoteChanged || sameValue(localValue, remoteValue)) continue;
    conflicts.push({
      id: conflictId(path),
      path,
      label: conflictLabel(path),
      baseValue,
      localValue,
      remoteValue,
      detectedAt: new Date().toISOString(),
      localUpdatedAt: localState.updatedAt || '',
      remoteUpdatedAt: remoteState.updatedAt || ''
    });
    if (conflicts.length >= MAX_CONFLICTS) break;
  }
  return conflicts;
}

function withConflicts(state, conflicts) {
  const existing = Array.isArray(state.syncConflicts) ? state.syncConflicts : [];
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const conflict of conflicts) byId.set(conflict.id, conflict);
  return { ...state, syncConflicts: [...byId.values()] };
}

function flattenPaths(value, prefix, output) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value);
    if (!entries.length) output.add(prefix);
    for (const [key, child] of entries) flattenPaths(child, `${prefix}.${key}`, output);
    return;
  }
  output.add(prefix);
}

function getPathValue(source, path) {
  return String(path).split('.').reduce((value, key) => (value == null ? undefined : value[key]), source);
}

function sameValue(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function conflictId(path) {
  return `conflict-${String(path).replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
}

function conflictLabel(path) {
  return String(path)
    .replace(/^monthlyCardUsage\./, '월별 실적 / ')
    .replace(/^usage\./, '혜택 사용 / ')
    .replace(/^cardOverrides\./, '카드 설정 / ')
    .replace(/^notes\./, '메모 / ')
    .replace(/^settings\.pointValues\./, '포인트 가치 / ')
    .replace(/^cardOrder$/, '카드 순서')
    .replace(/^hiddenCardIds$/, '숨김 카드');
}

function hasMeaningfulData(state) {
  if (!state) return false;
  if (Object.keys(state.usage || {}).length) return true;
  if (Object.keys(state.notes || {}).length) return true;
  if (Array.isArray(state.hiddenCardIds) && state.hiddenCardIds.length > 0) return true;
  if (Object.values(state.monthlyCardUsage || {}).some((month) => Object.values(month || {}).some((item) => Number(item.currentMonthSpend || 0) > 0 || item.prevMonthStatus === 'unmet' || item.prevMonthStatus === 'manual'))) return true;
  return Object.entries(state.cardOverrides || {}).some(([cardId, override]) => hasMeaningfulCardOverride(cardId, override));
}

function hasMeaningfulCardOverride(cardId, override = {}) {
  if (isExplicitCardOverride(cardId, override)) return true;
  if (Number(override.currentMonthSpend || 0) > 0) return true;
  if (Number(override.annualSpend || 0) > 0) return true;
  if (Boolean(override.memo)) return true;
  return false;
}

function mergeCardOverrides(base = {}, overlay = {}) {
  const output = deepMerge(base, overlay);
  for (const cardId of new Set([...Object.keys(base || {}), ...Object.keys(overlay || {})])) {
    const baseCard = base?.[cardId] || {};
    const overlayCard = overlay?.[cardId] || {};
    const card = CARDS.find((item) => item.id === cardId);
    output[cardId] = output[cardId] || {};
    for (const meta of CARD_OVERRIDE_FIELDS) mergeTrackedCardField(output[cardId], card, baseCard, overlayCard, meta);
    output[cardId].cycle = output[cardId].cycle || {};
    for (const meta of CARD_CYCLE_FIELDS) mergeTrackedCardField(output[cardId], card, baseCard, overlayCard, meta, { nested: 'cycle' });
  }
  return output;
}

function isExplicitMonthlyTarget(cardId, override = {}) {
  const card = CARDS.find((item) => item.id === cardId);
  return isExplicitTrackedField(card, override, CARD_OVERRIDE_FIELDS[0]);
}

function isExplicitCardOverride(cardId, override = {}) {
  const card = CARDS.find((item) => item.id === cardId);
  return CARD_OVERRIDE_FIELDS.some((meta) => isExplicitTrackedField(card, override, meta))
    || CARD_CYCLE_FIELDS.some((meta) => isExplicitTrackedField(card, override, meta, { nested: 'cycle' }));
}

function mergeTrackedCardField(output, card, baseCard, overlayCard, meta, options = {}) {
  const baseExplicit = isExplicitTrackedField(card, baseCard, meta, options);
  const overlayExplicit = isExplicitTrackedField(card, overlayCard, meta, options);
  const baseHas = hasTrackedValue(baseCard, meta, options);
  const overlayHas = hasTrackedValue(overlayCard, meta, options);
  const baseTime = timestamp(baseCard?.[meta.updatedAt]);
  const overlayTime = timestamp(overlayCard?.[meta.updatedAt]);
  if (baseExplicit && !overlayExplicit && baseHas) {
    applyTrackedCardField(output, baseCard, meta, options);
  } else if (overlayExplicit && !baseExplicit && overlayHas) {
    applyTrackedCardField(output, overlayCard, meta, options);
  } else if (baseExplicit && overlayExplicit && baseTime > overlayTime && baseHas) {
    applyTrackedCardField(output, baseCard, meta, options);
  } else if (baseExplicit && overlayExplicit && overlayTime > baseTime && overlayHas) {
    applyTrackedCardField(output, overlayCard, meta, options);
  }
}

function applyTrackedCardField(output, source, meta, options = {}) {
  if (options.nested) {
    output[options.nested] = { ...(output[options.nested] || {}), [meta.field]: source?.[options.nested]?.[meta.field] };
  } else {
    output[meta.field] = source?.[meta.field];
  }
  output[meta.userSet] = true;
  output[meta.updatedAt] = source?.[meta.updatedAt] || '';
}

function isExplicitTrackedField(card, override = {}, meta, options = {}) {
  if (!hasTrackedValue(override, meta, options)) return false;
  if (override?.[meta.userSet] === true) return true;
  if (override?.[meta.updatedAt]) return true;
  return meta.normalize(readTrackedValue(override, meta, options)) !== meta.normalize(meta.defaultValue(card));
}

function hasTrackedValue(source = {}, meta, options = {}) {
  const target = options.nested ? source?.[options.nested] : source;
  return Object.prototype.hasOwnProperty.call(target || {}, meta.field);
}

function readTrackedValue(source = {}, meta, options = {}) {
  return options.nested ? source?.[options.nested]?.[meta.field] : source?.[meta.field];
}

function mergePointValues(baseSettings = {}, overlaySettings = {}) {
  const output = {
    ...(baseSettings.pointValues || {}),
    ...(overlaySettings.pointValues || {})
  };
  const keys = new Set([...Object.keys(baseSettings.pointValues || {}), ...Object.keys(overlaySettings.pointValues || {})]);
  for (const key of keys) {
    const baseTime = timestamp(baseSettings.pointValuesUpdatedAt?.[key]);
    const overlayTime = timestamp(overlaySettings.pointValuesUpdatedAt?.[key]);
    if (baseTime > overlayTime && Object.prototype.hasOwnProperty.call(baseSettings.pointValues || {}, key)) {
      output[key] = baseSettings.pointValues[key];
    } else if (overlayTime > baseTime && Object.prototype.hasOwnProperty.call(overlaySettings.pointValues || {}, key)) {
      output[key] = overlaySettings.pointValues[key];
    }
  }
  return output;
}

function mergePointValueTimestamps(baseSettings = {}, overlaySettings = {}) {
  const output = {
    ...(baseSettings.pointValuesUpdatedAt || {}),
    ...(overlaySettings.pointValuesUpdatedAt || {})
  };
  const keys = new Set([...Object.keys(baseSettings.pointValuesUpdatedAt || {}), ...Object.keys(overlaySettings.pointValuesUpdatedAt || {})]);
  for (const key of keys) {
    output[key] = newerTimestamp(overlaySettings.pointValuesUpdatedAt?.[key], baseSettings.pointValuesUpdatedAt?.[key]);
  }
  return output;
}

function newerListField(field, secondary = {}, primary = {}, fallback = []) {
  const updatedAt = `${field}UpdatedAt`;
  const primaryTime = timestamp(primary?.[updatedAt]);
  const secondaryTime = timestamp(secondary?.[updatedAt]);
  if (secondaryTime > primaryTime && Array.isArray(secondary?.[field])) return secondary[field];
  if (primaryTime > secondaryTime && Array.isArray(primary?.[field])) return primary[field];
  return fallback;
}

function newerTimestamp(left = '', right = '') {
  return timestamp(left) >= timestamp(right) ? (left || right || '') : (right || left || '');
}

function mergeTimestampedRecords(base = {}, overlay = {}) {
  const output = deepMerge(base, overlay);
  for (const key of new Set([...Object.keys(base || {}), ...Object.keys(overlay || {})])) {
    const baseValue = base?.[key];
    const overlayValue = overlay?.[key];
    if (isPlainObject(baseValue) && isPlainObject(overlayValue)) {
      output[key] = mergeTimestampedRecords(baseValue, overlayValue);
      continue;
    }
    if (String(key).endsWith('UpdatedAt')) continue;
    const updatedAtKey = `${key}UpdatedAt`;
    const baseTime = timestamp(base?.[updatedAtKey]);
    const overlayTime = timestamp(overlay?.[updatedAtKey]);
    if (baseTime > overlayTime && Object.prototype.hasOwnProperty.call(base || {}, key)) {
      output[key] = baseValue;
      output[updatedAtKey] = base?.[updatedAtKey] || '';
    } else if (overlayTime > baseTime && Object.prototype.hasOwnProperty.call(overlay || {}, key)) {
      output[key] = overlayValue;
      output[updatedAtKey] = overlay?.[updatedAtKey] || '';
    }
  }
  return output;
}

function deepMerge(base, overlay) {
  const output = { ...base };
  for (const [key, value] of Object.entries(overlay || {})) {
    if (isPlainObject(value) && isPlainObject(base?.[key])) {
      output[key] = deepMerge(base[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function mergeOrder(primary = [], secondary = []) {
  return [...new Set([...(primary || []), ...(secondary || [])])];
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function numberValue(value) {
  return Number(value || 0);
}

function stringValue(value) {
  return String(value || '');
}

function withSyncMeta(state, meta) {
  return {
    ...state,
    syncMeta: {
      ...(state.syncMeta || {}),
      ...meta
    }
  };
}

function cloudDocRef(uid) {
  return doc(services.db, 'users', uid, 'private', CLOUD_DOC_ID);
}

function userSummary(user) {
  if (!user) return null;
  return {
    uid: user.uid,
    displayName: user.displayName || '',
    email: user.email || ''
  };
}

function publish(patch) {
  syncStatus = { ...syncStatus, configured: isFirebaseConfigured(), ...patch };
  callbacks.onStatusChange({ ...syncStatus });
}

function clearCloudSubscription() {
  if (unsubscribeCloud) unsubscribeCloud();
  unsubscribeCloud = null;
}

function bindPageLifecycleFlush() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const flushLatest = () => {
    if (!currentUser || !services || !saveTimer) return;
    flushCloudSave(callbacks.getState()).catch(() => {});
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushLatest();
  });
  window.addEventListener('pagehide', flushLatest);
}

function markPendingCloudSave() {
  try {
    localStorage.setItem(PENDING_SAVE_KEY, new Date().toISOString());
  } catch {
    // Best effort only.
  }
}

function clearPendingCloudSave() {
  try {
    localStorage.removeItem(PENDING_SAVE_KEY);
  } catch {
    // Best effort only.
  }
}

function hasPendingCloudSave() {
  try {
    return Boolean(localStorage.getItem(PENDING_SAVE_KEY));
  } catch {
    return false;
  }
}

function getDeviceId() {
  const id = crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    localStorage.setItem(DEVICE_KEY, id);
  } catch {
    return id;
  }
  return id;
}

function timestamp(value) {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}
