// Tiny promise wrapper around IndexedDB (PRD 8.5, 10.x): database 'lihya' with two
// object stores, both with out-of-line keys.
//
//   'session'  the current chair or home session (cleared by the session wipe:
//              "Next customer" or 10 minutes idle).
//   'saved'    before/after photos the customer agreed to keep on this device
//              (keepPhotos). Never synced, never uploaded.
//
// Everything fails soft: in private mode, with storage blocked or without IndexedDB
// at all, reads resolve to empty values and writes resolve to false, so the app
// keeps working with memory only. Blobs are stored as { type, buffer } because some
// Safari versions refuse Blob values in IndexedDB.

export const DB_NAME = 'lihya';
export const DB_VERSION = 1;
export const STORES = Object.freeze({ session: 'session', saved: 'saved' });

const STORE_NAMES = Object.values(STORES);
const DAY_MS = 24 * 60 * 60 * 1000;

let dbPromise = null;

function idbFactory() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB ? indexedDB : null;
  } catch {
    return null;
  }
}

/** Open (once) the 'lihya' database. Resolves the IDBDatabase, or null when IndexedDB is not usable. */
export function openDb() {
  if (dbPromise) return dbPromise;
  const factory = idbFactory();
  if (!factory) {
    dbPromise = Promise.resolve(null);
    return dbPromise;
  }
  dbPromise = new Promise((resolve) => {
    let req;
    try {
      req = factory.open(DB_NAME, DB_VERSION);
    } catch (err) {
      console.warn('idb: IndexedDB is not available, using memory only', err);
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORE_NAMES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      console.warn('idb: could not open the database, using memory only', req.error);
      resolve(null);
    };
    req.onblocked = () => {
      console.warn('idb: database upgrade is blocked by another tab');
    };
  });
  return dbPromise;
}

/** Close the connection; the next call opens it again. */
export async function closeDb() {
  const pending = dbPromise;
  dbPromise = null;
  if (!pending) return;
  const db = await pending;
  if (db) db.close();
}

/** true when IndexedDB opened on this device (false in some private modes). */
export async function idbAvailable() {
  return Boolean(await openDb());
}

/**
 * Run `fn(store)` in one transaction. Resolves { ok, value } where value is the
 * result of the request `fn` returns (if any) once the transaction has completed.
 */
async function run(storeName, mode, fn) {
  if (!STORE_NAMES.includes(storeName)) throw new Error(`idb: unknown store ${storeName}`);
  const db = await openDb();
  if (!db) return { ok: false, value: undefined };
  return new Promise((resolve) => {
    let tx;
    try {
      tx = db.transaction(storeName, mode);
    } catch (err) {
      console.warn('idb: transaction failed', err);
      resolve({ ok: false, value: undefined });
      return;
    }
    let value;
    tx.oncomplete = () => resolve({ ok: true, value });
    tx.onerror = () => {
      console.warn('idb: request failed', tx.error);
      resolve({ ok: false, value: undefined });
    };
    tx.onabort = () => resolve({ ok: false, value: undefined });
    try {
      const req = fn(tx.objectStore(storeName));
      if (req) {
        req.onsuccess = () => {
          value = req.result;
        };
      }
    } catch (err) {
      console.warn('idb: request could not start', err);
      try {
        tx.abort();
      } catch {
        // already finished
      }
      resolve({ ok: false, value: undefined });
    }
  });
}

/** Put a value under a key. Resolves true when stored. */
export async function idbPut(storeName, key, value) {
  const r = await run(storeName, 'readwrite', (s) => s.put(value, key));
  return r.ok;
}

/** Value for a key, or undefined. */
export async function idbGet(storeName, key) {
  const r = await run(storeName, 'readonly', (s) => s.get(key));
  return r.ok ? r.value : undefined;
}

/** Delete one key. Resolves true when the transaction completed. */
export async function idbDelete(storeName, key) {
  const r = await run(storeName, 'readwrite', (s) => s.delete(key));
  return r.ok;
}

/** Remove every entry of a store. */
export async function idbClearStore(storeName) {
  const r = await run(storeName, 'readwrite', (s) => s.clear());
  return r.ok;
}

/** All keys of a store ([] when unavailable). */
export async function idbKeys(storeName) {
  const r = await run(storeName, 'readonly', (s) => s.getAllKeys());
  return r.ok && Array.isArray(r.value) ? r.value : [];
}

async function idbAll(storeName) {
  const r = await run(storeName, 'readonly', (s) => s.getAll());
  return r.ok && Array.isArray(r.value) ? r.value : [];
}

async function idbDeleteMany(storeName, keys) {
  if (!keys.length) return true;
  const r = await run(storeName, 'readwrite', (s) => {
    for (const k of keys) s.delete(k);
    return null;
  });
  return r.ok;
}

function isBlob(v) {
  return typeof Blob !== 'undefined' && v instanceof Blob;
}

async function packBlob(blob) {
  if (!isBlob(blob)) return null;
  const buffer = await blob.arrayBuffer();
  return { type: blob.type || 'application/octet-stream', buffer };
}

function unpackBlob(packed) {
  if (!packed) return null;
  if (isBlob(packed)) return packed;
  if (packed.buffer && typeof Blob !== 'undefined') return new Blob([packed.buffer], { type: packed.type || '' });
  return null;
}

function timeOf(v) {
  if (v instanceof Date) return v.getTime();
  const n = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(n) ? n : Date.now();
}

function randomPart() {
  try {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const b = crypto.getRandomValues(new Uint8Array(6));
      return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // fall through
  }
  return Math.random().toString(16).slice(2, 14);
}

/**
 * Keep a before/after pair for a client on this device ('saved' store). Call it only
 * when the customer agreed (session keepPhotos). Resolves the entry id, or null when
 * it could not be stored (no client, no image, or no IndexedDB).
 */
export async function saveBeforeAfter(clientId, { before, after, at } = {}) {
  if (!clientId || typeof clientId !== 'string') return null;
  const [b, a] = await Promise.all([packBlob(before), packBlob(after)]);
  if (!b && !a) return null;
  const when = timeOf(at ?? Date.now());
  const id = `${clientId}:${when}:${randomPart()}`;
  const ok = await idbPut(STORES.saved, id, { id, clientId, before: b, after: a, at: when, savedAt: Date.now() });
  return ok ? id : null;
}

/** Saved pairs for a client, newest first: [{ id, clientId, before: Blob|null, after: Blob|null, at: Date }]. */
export async function listSavedForClient(clientId) {
  if (!clientId) return [];
  const all = await idbAll(STORES.saved);
  return all
    .filter((e) => e && e.clientId === clientId)
    .sort((x, y) => y.at - x.at)
    .map((e) => ({ id: e.id, clientId: e.clientId, before: unpackBlob(e.before), after: unpackBlob(e.after), at: new Date(e.at) }));
}

/** Delete every saved pair of a client. Resolves how many were removed. */
export async function deleteSavedForClient(clientId) {
  if (!clientId) return 0;
  const keys = (await idbAll(STORES.saved)).filter((e) => e && e.clientId === clientId).map((e) => e.id);
  const ok = await idbDeleteMany(STORES.saved, keys);
  return ok ? keys.length : 0;
}

/** Delete saved pairs older than `maxAgeDays` (shop data retention). Resolves how many were removed. */
export async function pruneSaved(maxAgeDays, now = Date.now()) {
  const days = Number(maxAgeDays);
  if (!Number.isFinite(days) || days <= 0) return 0;
  const cutoff = timeOf(now) - days * DAY_MS;
  const keys = (await idbAll(STORES.saved)).filter((e) => e && Number(e.at) < cutoff).map((e) => e.id);
  const ok = await idbDeleteMany(STORES.saved, keys);
  return ok ? keys.length : 0;
}
