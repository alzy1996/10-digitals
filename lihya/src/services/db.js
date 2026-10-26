// Shared plumbing for the services: refs, the signed-in user, batched commits
// tracked by sync.js, live listeners, cache-friendly reads and a small memory of
// the last values seen (so audit entries can record "before" without a read).
// Screens never import this module; they use the service functions.
//
// Demo mode (src/lib/appMode.js): Firestore's network is off for good, so this browser's
// copy is the only copy. The user is DEMO_USER, commits resolve as soon as they are
// applied locally (the server acknowledgement never comes, so nothing waits for it and
// nothing counts as "will sync"), snapshots report { hasPendingWrites: false,
// fromCache: false } (a missing document is missing, not "not loaded yet"), and
// listeners (LISTEN_OPTIONS) and one-time reads go straight to the cache.

import {
  collection,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  onSnapshot,
  waitForPendingWrites,
  writeBatch,
} from 'firebase/firestore';
import { DEMO_USER, auth, db, demoMode } from '../lib/firebase.js';
import { pendingCount, subscribePending, trackWrite } from './sync.js';
import { applyOps, chunkOps } from './ops.js';

export function codedError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

// Demo reset only (auth.resetDemo): the local database is being shut down for a fresh
// demo, so the "Firestore shutting down" errors that follow are expected and stay quiet.
// Never set in real mode.
let closing = false;

export function markDemoClosing() {
  if (demoMode) closing = true;
}

export function isDemoClosing() {
  return closing;
}

export function requireDb() {
  if (!db) throw codedError('app/not-configured', 'Firebase is not configured');
  return db;
}

export function currentUser() {
  if (demoMode) return DEMO_USER;
  return auth ? auth.currentUser : null;
}

/** The signed-in user; staff writes need a real (non-anonymous) account. */
export function requireUser({ allowAnonymous = false } = {}) {
  const user = currentUser();
  if (!user || (!allowAnonymous && user.isAnonymous)) throw codedError('auth/not-signed-in', 'Sign in first');
  return user;
}

export function requireShopId(shopId) {
  if (!shopId || typeof shopId !== 'string' || shopId.includes('/')) throw codedError('invalid-argument', 'shopId');
  return shopId;
}

export function docRef(path) {
  return doc(requireDb(), path);
}

export function colRef(path) {
  return collection(requireDb(), path);
}

/**
 * Commit ops in batches (each tracked as one pending write). Returns a promise
 * that is already handled: callers may await it, screens never need to.
 * `opts.quietDenied` is passed to trackWrite (a refusal by the rules is expected).
 */
export function commitOps(ops, label = 'write', opts = {}) {
  const store = requireDb();
  const chunks = chunkOps(ops);
  if (demoMode) {
    // Applied to the local copy now; the commit promise itself never settles (no server),
    // so it is neither tracked nor awaited.
    for (const chunk of chunks) {
      applyOps(writeBatch(store), store, chunk)
        .commit()
        .catch((err) => {
          if (!closing) console.warn(`demo: ${label} was not kept`, err);
        });
    }
    return Promise.resolve();
  }
  const all = Promise.all(
    chunks.map((chunk) => trackWrite(applyOps(writeBatch(store), store, chunk).commit(), label, opts)),
  ).then(() => undefined);
  all.catch(() => {});
  return all;
}

// ---------------------------------------------------------------- memory of last seen values

const memo = new Map();

export function remember(path, value) {
  memo.set(path, value);
}

export function recall(path) {
  return memo.has(path) ? memo.get(path) : null;
}

// ---------------------------------------------------------------- reading

function snapData(snap) {
  return { id: snap.id, ...snap.data({ serverTimestamps: 'estimate' }) };
}

const DEMO_META = Object.freeze({ hasPendingWrites: false, fromCache: false });

/** Snapshot metadata for the watch callbacks (demo: the local copy is the server copy). */
export function snapMeta(snap) {
  if (demoMode) return DEMO_META;
  return { hasPendingWrites: snap.metadata.hasPendingWrites, fromCache: snap.metadata.fromCache };
}

const metaOf = snapMeta;

/**
 * Options for every onSnapshot (also shops.watchMyShops). Demo mode listens to this
 * browser's copy only (source 'cache'): a listener that waits for the server answers an
 * empty list or a missing document only once its tab knows it is offline, and with two
 * demo tabs open a tab can start without that knowledge (the tab that recorded it has
 * closed), so empty lists and missing documents would load for ever.
 */
export const LISTEN_OPTIONS = Object.freeze(
  demoMode ? { includeMetadataChanges: true, source: 'cache' } : { includeMetadataChanges: true },
);

function reportError(label, err, onError) {
  if (typeof onError === 'function') onError(err);
  else console.error(`firestore: ${label} listener failed`, err);
}

const RETRY_LIMIT = 2;
const RETRY_DELAY_MS = 1200;

/**
 * A read can be refused only because this phone's own writes have not reached the
 * server yet (a shop created a moment ago, a join still queued offline): the rules
 * see no staff doc and Firestore ends the listener. Listen again once the queued
 * writes have landed (or after a short delay), at most twice in a row; any other
 * error, or a refusal that persists, goes to onError.
 */
function resilientListen(listen, label, onError, retry = true) {
  let closed = false;
  let unsubscribe = null;
  let stopWaiting = null;
  let timer = null;
  let retries = 0;

  const start = () => {
    if (closed) return;
    unsubscribe = listen(
      () => {
        retries = 0;
      },
      (err) => {
        if (closed || closing) return;
        if (retry && err?.code === 'permission-denied' && retries < RETRY_LIMIT) {
          retries += 1;
          if (pendingCount() > 0) {
            let fired = false;
            const off = subscribePending((n) => {
              if (n !== 0 || fired) return;
              fired = true;
              queueMicrotask(() => {
                off();
                stopWaiting = null;
                start();
              });
            });
            stopWaiting = off;
          } else {
            timer = setTimeout(start, RETRY_DELAY_MS);
          }
          return;
        }
        reportError(label, err, onError);
      },
    );
  };

  start();
  return () => {
    closed = true;
    if (unsubscribe) unsubscribe();
    if (stopWaiting) stopWaiting();
    if (timer) clearTimeout(timer);
  };
}

/**
 * Live document: cb(data|null, { hasPendingWrites, fromCache }). Returns unsubscribe.
 * opts.remember keeps the last value for audit diffs; opts.map transforms the data;
 * opts.retry = false turns off the re-listen after a refusal (public pages).
 */
export function listenDoc(path, cb, onError, opts = {}) {
  const ref = docRef(path);
  return resilientListen(
    (onOk, onErr) =>
      onSnapshot(
        ref,
        LISTEN_OPTIONS,
        (snap) => {
          onOk();
          const data = snap.exists() ? snapData(snap) : null;
          if (opts.remember) remember(path, data);
          cb(opts.map ? opts.map(data) : data, metaOf(snap));
        },
        onErr,
      ),
    path,
    onError,
    opts.retry !== false,
  );
}

/**
 * Live query: cb(list, { hasPendingWrites, fromCache }). Returns unsubscribe.
 * opts.remember keeps each document (by path) and the list (by opts.rememberAs).
 */
export function listenQuery(q, cb, onError, opts = {}) {
  return resilientListen(
    (onOk, onErr) =>
      onSnapshot(
        q,
        LISTEN_OPTIONS,
        (snap) => {
          onOk();
          const list = snap.docs.map(snapData);
          if (opts.remember) {
            snap.docs.forEach((d, i) => remember(d.ref.path, list[i]));
            if (opts.rememberAs) remember(opts.rememberAs, list);
          }
          cb(opts.map ? opts.map(list, snap) : list, metaOf(snap));
        },
        onErr,
      ),
    opts.label || 'query',
    onError,
    opts.retry !== false,
  );
}

function offline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** This phone's copy of a document (pending local writes included), or null when it has none. */
export async function readCachedDoc(path) {
  try {
    const s = await getDocFromCache(docRef(path));
    return s.exists() ? snapData(s) : null;
  } catch {
    return null;
  }
}

/** One-time read of a document: server when online, local cache as fallback. */
export async function readDoc(path) {
  const ref = docRef(path);
  if (demoMode) {
    try {
      const s = await getDocFromCache(ref);
      return s.exists() ? snapData(s) : null;
    } catch {
      // never written in this browser: it does not exist
      return null;
    }
  }
  if (offline()) {
    try {
      const s = await getDocFromCache(ref);
      return s.exists() ? snapData(s) : null;
    } catch {
      // not cached: try the normal path, which reports "offline" clearly
    }
  }
  try {
    const s = await getDoc(ref);
    return s.exists() ? snapData(s) : null;
  } catch (err) {
    try {
      const s = await getDocFromCache(ref);
      return s.exists() ? snapData(s) : null;
    } catch {
      throw err;
    }
  }
}

/** One-time read of a query: server when online, local cache as fallback. */
export async function readQuery(q) {
  if (demoMode) return (await getDocsFromCache(q)).docs.map(snapData);
  if (offline()) {
    try {
      return (await getDocsFromCache(q)).docs.map(snapData);
    } catch {
      // fall through to the server read
    }
  }
  try {
    return (await getDocs(q)).docs.map(snapData);
  } catch (err) {
    try {
      return (await getDocsFromCache(q)).docs.map(snapData);
    } catch {
      throw err;
    }
  }
}

/**
 * Writes queued by an earlier visit (persistent cache) are re-sent at start-up but
 * have no promise in this tab; track them so the pending badge shows until they land.
 */
export function trackQueuedWrites() {
  if (!db || demoMode) return;
  trackWrite(waitForPendingWrites(db), 'queued');
}
