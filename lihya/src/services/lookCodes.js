// Look Codes (PRD 8.2): shops/{shopId}/lookCodes/{code} { styleId, params, createdAt,
// expiresAt (+30 days), createdBy, usedAt, usedBy }. The customer at home gets a
// 6-character code (no 0, O, 1, I) holding style parameters only, never a photo.
// Customers sign in anonymously only for this.

import { Timestamp, serverTimestamp } from 'firebase/firestore';
import { LIMITS } from '../config/app.js';
import { generateLookCode, normalizeLookCode, sanitizeParams } from './model.js';
import { codedError, commitOps, readDoc, requireShopId, requireUser } from './db.js';
import { signInAnon } from './auth.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const CONFIRM_MS = 12000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms);
  });
  return Promise.race([promise.then(() => 'ok'), timeout]).finally(() => clearTimeout(timer));
}

/**
 * Save the look under a new code and resolve the code. Signs in anonymously when
 * nobody is signed in. Waits up to 12 s for the server; on a slow or offline
 * connection the code is returned anyway and the write syncs later.
 */
export async function createLookCode(shopId, { styleId, params } = {}) {
  requireShopId(shopId);
  const user = await signInAnon();
  const clean = sanitizeParams(params);
  const style = String(styleId || clean?.styleId || '').slice(0, 80);
  if (!style || !clean) throw codedError('invalid-argument', 'look');
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generateLookCode();
    const write = commitOps(
      [
        {
          path: `shops/${shopId}/lookCodes/${code}`,
          data: {
            styleId: style,
            params: clean,
            createdAt: serverTimestamp(),
            createdBy: user.uid,
            expiresAt: Timestamp.fromMillis(Date.now() + LIMITS.lookCodeDays * DAY_MS),
          },
        },
      ],
      'lookCode.create',
    );
    try {
      await withTimeout(write, CONFIRM_MS);
      return code;
    } catch (err) {
      // permission-denied on create means the code is taken (an update is not allowed): try another.
      lastError = err;
      if (err?.code !== 'permission-denied') throw err;
    }
  }
  throw lastError || codedError('lookCode/failed');
}

/**
 * Staff lookup (needs a connection). Resolves null when there is no such code,
 * else { code, styleId, params, createdAt, expiresAt, usedAt, usedBy, expired, used }.
 */
export async function getLookCode(shopId, code) {
  requireShopId(shopId);
  requireUser();
  const clean = normalizeLookCode(code);
  if (!clean) return null;
  const data = await readDoc(`shops/${shopId}/lookCodes/${clean}`);
  if (!data) return null;
  const expiresAt = data.expiresAt?.toMillis ? data.expiresAt.toMillis() : 0;
  return {
    code: clean,
    styleId: data.styleId,
    params: data.params,
    createdAt: data.createdAt || null,
    expiresAt: data.expiresAt || null,
    usedAt: data.usedAt || null,
    usedBy: data.usedBy || null,
    expired: expiresAt <= Date.now(),
    used: Boolean(data.usedAt),
  };
}

/** The barber loaded the code into the Studio. */
export function markLookCodeUsed(shopId, code) {
  requireShopId(shopId);
  const me = requireUser();
  const clean = normalizeLookCode(code);
  if (!clean) throw codedError('invalid-argument', 'code');
  commitOps(
    [{ path: `shops/${shopId}/lookCodes/${clean}`, data: { usedAt: serverTimestamp(), usedBy: me.uid }, update: true }],
    'lookCode.use',
  );
}
