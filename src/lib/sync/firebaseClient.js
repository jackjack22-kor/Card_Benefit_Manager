import { initializeApp, getApps } from 'firebase/app';
import { browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig, isFirebaseConfigured } from './firebaseConfig.js';

let services = null;

export function getFirebaseServices() {
  if (!isFirebaseConfigured()) return null;
  if (services) return services;

  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const persistenceReady = setPersistence(auth, browserLocalPersistence);

  services = { app, auth, db, persistenceReady };
  return services;
}

export { isFirebaseConfigured };
