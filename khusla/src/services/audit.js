// Audit trail: who changed what, when. Create-only in the rules.
import { addDoc, collection, serverTimestamp, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { fire, snapList, uid } from './base.js';

/** {field: [before, after]} for every changed top-level field (values stringified, capped). */
export function diffFields(before = {}, after = {}) {
  const out = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const k of keys) {
    if (['updatedAt', 'updatedBy', 'createdAt', 'createdBy'].includes(k)) continue;
    const a = JSON.stringify(before?.[k] ?? null);
    const b = JSON.stringify(after?.[k] ?? null);
    if (a !== b) out[k] = [a.slice(0, 200), b.slice(0, 200)];
  }
  return out;
}

export function logAudit(salonId, action, path, changedFields = {}) {
  return fire(
    addDoc(collection(db, 'salons', salonId, 'audit'), { action, path, by: uid(), at: serverTimestamp(), changedFields }),
    'audit',
  );
}

export function watchAudit(salonId, cb, max = 50) {
  return onSnapshot(query(collection(db, 'salons', salonId, 'audit'), orderBy('at', 'desc'), limit(max)), (s) => cb(snapList(s)), () => cb([]));
}
