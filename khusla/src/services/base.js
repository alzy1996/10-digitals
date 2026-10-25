// Shared Firestore helpers. Every write goes through src/services/*; components never call Firestore.
// Writes are fire-and-forget so the app keeps working offline: the persistent cache queues them and
// snapshots report hasPendingWrites ("Saved on this device, will sync").
import { serverTimestamp } from 'firebase/firestore';
import { auth } from '../lib/firebase.js';

const listeners = new Set();
export function onWriteError(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Attach error reporting to a write promise without blocking the UI on the server ack. */
export function fire(promise, label = 'write') {
  promise.catch((err) => {
    listeners.forEach((fn) => fn({ label, code: err?.code || 'unknown', message: err?.message }));
  });
  return promise;
}

export function uid() {
  const u = auth.currentUser;
  if (!u) throw Object.assign(new Error('not-signed-in'), { code: 'auth' });
  return u.uid;
}

export function created() {
  const me = uid();
  return { createdAt: serverTimestamp(), createdBy: me, updatedAt: serverTimestamp(), updatedBy: me };
}

export function updated() {
  return { updatedAt: serverTimestamp(), updatedBy: uid() };
}

/** Remove undefined values (Firestore rejects them) but keep nulls. Only plain objects/arrays are walked. */
export function clean(obj) {
  if (Array.isArray(obj)) return obj.map(clean);
  if (obj && typeof obj === 'object' && Object.getPrototypeOf(obj) === Object.prototype) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = clean(v);
    return out;
  }
  return obj;
}

export function snapList(snap) {
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), _pending: d.metadata.hasPendingWrites }));
}

export function newId(prefix = '') {
  const a = new Uint8Array(10);
  crypto.getRandomValues(a);
  return prefix + Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 18);
}
