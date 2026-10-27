// src/lib/firebase.js — PRD 10.1, plus the emulator switch and the demo build.
// With no real keys yet (empty .env.local) the app runs against the Firebase Emulator Suite
// under the "demo-careandus" project, so the build never waits for Sam's accounts.
// The GitHub Pages build (`npm run build:pages`, mode "pages") has no Firebase project behind it:
// Firestore runs offline in memory and auth is a local stand-in (services/auth.js). Nothing leaves
// the device and a refresh starts fresh. Real keys in .env.local turn the same build into the live app.
import { initializeApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  disableNetwork,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaV3Provider, getToken as getAppCheckTokenRaw } from 'firebase/app-check';

const env = import.meta.env;
const hasRealConfig = Boolean(env.VITE_FB_PROJECT_ID && env.VITE_FB_API_KEY);
export const demoMode = env.MODE === 'pages' && !hasRealConfig;
export const usingEmulators = !demoMode && (env.VITE_USE_EMULATORS === 'true' || !hasRealConfig);

const config = hasRealConfig
  ? {
      apiKey: env.VITE_FB_API_KEY,
      authDomain: env.VITE_FB_AUTH_DOMAIN,
      projectId: env.VITE_FB_PROJECT_ID,
      appId: env.VITE_FB_APP_ID,
    }
  : {
      apiKey: 'demo-key',
      authDomain: 'demo-careandus.firebaseapp.com',
      projectId: 'demo-careandus',
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
  localCache: demoMode ? memoryLocalCache() : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
// Queued before any read or write, so the demo never talks to a server.
if (demoMode) disableNetwork(db);
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
