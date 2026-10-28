import {
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInAnonymously,
  signInWithEmailLink,
  signInWithPopup,
  signOut as fbSignOut,
} from 'firebase/auth';
import { auth, demoMode } from '../lib/firebase.js';
import { appUrl } from '../lib/url.js';

const EMAIL_KEY = 'khusla.emailForSignIn';

// Demo build: a stand-in user kept in memory (lib/firebase.js). Same shape as the Firebase user fields we read.
const demo = { user: null, subs: new Set() };
function setDemoUser(user) {
  demo.user = user;
  demo.subs.forEach((cb) => cb(user));
  return user;
}
function demoUser(email) {
  return email
    ? { uid: 'demo-owner', email, displayName: 'Demo', isAnonymous: false }
    : { uid: `demo-guest-${Math.random().toString(36).slice(2, 8)}`, email: null, displayName: null, isAnonymous: true };
}

/** Demo build only: sign in as the demo owner with one tap. */
export function signInDemo() {
  return setDemoUser(demoUser('demo@khusla.app'));
}

export function onAuth(cb) {
  if (demoMode) {
    demo.subs.add(cb);
    cb(demo.user);
    return () => demo.subs.delete(cb);
  }
  return onAuthStateChanged(auth, cb);
}

export async function sendEmailLink(email, continuePath = '/login') {
  if (demoMode) {
    setDemoUser(demoUser(email));
    return;
  }
  const url = appUrl(continuePath);
  await sendSignInLinkToEmail(auth, email, { url, handleCodeInApp: true });
  try {
    localStorage.setItem(EMAIL_KEY, email);
  } catch {
    // the user will be asked to type the email again
  }
}

export function isEmailLink(href = location.href) {
  if (demoMode) return false;
  return isSignInWithEmailLink(auth, href);
}

export function storedEmail() {
  try {
    return localStorage.getItem(EMAIL_KEY) || '';
  } catch {
    return '';
  }
}

export async function completeEmailLink(email, href = location.href) {
  if (demoMode) return setDemoUser(demoUser(email));
  const res = await signInWithEmailLink(auth, email, href);
  try {
    localStorage.removeItem(EMAIL_KEY);
  } catch {
    // nothing stored
  }
  return res.user;
}

export async function signInGoogle() {
  if (demoMode) return signInDemo();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return (await signInWithPopup(auth, provider)).user;
}

/** Customers at home: anonymous auth, only to create a Look Code. */
export async function ensureAnonymous() {
  if (demoMode) return demo.user || setDemoUser(demoUser(null));
  if (auth.currentUser) return auth.currentUser;
  return (await signInAnonymously(auth)).user;
}

export function signOut() {
  if (demoMode) return Promise.resolve(setDemoUser(null));
  return fbSignOut(auth);
}

/** Firebase ID token for the AI Worker. null in the demo build or when signed out. */
export async function getIdToken(force = false) {
  if (demoMode) return null;
  const u = auth.currentUser;
  return u ? u.getIdToken(force) : null;
}

export function currentUser() {
  return demoMode ? demo.user : auth.currentUser;
}
