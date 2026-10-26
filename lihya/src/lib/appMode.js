// Which backend the app runs against, decided once at build time from the VITE_* values:
//
//   'emulators' VITE_USE_EMULATORS=true: the local Firebase Emulator Suite. Never demo.
//   'demo'      VITE_DEMO_MODE=true, or a production build without a complete Firebase web
//               config (the GitHub Pages link before Sam adds his keys): no login, no server.
//               Firestore runs as a local database in this browser (src/lib/firebase.js).
//   'firebase'  a complete web config (apiKey, projectId, appId): the real app.
//   'none'      a development build without config: the setup notice.
//
// VITE_DEMO_MODE=false turns the production fallback off (the setup notice shows instead).
// resolveMode is pure so the decision is unit-tested (tests/unit/appMode.test.js).

/** True when a Firebase web config has the three values the SDK needs. */
export function hasCompleteConfig(config) {
  return Boolean(config && config.apiKey && config.projectId && config.appId);
}

function flagOf(value) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return null;
}

/**
 * @param {{ prod?: boolean, hasRealConfig?: boolean, usingEmulators?: boolean, demoFlag?: boolean|string }} input
 * @returns {{ mode: 'emulators'|'demo'|'firebase'|'none', demo: boolean, configured: boolean }}
 *   configured = the app can start (any mode but 'none').
 */
export function resolveMode({ prod = false, hasRealConfig = false, usingEmulators = false, demoFlag = null } = {}) {
  const flag = flagOf(demoFlag);
  if (usingEmulators === true) return { mode: 'emulators', demo: false, configured: true };
  if (flag === true) return { mode: 'demo', demo: true, configured: true };
  if (hasRealConfig === true) return { mode: 'firebase', demo: false, configured: true };
  if (prod === true && flag !== false) return { mode: 'demo', demo: true, configured: true };
  return { mode: 'none', demo: false, configured: false };
}

const env = import.meta.env || {};

/** The Firebase web config from the build environment (empty strings when unset). */
export const firebaseEnvConfig = Object.freeze({
  apiKey: env.VITE_FB_API_KEY || '',
  authDomain: env.VITE_FB_AUTH_DOMAIN || '',
  projectId: env.VITE_FB_PROJECT_ID || '',
  appId: env.VITE_FB_APP_ID || '',
});

export const usingEmulators = env.VITE_USE_EMULATORS === 'true';

export const hasRealConfig = hasCompleteConfig(firebaseEnvConfig);

export const APP_MODE = Object.freeze(
  resolveMode({ prod: env.PROD === true, hasRealConfig, usingEmulators, demoFlag: env.VITE_DEMO_MODE }),
);

/** Demo mode: no login, no backend, everything stays in this browser. */
export const demoMode = APP_MODE.demo;

/** The dummy web config the demo starts the SDK with (it never reaches a server). */
export const DEMO_FIREBASE_CONFIG = Object.freeze({
  apiKey: 'demo-key',
  authDomain: 'lihya-demo.local',
  projectId: 'lihya-demo',
  appId: '1:0:web:lihya-demo',
});

/** The one account of the demo: the owner of the demo shop. Never signs in anywhere. */
export const DEMO_USER = Object.freeze({
  uid: 'demo-owner',
  email: 'demo@lihya.app',
  displayName: 'Demo',
  isAnonymous: false,
  emailVerified: true,
  providerData: Object.freeze([]),
  getIdToken: async () => null,
});

/** The shop the demo creates on first open (createShop seeds the catalog and the demo clients). */
export const DEMO_SHOP = Object.freeze({ name: 'LIHYA Demo Barbers', nameAr: 'صالون لحية التجريبي', whatsapp: '' });

/**
 * Name of the Firebase app (and so of its local database) for demo generation `gen`.
 * "Reset demo" moves to the next generation, so the next load starts empty even when
 * another tab still holds the previous database open.
 */
export function demoAppName(gen) {
  const n = Number.isInteger(gen) && gen > 0 ? gen : 1;
  return `lihya-demo-${n}`;
}

/** Parse the stored demo generation (a positive integer), 1 when missing or broken. */
export function parseDemoGeneration(raw) {
  const n = Number.parseInt(String(raw ?? ''), 10);
  return Number.isInteger(n) && n > 0 && n < 1e9 ? n : 1;
}
