const viteEnv = import.meta.env || {};
const processEnv = typeof process === 'undefined' ? {} : process.env;
const rawEdition = String(viteEnv.VITE_APP_EDITION || processEnv.VITE_APP_EDITION || viteEnv.MODE || 'personal').toLowerCase();

export const APP_EDITION = rawEdition === 'public' ? 'public' : 'personal';
export const IS_PUBLIC_EDITION = APP_EDITION === 'public';
export const ENABLE_CLOUD_SYNC = !IS_PUBLIC_EDITION;
export const APP_TITLE = IS_PUBLIC_EDITION ? 'CardFit' : 'CardFit Personal';
export const APP_STORAGE_KEY = IS_PUBLIC_EDITION ? 'cardfit.public.v1' : 'cardBenefitManager.v1';
