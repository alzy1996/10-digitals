// Offline-first write tracking. Firestore applies every write to the local
// cache at once (screens update immediately) and resolves the write promise
// only when the server has it. Each tracked promise counts as one pending
// write until then, so the UI can show "Saved on this phone, will sync".
// Screens never await these promises to navigate.

const pending = new Set();
const pendingListeners = new Set();
const errorListeners = new Set();

function emitPending() {
  const n = pending.size;
  for (const cb of [...pendingListeners]) {
    try {
      cb(n);
    } catch (err) {
      console.error('sync: pending listener failed', err);
    }
  }
}

function isDenied(err) {
  return Boolean(err) && (err.code === 'permission-denied' || err.code === 'firestore/permission-denied');
}

/**
 * Track a write promise. Returns the same promise, already marked as handled,
 * so a write nobody awaits never becomes an unhandled rejection.
 * `opts.quietDenied`: a refusal by the rules is expected (for example a stats
 * count the server already has) and is not reported as an error.
 * @param {Promise<unknown>} promise
 * @param {string} [label] short name used in error reports (for example 'consultation.approve')
 * @param {{ quietDenied?: boolean }} [opts]
 */
export function trackWrite(promise, label = 'write', opts = {}) {
  if (!promise || typeof promise.then !== 'function') return promise;
  const entry = { label, at: Date.now() };
  pending.add(entry);
  emitPending();
  const done = () => {
    pending.delete(entry);
    emitPending();
  };
  promise.then(done, (err) => {
    done();
    if (opts && opts.quietDenied && isDenied(err)) return;
    console.error(`sync: ${label} failed`, err);
    for (const cb of [...errorListeners]) {
      try {
        cb(err, label);
      } catch (e) {
        console.error('sync: error listener failed', e);
      }
    }
  });
  return promise;
}

/** cb(count) now and after every change. Returns unsubscribe. */
export function subscribePending(cb) {
  pendingListeners.add(cb);
  try {
    cb(pending.size);
  } catch (err) {
    console.error('sync: pending listener failed', err);
  }
  return () => {
    pendingListeners.delete(cb);
  };
}

export function pendingCount() {
  return pending.size;
}

/**
 * cb(error, label) when a tracked write is rejected by the server (for example
 * by the security rules). Returns unsubscribe.
 */
export function subscribeWriteErrors(cb) {
  errorListeners.add(cb);
  return () => {
    errorListeners.delete(cb);
  };
}
