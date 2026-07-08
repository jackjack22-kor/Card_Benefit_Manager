import { ENABLE_CLOUD_SYNC, IS_PUBLIC_EDITION } from '../appEdition.js';
import { isFirebaseConfigured } from './firebaseConfig.js';

const PENDING_SAVE_KEY = 'cardBenefitManager.pendingCloudSave';

let callbacks = {
  getState: () => ({}),
  applyRemoteState: () => {},
  onStatusChange: () => {}
};
let managerPromise = null;
let manager = null;
let pendingSave = false;
let runtimeStarted = false;
const loadCloudSyncManager = import.meta.env.VITE_APP_EDITION === 'public'
  ? () => Promise.resolve(null)
  : () => {
      if (!managerPromise) {
        managerPromise = import('./syncManager.js').then((loaded) => {
          manager = loaded;
          return loaded;
        });
      }
      return managerPromise;
    };
let status = {
  configured: ENABLE_CLOUD_SYNC && isFirebaseConfigured(),
  state: ENABLE_CLOUD_SYNC && isFirebaseConfigured() ? 'initializing' : 'disabled',
  message: initialSyncMessage(),
  user: null,
  lastSyncedAt: '',
  error: ''
};

export function getInitialSyncStatus() {
  return { ...status };
}

export function initSync(nextCallbacks) {
  callbacks = { ...callbacks, ...nextCallbacks };
  if (!ENABLE_CLOUD_SYNC || !isFirebaseConfigured()) {
    publish({ state: 'disabled', message: initialSyncMessage() });
    return;
  }
  publish({ state: 'initializing', message: 'Google 로그인 상태를 확인하는 중입니다.' });
  queueMicrotask(() => {
    prepareCloudSync();
  });
}

export function prepareCloudSync() {
  if (!ENABLE_CLOUD_SYNC || !isFirebaseConfigured()) return Promise.resolve(null);
  loadManager().then((loaded) => {
    if (!loaded) return;
    startRuntime(loaded);
  }).catch((error) => {
    publish({
      state: 'error',
      message: '클라우드 동기화 모듈을 불러오지 못했습니다.',
      error: error.message || String(error)
    });
  });
  return managerPromise;
}

export function queueCloudSave(state) {
  if (!ENABLE_CLOUD_SYNC) return;
  if (manager) {
    manager.queueCloudSave(state);
    return;
  }
  pendingSave = true;
  markPendingCloudSave();
  prepareCloudSync();
}

export async function requestCloudSignIn() {
  const loaded = await prepareCloudSync();
  if (!loaded) return;
  return loaded.requestCloudSignIn();
}

export async function requestCloudSignOut() {
  const loaded = await prepareCloudSync();
  if (!loaded) return;
  return loaded.requestCloudSignOut();
}

export async function requestCloudSyncNow() {
  const loaded = await prepareCloudSync();
  if (!loaded) return;
  return loaded.requestCloudSyncNow();
}

function loadManager() {
  return loadCloudSyncManager();
}

function startRuntime(loaded) {
  if (runtimeStarted) return;
  runtimeStarted = true;
  loaded.initSync({
    getState: callbacks.getState,
    applyRemoteState: callbacks.applyRemoteState,
    onStatusChange: publish
  });
  if (pendingSave) {
    pendingSave = false;
    loaded.queueCloudSave(callbacks.getState());
  }
}

function publish(patch) {
  status = { ...status, configured: ENABLE_CLOUD_SYNC && isFirebaseConfigured(), ...patch };
  callbacks.onStatusChange({ ...status });
}

function markPendingCloudSave() {
  try {
    localStorage.setItem(PENDING_SAVE_KEY, new Date().toISOString());
  } catch {
    // Best effort only.
  }
}

function initialSyncMessage() {
  if (IS_PUBLIC_EDITION) return '공개판은 이 브라우저에만 저장됩니다. JSON 백업으로 데이터를 보관하세요.';
  return isFirebaseConfigured() ? '클라우드 동기화 모듈을 준비 중입니다.' : 'Firebase 설정이 없습니다.';
}
