// Look Codes made on this phone during this visit (Try at home). Memory only: no photo,
// nothing in web storage, gone on reload. It keeps one look from getting two codes when
// the customer comes back to the code screen (Undo after "Start over", the back button,
// React's development double-mount), and lets the landing show the code again after the
// session was wiped (idle wipe or "Start over"). Across a reload the session snapshot
// keeps the code (useSession().issuedCode); S22 puts it back here with rememberCode.

import { LIMITS } from '../../config/app.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PER_SHOP = 5;

/** shopId -> [{ key, code, styleId, createdAt, expiresAt }], newest last. */
const byShop = new Map();
/** `${shopId}|${key}` -> Promise<entry> while a code is being made. */
const inflight = new Map();

/** Identity of a designed look: the style plus every parameter. null when it cannot be read. */
export function lookKey(styleId, params) {
  if (!styleId || !params) return null;
  try {
    return `${styleId}|${JSON.stringify(params)}`;
  } catch {
    return null;
  }
}

function alive(entry, now = Date.now()) {
  return Boolean(entry) && entry.expiresAt > now;
}

/** The code already made for this look on this phone, or null. */
export function findCode(shopId, key) {
  if (!shopId || !key) return null;
  const list = byShop.get(shopId) || [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].key === key && alive(list[i])) return list[i];
  }
  return null;
}

/** The newest code made for this shop on this phone during this visit, or null. */
export function lastCode(shopId) {
  const list = (shopId && byShop.get(shopId)) || [];
  const last = list.length ? list[list.length - 1] : null;
  return alive(last) ? last : null;
}

function remember(shopId, entry) {
  const list = (byShop.get(shopId) || []).filter((e) => e.key !== entry.key);
  list.push(entry);
  byShop.set(shopId, list.slice(-MAX_PER_SHOP));
  return entry;
}

/**
 * Put back a code this phone already made for a look (from the session snapshot after a
 * reload): { key, code, styleId, createdAt, expiresAt }. Expired or incomplete entries are
 * ignored. Returns the remembered entry or null.
 */
export function rememberCode(shopId, entry) {
  if (!shopId || !entry || typeof entry.key !== 'string' || typeof entry.code !== 'string') return null;
  if (!Number.isFinite(entry.expiresAt) || !alive(entry)) return null;
  const createdAt = Number.isFinite(entry.createdAt) ? entry.createdAt : null;
  return remember(shopId, { key: entry.key, code: entry.code, styleId: entry.styleId || null, createdAt, expiresAt: entry.expiresAt });
}

/**
 * Make the code for this look once: concurrent calls for the same look share one request.
 * `create()` resolves the code; the entry carries the local expiry (the service sets
 * the same +30 days on the server). A failure is not cached, so a retry asks again.
 */
export function createOnce(shopId, key, styleId, create) {
  const known = findCode(shopId, key);
  if (known) return Promise.resolve(known);
  const id = `${shopId}|${key}`;
  if (inflight.has(id)) return inflight.get(id);
  const job = Promise.resolve()
    .then(create)
    .then((code) => {
      const createdAt = Date.now();
      return remember(shopId, { key, code, styleId, createdAt, expiresAt: createdAt + LIMITS.lookCodeDays * DAY_MS });
    })
    .finally(() => inflight.delete(id));
  inflight.set(id, job);
  return job;
}
