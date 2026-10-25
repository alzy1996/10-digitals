// Look Codes (PRD 8.2): 6 characters (no 0, O, 1, I), look parameters only, no photo, 30-day expiry.
import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { uid } from './base.js';
import { ensureAnonymous } from './auth.js';
import { LOOK_CODE_ALPHABET, LOOK_CODE_DAYS } from './schema.js';
import { sanitizeParams } from './consultations.js';

export function randomCode(len = 6, rnd = crypto.getRandomValues.bind(crypto)) {
  const a = new Uint8Array(len);
  rnd(a);
  return Array.from(a, (b) => LOOK_CODE_ALPHABET[b % LOOK_CODE_ALPHABET.length]).join('');
}

export function isValidCode(code) {
  return new RegExp(`^[${LOOK_CODE_ALPHABET}]{6}$`).test(code);
}

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'timeout' })), ms))]);
}

/** Creates the code on the server (needs a connection). Retries on collision. */
export async function createLookCode(salonId, params) {
  await ensureAnonymous();
  const expires = Timestamp.fromDate(new Date(Date.now() + LOOK_CODE_DAYS * 24 * 3600 * 1000));
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = randomCode();
    try {
      await withTimeout(
        setDoc(doc(db, 'salons', salonId, 'lookCodes', code), {
          params: sanitizeParams(params),
          createdAt: serverTimestamp(),
          expiresAt: expires,
          createdBy: uid(),
        }),
        12000,
      );
      return { code, expiresAt: expires.toDate() };
    } catch (e) {
      if (e.code !== 'permission-denied') throw e; // permission-denied = code already taken
    }
  }
  throw Object.assign(new Error('no-code'), { code: 'no-code' });
}

export async function getLookCode(salonId, code) {
  const s = await getDoc(doc(db, 'salons', salonId, 'lookCodes', code));
  if (!s.exists()) return { status: 'not-found' };
  const data = s.data();
  if (data.expiresAt?.toDate() < new Date()) return { status: 'expired', data };
  return { status: 'ok', data };
}

export function markLookCodeUsed(salonId, code) {
  return setDoc(doc(db, 'salons', salonId, 'lookCodes', code), { usedAt: serverTimestamp(), usedBy: uid() }, { merge: true });
}
