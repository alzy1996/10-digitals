// Consultations + Agreement Card approvals (PRD 10.2). Day keys are Muscat dates.
import { collection, doc, onSnapshot, setDoc, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { fire, created, updated, snapList, newId, uid, clean } from './base.js';
import { dayKey as muscatDay } from '../lib/time.js';
import { bumpStats } from './stats.js';
import { pick, FIELDS } from './schema.js';

export function sanitizeParams(p = {}) {
  const out = pick(p, FIELDS.consultationParams);
  if (out.techniqueParams) out.techniqueParams = pick(out.techniqueParams, FIELDS.techniqueParams);
  for (const k of ['cutId', 'fringeId', 'styleId', 'shadeId', 'shade2Id', 'swatchId', 'technique']) if (out[k] === undefined) out[k] = null;
  return clean(out);
}

export function sanitizeAgreement(a = {}) {
  return clean(pick(a, FIELDS.agreement));
}

export function createConsultation(salonId, { clientId = null, params = {}, source = 'chair', notTodayShown = 0, demo = false, dayKeyOverride }) {
  const id = newId('k');
  const day = dayKeyOverride || muscatDay();
  const data = clean({
    clientId,
    stylistUid: uid(),
    params: sanitizeParams(params),
    status: 'draft',
    decisionSeconds: 0,
    aiPreviewUsed: false,
    rating: null,
    nextVisitWeeks: null,
    notTodayShown,
    source,
    dayKey: day,
    demo,
    ...created(),
  });
  fire(setDoc(doc(db, 'salons', salonId, 'consultations', id), data), 'consultation');
  if (!demo) bumpStats(salonId, day, { consultations: 1, notToday: notTodayShown });
  return id;
}

export function updateConsultation(salonId, id, patch) {
  const data = clean({ ...patch, ...updated() });
  if (patch.params) data.params = sanitizeParams(patch.params);
  if (patch.agreement) data.agreement = sanitizeAgreement(patch.agreement);
  return fire(setDoc(doc(db, 'salons', salonId, 'consultations', id), data, { merge: true }), 'consultation');
}

export function approveCustomer(salonId, id) {
  return updateConsultation(salonId, id, { approvals: { customerAt: serverTimestamp() } });
}

export function approveStylist(salonId, c, { decisionSeconds, agreement, params, lookKey, shadeKey, addOns = 0 }) {
  const day = c.dayKey || muscatDay();
  updateConsultation(salonId, c.id, {
    approvals: { stylistAt: serverTimestamp(), stylistUid: uid() },
    status: 'approved',
    decisionSeconds: Math.min(86400, Math.round(decisionSeconds)),
    agreement,
    params,
  });
  if (!c.demo) {
    const maps = {};
    if (lookKey) maps.topLooks = { [lookKey]: 1 };
    if (shadeKey) maps.topShades = { [shadeKey]: 1 };
    bumpStats(salonId, day, { approvals: 1, totalDecisionSeconds: Math.round(decisionSeconds), addOns }, maps);
  }
}

export function markDone(salonId, c, { rating, nextVisitWeeks }) {
  updateConsultation(salonId, c.id, { status: 'done', rating: rating || null, nextVisitWeeks: nextVisitWeeks || null });
  if (!c.demo && rating) bumpStats(salonId, c.dayKey || muscatDay(), { ratingsSum: rating, ratingsCount: 1 });
}

export function markAiUsed(salonId, c) {
  updateConsultation(salonId, c.id, { aiPreviewUsed: true });
  if (!c.demo) bumpStats(salonId, c.dayKey || muscatDay(), { aiRenders: 1 });
}

export function watchConsultationsDay(salonId, day, cb) {
  return watchConsultationsRange(salonId, day, day, cb);
}

export function watchConsultationsRange(salonId, fromKey, toKey, cb) {
  const q = query(collection(db, 'salons', salonId, 'consultations'), where('dayKey', '>=', fromKey), where('dayKey', '<=', toKey), orderBy('dayKey', 'asc'));
  return onSnapshot(q, { includeMetadataChanges: true }, (s) => cb(snapList(s), s.metadata.hasPendingWrites), () => cb([], false));
}

export function watchConsultation(salonId, id, cb) {
  return onSnapshot(doc(db, 'salons', salonId, 'consultations', id), { includeMetadataChanges: true }, (s) => cb(s.exists() ? { id: s.id, ...s.data(), _pending: s.metadata.hasPendingWrites } : null), () => cb(null));
}

export function watchClientConsultations(salonId, clientId, cb) {
  const q = query(collection(db, 'salons', salonId, 'consultations'), where('clientId', '==', clientId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (s) => cb(snapList(s)), () => cb([]));
}
