export const firebaseConfig = {
  apiKey: 'AIzaSyBTEKwQPt7MFpuw4Cso6G32KImUgmD1mo8',
  authDomain: 'cardfit-ee4b5.firebaseapp.com',
  projectId: 'cardfit-ee4b5',
  storageBucket: 'cardfit-ee4b5.firebasestorage.app',
  messagingSenderId: '855811948893',
  appId: '1:855811948893:web:25a542aefb2689b0dd28b4'
};

export function isFirebaseConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
}
