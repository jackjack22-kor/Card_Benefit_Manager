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
let status = {
  configured: isFirebaseConfigured(),
  state: isFirebaseConfigured() ? 'initializing' : 'disabled',
  message: isFirebaseConfigured() ? '클라우드 동기화 모듈을 준비 중입니다.' : 'Firebase 설정이 없습니다.',
  user: null,
  lastSyncedAt: '',
  error: ''
};

export function getInitialSyncStatus() {
  return { ...status };
}

export function initSync(nextCallbacks) {
  callbacks = { ...callbacks, ...nextCallbacks };
  if (!isFirebaseConfigured()) {
    publish({ state: 'disabled', message: 'Firebase 설정이 없어 로컬 전용으로 실행 중입니다.' });
    return;
  }
  publish({ state: 'initializing', message: 'Google 로그인 상태를 확인하는 중입니다.' });
  queueMicrotask(() => {
    prepareCloudSync();
  });
}

export function prepareCloudSync() {
  if (!isFirebaseConfigured()) return Promise.resolve(null);
  loadManager().then((loaded) => {
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
  if (!managerPromise) {
    managerPromise = import('./syncManager.js').then((loaded) => {
      manager = loaded;
      return loaded;
    });
  }
  return managerPromise;
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
  status = { ...status, configured: isFirebaseConfigured(), ...patch };
  callbacks.onStatusChange({ ...status });
}

function markPendingCloudSave() {
  try {
    localStorage.setItem(PENDING_SAVE_KEY, new Date().toISOString());
  } catch {
    // Best effort only.
  }
}
