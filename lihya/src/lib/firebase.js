// Firebase init (PRD 10.1). Firestore with a persistent multi-tab cache so every
// screen works offline; App Check with reCAPTCHA v3 in production.
//
// VITE_USE_EMULATORS=true: Auth and Firestore talk to the local Emulator Suite
// (127.0.0.1:9099 and :8080), App Check is skipped, and an empty web config
// falls back to the emulator-only project "demo-lihya".
//
// Demo mode (src/lib/appMode.js: VITE_DEMO_MODE=true, or a production build with no
// Firebase config, such as the GitHub Pages link before the secrets are added): the SDK
// starts with a dummy config, no Auth, no App Check, and Firestore's network is disabled
// at once. Firestore is then a local database in this browser: writes apply at once,
// listeners and queries (collection groups too) answer from the persistent cache, and
// nothing ever leaves the device. The services treat that local copy as the truth.
//
// With no config at all (development build) nothing is initialised: app, db and auth are
// null and AuthProvider shows the setup notice instead of crashing.

import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  disableNetwork,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { getToken, initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import {
  APP_MODE,
  DEMO_FIREBASE_CONFIG,
  DEMO_USER,
  demoAppName,
  demoMode,
  firebaseEnvConfig,
  parseDemoGeneration,
  resolveMode,
  usingEmulators,
} from './appMode.js';
import { PREF_KEYS } from '../config/app.js';

const env = import.meta.env || {};

export { demoMode, DEMO_USER, resolveMode, usingEmulators };

const envConfig = firebaseEnvConfig;

/** True when the app can start: a real web config, the emulators, or demo mode. */
export const firebaseConfigured = APP_MODE.configured;

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

/** The demo database generation this browser uses (PREF_KEYS.demoGeneration). */
export function demoGeneration() {
  try {
    return parseDemoGeneration(localStorage.getItem(PREF_KEYS.demoGeneration));
  } catch {
    return 1;
  }
}

function initDemo() {
  const name = demoAppName(demoGeneration());
  const existing = getApps().find((a) => a.name === name);
  const app = existing || initializeApp(DEMO_FIREBASE_CONFIG, name);
  let db;
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    db = getFirestore(app);
  }
  // Before any listener or write is queued: the SDK never opens a connection, and gets
  // and listeners answer from this browser's copy straight away.
  disableNetwork(db).catch((err) => console.warn('LIHYA demo: the local database could not go offline', err));
  return { app, db, auth: null, appCheck: null };
}

function init() {
  if (!firebaseConfigured) return { app: null, db: null, auth: null };
  if (demoMode) return initDemo();

  const firstInit = getApps().length === 0;
  const app = firstInit ? initializeApp(resolveConfig()) : getApp();

  let appCheck = null;
  if (firstInit && !usingEmulators) {
    const siteKey = env.VITE_RECAPTCHA_SITE_KEY || '';
    if (siteKey) {
      appCheck = initializeAppCheck(app, {
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
  return { app, db, auth, appCheck };
}

const instance = init();

export const app = instance.app;
export const db = instance.db;
export const auth = instance.auth;

/** Current App Check token for calls outside Firebase (the AI Worker forwards it to Firestore), or null. */
export async function getAppCheckToken() {
  if (!instance.appCheck) return null;
  try {
    const res = await getToken(instance.appCheck, false);
    return res && res.token ? res.token : null;
  } catch {
    return null;
  }
}
