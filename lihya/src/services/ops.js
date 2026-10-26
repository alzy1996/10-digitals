// Write operations as plain data ({ path, data, merge|update|delete }), applied
// to a Firestore batch in one place. Services and the seed builders produce ops;
// the rules tests apply the very same ops against the emulator.

import { doc, increment, serverTimestamp } from 'firebase/firestore';
import { autoId, firestoreSafe } from './model.js';

/** createdAt/createdBy for a new record (rules require createdAt == request.time). */
export function createdStamp(uid) {
  return { createdAt: serverTimestamp(), createdBy: uid };
}

/** updatedAt/updatedBy for a change (rules require updatedAt == request.time). */
export function updatedStamp(uid) {
  return { updatedAt: serverTimestamp(), updatedBy: uid };
}

/** Audit entry for owner/manager changes: shops/{shopId}/audit/{autoId}. */
export function auditOp(shopId, uid, { action, path, changedFields }) {
  return {
    path: `shops/${shopId}/audit/${autoId()}`,
    data: {
      action: String(action || 'change').slice(0, 60),
      path: String(path || `shops/${shopId}`).slice(0, 300),
      by: uid,
      at: serverTimestamp(),
      changedFields: firestoreSafe(changedFields && typeof changedFields === 'object' ? changedFields : {}),
    },
  };
}

const STAT_FIELDS = ['consultations', 'approvals', 'totalDecisionSeconds', 'aiRenders', 'addOns'];

/**
 * Merge data for a dailyStats doc: FieldValue.increment for every non-zero delta,
 * topStyles as { styleId: increment(n) }. Returns null when nothing changes.
 */
export function statsDeltaData(deltas, uid) {
  const data = {};
  let any = false;
  for (const key of STAT_FIELDS) {
    const n = Number(deltas?.[key]);
    if (Number.isFinite(n) && n !== 0) {
      data[key] = increment(Math.round(n));
      any = true;
    }
  }
  const top = deltas?.topStyles;
  if (top && typeof top === 'object') {
    const styles = {};
    for (const [styleId, raw] of Object.entries(top)) {
      const n = Number(raw);
      if (styleId && Number.isFinite(n) && n !== 0) styles[styleId] = increment(Math.round(n));
    }
    if (Object.keys(styles).length) {
      data.topStyles = styles;
      any = true;
    }
  }
  if (!any) return null;
  return { ...data, ...updatedStamp(uid) };
}

export function statsOp(shopId, dayKey, deltas, uid) {
  const data = statsDeltaData(deltas, uid);
  return data ? { path: `shops/${shopId}/dailyStats/${dayKey}`, data, merge: true } : null;
}

/** Add deltas into a { dayKey: deltas } accumulator. */
export function addStats(acc, dayKey, deltas) {
  const cur = acc[dayKey] || (acc[dayKey] = { topStyles: {} });
  for (const key of STAT_FIELDS) {
    const n = Number(deltas[key]);
    if (Number.isFinite(n) && n !== 0) cur[key] = (cur[key] || 0) + n;
  }
  for (const [id, n] of Object.entries(deltas.topStyles || {})) {
    cur.topStyles[id] = (cur.topStyles[id] || 0) + n;
  }
  return acc;
}

/** Apply ops to a WriteBatch (any Firestore instance, including the rules-test one). */
export function applyOps(batch, db, ops) {
  for (const op of ops) {
    if (!op) continue;
    const ref = doc(db, op.path);
    if (op.delete) batch.delete(ref);
    else if (op.update) batch.update(ref, op.data);
    else if (op.merge) batch.set(ref, op.data, { merge: true });
    else batch.set(ref, op.data);
  }
  return batch;
}

/** Split ops into batches below Firestore's 500-write limit. */
export function chunkOps(ops, size = 450) {
  const list = ops.filter(Boolean);
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks;
}
