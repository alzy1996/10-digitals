// Auth (PRD 10.5). Staff: passwordless email link and Google. Customers at home:
// anonymous auth, only to create a Look Code.
//
// Email link: the address is kept in localStorage (PREF_KEYS.emailForSignIn)
// between "send" and "open the link", as Firebase requires. When the link is
// opened on another device the address is unknown and the login screen asks
// for it again (never passed in the URL: that would allow session injection).

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
import { auth } from '../lib/firebase.js';
import { PREF_KEYS } from '../config/app.js';
import { isValidEmail, normalizeEmail } from './model.js';
import { codedError } from './db.js';
import { appUrl } from '../lib/paths.js';

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

/** A same-origin path to continue to after sign-in, or `fallback` (blocks open redirects). */
export function safeNextPath(next, fallback = '/') {
  if (typeof next !== 'string' || !next) return fallback;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}

/** The URL an email link continues to: <origin>/login?next=<path>. */
export function emailLinkUrl(next) {
  const path = safeNextPath(next, '');
  return `${appUrl('/login')}${path ? `?next=${encodeURIComponent(path)}` : ''}`;
}

export function watchAuth(cb) {
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
  const a = requireAuth();
  const address = normalizeEmail(email);
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
  const a = requireAuth();
  if (a.currentUser) return a.currentUser;
  const cred = await signInAnonymously(a);
  return cred.user;
}

export function signOutUser() {
  if (!auth) return Promise.resolve();
  return signOut(auth);
}

/** Firebase ID token for the AI Worker (null when signed out). */
export async function getIdToken(force = false) {
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
