// src/lib/firebase.js — PRD 10.1, plus the emulator switch.
// With no real keys yet (empty .env.local) the app runs against the Firebase Emulator Suite
// under the "demo-khusla" project, so the build never waits for Sam's accounts.
import { initializeApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaV3Provider, getToken as getAppCheckTokenRaw } from 'firebase/app-check';

const env = import.meta.env;
const hasRealConfig = Boolean(env.VITE_FB_PROJECT_ID && env.VITE_FB_API_KEY);
export const usingEmulators = env.VITE_USE_EMULATORS === 'true' || !hasRealConfig;

const config = hasRealConfig
  ? {
      apiKey: env.VITE_FB_API_KEY,
      authDomain: env.VITE_FB_AUTH_DOMAIN,
      projectId: env.VITE_FB_PROJECT_ID,
      appId: env.VITE_FB_APP_ID,
    }
  : {
      apiKey: 'demo-key',
      authDomain: 'demo-khusla.firebaseapp.com',
      projectId: 'demo-khusla',
      appId: 'demo-app',
    };

const app = initializeApp(config);

let appCheck = null;
if (!usingEmulators && env.VITE_RECAPTCHA_SITE_KEY) {
  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(env.VITE_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const auth = getAuth(app);
export const projectId = config.projectId;

if (usingEmulators) {
  const host = env.VITE_EMULATOR_HOST || (typeof location !== 'undefined' ? location.hostname : '127.0.0.1');
  connectFirestoreEmulator(db, host, 8080);
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
}

/** App Check token for calls outside the Firebase SDK (the AI Worker forwards it to Firestore REST). */
export async function getAppCheckToken() {
  if (!appCheck) return null;
  try {
    const res = await getAppCheckTokenRaw(appCheck, false);
    return res.token;
  } catch {
    return null;
  }
}
