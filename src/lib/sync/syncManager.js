import { GoogleAuthProvider, getRedirectResult, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { migrateState } from '../storage.js';
import { getFirebaseServices, isFirebaseConfigured } from './firebaseClient.js';

const DEVICE_KEY = 'cardBenefitManager.deviceId';
const PENDING_SAVE_KEY = 'cardBenefitManager.pendingCloudSave';
const SYNC_DEBOUNCE_MS = 1200;
const CLOUD_DOC_ID = 'cardfit';

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
let savingRemote = false;

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

  getRedirectResult(services.auth).catch(() => {});

  onAuthStateChanged(services.auth, async (user) => {
    currentUser = user;
    clearCloudSubscription();
    if (!user) {
      lastAppliedRevision = 0;
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
}

export async function requestCloudSignIn() {
  services = services || getFirebaseServices();
  if (!services) return;
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
  if (!currentUser || !services || savingRemote) return;
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
      const shouldProtectLocal = Boolean(saveTimer) || timestamp(localState.updatedAt) > timestamp(incomingState.updatedAt);
      const nextState = shouldProtectLocal ? mergeStates(localState, incomingState) : incomingState;
      lastAppliedRevision = revision;
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
    const merged = cloudState && cloudRevision > lastAppliedRevision ? mergeStates(state, cloudState) : state;
    const revision = Math.max(cloudRevision, lastAppliedRevision, Number(merged.syncMeta?.revision || 0)) + 1;
    const next = withSyncMeta(merged, {
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
      pointValues: {
        ...(secondary.settings?.pointValues || {}),
        ...(primary.settings?.pointValues || {})
      }
    },
    cardOrder: mergeOrder(primary.cardOrder, secondary.cardOrder),
    cardOverrides: deepMerge(secondary.cardOverrides || {}, primary.cardOverrides || {}),
    monthlyCardUsage: deepMerge(secondary.monthlyCardUsage || {}, primary.monthlyCardUsage || {}),
    usage: deepMerge(secondary.usage || {}, primary.usage || {}),
    notes: deepMerge(secondary.notes || {}, primary.notes || {}),
    backupMeta: { ...(secondary.backupMeta || {}), ...(primary.backupMeta || {}) },
    syncMeta: { ...(secondary.syncMeta || {}), ...(primary.syncMeta || {}) }
  });
}

function hasMeaningfulData(state) {
  if (!state) return false;
  if (Object.keys(state.usage || {}).length) return true;
  if (Object.keys(state.notes || {}).length) return true;
  if (Object.values(state.monthlyCardUsage || {}).some((month) => Object.values(month || {}).some((item) => Number(item.currentMonthSpend || 0) > 0 || item.prevMonthStatus === 'unmet' || item.prevMonthStatus === 'manual'))) return true;
  return Object.values(state.cardOverrides || {}).some((card) => Number(card.currentMonthSpend || 0) > 0 || Number(card.annualSpend || 0) > 0 || Boolean(card.memo));
}

function deepMerge(base, overlay) {
  const output = { ...base };
  for (const [key, value] of Object.entries(overlay || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) && base?.[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
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
