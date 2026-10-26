// Auth (PRD 10.5). Staff: passwordless email link and Google. Customers at home:
// anonymous auth, only to create a Look Code.
//
// Email link: the address is kept in localStorage (PREF_KEYS.emailForSignIn)
// between "send" and "open the link", as Firebase requires. When the link is
// opened on another device the address is unknown and the login screen asks
// for it again (never passed in the URL: that would allow session injection).
//
// Demo mode (src/lib/appMode.js): there is no Firebase Auth. Every sign-in resolves
// DEMO_USER without the network, getIdToken() is null, and signOutAndClear() is
// "Reset demo": it empties this browser's demo (session and saved photos, the local
// database) and loads the start screen, which makes a fresh demo shop.

import {
  GoogleAuthProvider,
  getRedirectResult,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInAnonymously,
  signInWithEmailLink,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { clearIndexedDbPersistence, terminate, waitForPendingWrites } from 'firebase/firestore';
import { DEMO_USER, auth, db, demoGeneration, demoMode } from '../lib/firebase.js';
import { PREF_KEYS } from '../config/app.js';
import { isValidEmail, normalizeEmail } from './model.js';
import { codedError, markDemoClosing } from './db.js';
import { appUrl } from '../lib/paths.js';
import { STORES, idbClearStore } from '../lib/idb.js';

function requireAuth() {
  if (!auth) throw codedError('app/not-configured', 'Firebase is not configured');
  return auth;
}

function readPref(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // private mode: the login screen will ask for the address again
  }
}

/** Send Firebase emails (sign-in links) in the app language. */
function applyAppLanguage(a) {
  a.languageCode = readPref(PREF_KEYS.lang) === 'en' ? 'en' : 'ar';
}

// Control characters (the browser drops tabs and new lines, so "/\t/x.com" would
// become "//x.com") and backslashes (read as "/" in URLs) never belong in a path.
function hasUnsafeChar(text) {
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c < 0x20 || c === 0x7f || c === 0x5c) return true;
  }
  return false;
}

/** A same-origin path to continue to after sign-in, or `fallback` (blocks open redirects). */
export function safeNextPath(next, fallback = '/') {
  if (typeof next !== 'string' || !next) return fallback;
  if (hasUnsafeChar(next)) return fallback;
  if (!next.startsWith('/') || next.startsWith('//')) return fallback;
  try {
    const origin = typeof window !== 'undefined' && window.location ? window.location.origin : 'http://app.invalid';
    const url = new URL(next, origin);
    if (url.origin !== origin) return fallback;
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path.startsWith('//') ? fallback : path;
  } catch {
    return fallback;
  }
}

/** The URL an email link continues to: <origin>/login?next=<path>. */
export function emailLinkUrl(next) {
  const path = safeNextPath(next, '');
  return `${appUrl('/login')}${path ? `?next=${encodeURIComponent(path)}` : ''}`;
}

export function watchAuth(cb) {
  if (demoMode) {
    cb(DEMO_USER);
    return () => {};
  }
  if (!auth) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(auth, cb);
}

/**
 * Send a sign-in link. `remember` stores the address on this device (the person
 * signing in is the one holding this phone); invites send without remembering.
 */
export async function sendLinkTo(email, { next, remember = true } = {}) {
  const address = normalizeEmail(email);
  // Demo: nothing is sent and nobody needs to sign in (the address is still checked).
  if (demoMode) {
    if (!isValidEmail(address)) throw codedError('auth/invalid-email');
    return address;
  }
  const a = requireAuth();
  if (!isValidEmail(address)) throw codedError('auth/invalid-email');
  applyAppLanguage(a);
  await sendSignInLinkToEmail(a, address, { url: emailLinkUrl(next), handleCodeInApp: true });
  if (remember) writePref(PREF_KEYS.emailForSignIn, address);
  return address;
}

/** Staff sign-in: email a passwordless link that returns to /login?next=<next>. */
export function sendEmailLink(email, { next } = {}) {
  return sendLinkTo(email, { next, remember: true });
}

/** Is this URL a Firebase email sign-in link? */
export function isEmailLink(href = typeof window !== 'undefined' ? window.location.href : '') {
  if (!auth || !href) return false;
  try {
    return isSignInWithEmailLink(auth, href);
  } catch {
    return false;
  }
}

/** The address saved when the link was sent from this device, if any. */
export function storedEmailForSignIn() {
  return readPref(PREF_KEYS.emailForSignIn);
}

function oobCodeOf(href) {
  try {
    const url = new URL(href);
    const direct = url.searchParams.get('oobCode');
    if (direct) return direct;
    const nested = url.searchParams.get('link');
    return nested ? new URL(nested).searchParams.get('oobCode') : null;
  } catch {
    return null;
  }
}

const completions = new Map();

/**
 * Finish an email-link sign-in. Uses `emailOrNull`, or the address saved on this
 * device. Rejects with code 'auth/missing-email' when neither is known (ask the
 * person to type it). Safe to call twice for the same link: the AuthProvider and
 * the login screen share one attempt.
 */
export function completeEmailLink(href = window.location.href, emailOrNull = null) {
  if (demoMode) return Promise.resolve(DEMO_USER);
  let a;
  try {
    a = requireAuth();
  } catch (err) {
    return Promise.reject(err);
  }
  if (!isEmailLink(href)) return Promise.reject(codedError('auth/invalid-action-code'));
  const key = oobCodeOf(href) || href;
  if (completions.has(key)) return completions.get(key);
  const address = normalizeEmail(emailOrNull || storedEmailForSignIn() || '');
  if (!address) return Promise.reject(codedError('auth/missing-email'));
  const attempt = signInWithEmailLink(a, address, href).then((cred) => {
    writePref(PREF_KEYS.emailForSignIn, null);
    return cred.user;
  });
  completions.set(key, attempt);
  attempt.catch(() => completions.delete(key));
  return attempt;
}

const LINK_PARAMS = ['apiKey', 'oobCode', 'mode', 'lang', 'continueUrl', 'tenantId', 'link'];

/** Remove the one-time email-link parameters from the address bar (keeps next, invite). */
export function clearEmailLinkFromUrl() {
  try {
    const url = new URL(window.location.href);
    let changed = false;
    for (const p of LINK_PARAMS) {
      if (url.searchParams.has(p)) {
        url.searchParams.delete(p);
        changed = true;
      }
    }
    if (changed) window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // nothing to clean
  }
}

function isIosStandalone() {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator || {};
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent || '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const standalone = nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
  return Boolean(ios && standalone);
}

const REDIRECT_FALLBACK = new Set(['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment']);

/**
 * Google sign-in with a popup; falls back to a full-page redirect when popups are
 * blocked or in an iOS home-screen app (popups cannot report back there).
 * Resolves with the user, or null when a redirect has started.
 */
export async function signInGoogle() {
  if (demoMode) return DEMO_USER;
  const a = requireAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  applyAppLanguage(a);
  if (isIosStandalone()) {
    await signInWithRedirect(a, provider);
    return null;
  }
  try {
    const cred = await signInWithPopup(a, provider);
    return cred.user;
  } catch (err) {
    if (REDIRECT_FALLBACK.has(err?.code)) {
      await signInWithRedirect(a, provider);
      return null;
    }
    throw err;
  }
}

/** Completes a Google redirect sign-in after the page loads again. Resolves user|null. */
export async function consumeRedirectResult() {
  if (!auth) return null;
  const result = await getRedirectResult(auth);
  return result ? result.user : null;
}

/** Customers at home: anonymous account, only used to create a Look Code. */
export async function signInAnon() {
  if (demoMode) return DEMO_USER;
  const a = requireAuth();
  if (a.currentUser) return a.currentUser;
  const cred = await signInAnonymously(a);
  return cred.user;
}

export function signOutUser() {
  if (demoMode || !auth) return Promise.resolve();
  return signOut(auth);
}

const SYNC_WAIT_MS = 4000;

/** True when every queued write reached the server within `ms` (false offline). */
async function writesSynced(store, ms) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return await Promise.race([waitForPendingWrites(store).then(() => true, () => false), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sign out on a shared phone and leave nothing of the shop behind: the customer
 * session snapshot (IndexedDB 'session' store), then this phone's Firestore cache
 * (client names, phones, consultations), then the account. Ends with a full page
 * load of `to` (default '/'), because the Firestore instance is shut down and the
 * next person needs a fresh one.
 *
 * Writes that have not reached the server yet are never thrown away: when they
 * do not sync within a few seconds (offline), the cache is kept so they are sent
 * the next time this account signs in on this phone. Saved before/after photos
 * (kept only with the customer's agreement) stay. Never rejects.
 */
export async function signOutAndClear({ to = '/' } = {}) {
  if (demoMode) {
    await resetDemo();
    return;
  }
  try {
    await idbClearStore(STORES.session);
  } catch {
    // no IndexedDB here (private mode): nothing was stored
  }
  if (db) {
    const synced = await writesSynced(db, SYNC_WAIT_MS).catch(() => false);
    try {
      await terminate(db);
    } catch {
      // already terminated
    }
    if (synced) {
      try {
        await clearIndexedDbPersistence(db);
      } catch {
        // another tab still has the app open; its cache goes when that tab signs out
      }
    }
  }
  if (auth) {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('sign out failed', err);
    }
  }
  if (typeof window !== 'undefined' && window.location) {
    window.location.assign(appUrl(safeNextPath(to, '/')));
  }
}

function removePref(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // no storage: nothing was kept
  }
}

/**
 * "Reset demo": the customer session and the kept before/after photos (IndexedDB
 * 'lihya'), then this browser's demo database, then a full load of the start screen,
 * which makes a fresh demo shop. The next demo generation is chosen first, so the
 * reset holds even when another tab keeps the old database open (that copy is deleted
 * here when it can be). Language and theme stay. Never rejects.
 */
async function resetDemo() {
  for (const store of [STORES.session, STORES.saved]) {
    try {
      await idbClearStore(store);
    } catch {
      // no IndexedDB here (private mode): nothing was stored
    }
  }
  try {
    localStorage.setItem(PREF_KEYS.demoGeneration, String(demoGeneration() + 1));
  } catch {
    // no storage: clearing the database below is the reset
  }
  removePref(PREF_KEYS.lastShop);
  if (db) {
    markDemoClosing();
    try {
      await terminate(db);
    } catch {
      // already terminated
    }
    try {
      await clearIndexedDbPersistence(db);
    } catch {
      // another tab still has the demo open; the next generation starts empty anyway
    }
  }
  if (typeof window !== 'undefined' && window.location) window.location.assign(appUrl('/'));
}

/** Firebase ID token for the AI Worker (null when signed out, and always in demo mode). */
export async function getIdToken(force = false) {
  if (demoMode) return null;
  const user = auth ? auth.currentUser : null;
  return user ? user.getIdToken(Boolean(force)) : null;
}

const ERROR_KEYS = {
  // The Google popup helper could not load (no or filtered internet).
  'auth/internal-error': 'auth.error.network',
  'auth/invalid-email': 'auth.error.invalidEmail',
  'auth/missing-email': 'auth.error.missingEmail',
  'auth/invalid-action-code': 'auth.error.linkInvalid',
  'auth/expired-action-code': 'auth.error.linkExpired',
  'auth/user-disabled': 'auth.error.disabled',
  'auth/popup-closed-by-user': 'auth.error.popupClosed',
  'auth/cancelled-popup-request': 'auth.error.popupClosed',
  'auth/popup-blocked': 'auth.error.popupBlocked',
  'auth/network-request-failed': 'auth.error.network',
  'auth/too-many-requests': 'auth.error.tooMany',
  'auth/quota-exceeded': 'auth.error.quota',
  'auth/unauthorized-continue-uri': 'auth.error.domain',
  'auth/unauthorized-domain': 'auth.error.domain',
  'auth/operation-not-allowed': 'auth.error.provider',
  'auth/admin-restricted-operation': 'auth.error.provider',
  'auth/account-exists-with-different-credential': 'auth.error.otherProvider',
  'auth/not-signed-in': 'auth.error.notSignedIn',
  'app/not-configured': 'setup.title',
  'invite/not-found': 'auth.error.noInvite',
  'invite/email-not-verified': 'auth.error.notVerified',
  'permission-denied': 'auth.error.permission',
  unavailable: 'auth.error.network',
};

/** i18n key (src/lib/i18n/ns/auth.json) for an auth or invite error. */
export function authErrorKey(err) {
  return ERROR_KEYS[err?.code] || 'auth.error.generic';
}
