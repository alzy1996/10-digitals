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
import { auth } from '../lib/firebase.js';

const EMAIL_KEY = 'khusla.emailForSignIn';

export function onAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

export async function sendEmailLink(email, continuePath = '/login') {
  const url = `${location.origin}${continuePath}`;
  await sendSignInLinkToEmail(auth, email, { url, handleCodeInApp: true });
  try {
    localStorage.setItem(EMAIL_KEY, email);
  } catch {
    // the user will be asked to type the email again
  }
}

export function isEmailLink(href = location.href) {
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
  const res = await signInWithEmailLink(auth, email, href);
  try {
    localStorage.removeItem(EMAIL_KEY);
  } catch {
    // nothing stored
  }
  return res.user;
}

export async function signInGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return (await signInWithPopup(auth, provider)).user;
}

/** Customers at home: anonymous auth, only to create a Look Code. */
export async function ensureAnonymous() {
  if (auth.currentUser) return auth.currentUser;
  return (await signInAnonymously(auth)).user;
}

export function signOut() {
  return fbSignOut(auth);
}

export function currentUser() {
  return auth.currentUser;
}
