// Firebase init (PRD 10.1). Firestore with a persistent multi-tab cache so every
// screen works offline; App Check with reCAPTCHA v3 in production.
//
// VITE_USE_EMULATORS=true: Auth and Firestore talk to the local Emulator Suite
// (127.0.0.1:9099 and :8080), App Check is skipped, and an empty web config
// falls back to the emulator-only project "demo-lihya".
//
// With no config at all nothing is initialised: app, db and auth are null and
// AuthProvider shows the setup notice instead of crashing.

import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

const env = import.meta.env || {};

export const usingEmulators = env.VITE_USE_EMULATORS === 'true';

const envConfig = {
  apiKey: env.VITE_FB_API_KEY || '',
  authDomain: env.VITE_FB_AUTH_DOMAIN || '',
  projectId: env.VITE_FB_PROJECT_ID || '',
  appId: env.VITE_FB_APP_ID || '',
};

const hasRealConfig = Boolean(envConfig.apiKey && envConfig.projectId && envConfig.appId);

/** True when the app can talk to Firebase: a real web config, or the emulators. */
export const firebaseConfigured = hasRealConfig || usingEmulators;

function resolveConfig() {
  if (!usingEmulators) return envConfig;
  const projectId = envConfig.projectId || 'demo-lihya';
  const config = {
    apiKey: envConfig.apiKey || 'demo-key',
    authDomain: envConfig.authDomain || `${projectId}.firebaseapp.com`,
    projectId,
  };
  if (envConfig.appId) config.appId = envConfig.appId;
  return config;
}

function init() {
  if (!firebaseConfigured) return { app: null, db: null, auth: null };

  const firstInit = getApps().length === 0;
  const app = firstInit ? initializeApp(resolveConfig()) : getApp();

  if (firstInit && !usingEmulators) {
    const siteKey = env.VITE_RECAPTCHA_SITE_KEY || '';
    if (siteKey) {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
    } else {
      console.warn('LIHYA: VITE_RECAPTCHA_SITE_KEY is empty, App Check is not active. Add the key before turning on enforcement.');
    }
  }

  let db;
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // Already initialised (hot reload): reuse the existing instance.
    db = getFirestore(app);
  }
  const auth = getAuth(app);

  if (firstInit && usingEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  return { app, db, auth };
}

const instance = init();

export const app = instance.app;
export const db = instance.db;
export const auth = instance.auth;
