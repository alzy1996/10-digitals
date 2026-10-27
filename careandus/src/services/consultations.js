// Consultations + Agreement Card approvals (PRD 10.2). Day keys are Muscat dates.
import { collection, doc, onSnapshot, setDoc, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { fire, created, updated, snapList, newId, uid, clean, pendingOf } from './base.js';
import { dayKey as muscatDay } from '../lib/time.js';
import { bumpStats } from './stats.js';
import { pick, FIELDS, SECTIONS } from './schema.js';
import { sanitizeNailDesign } from './sections/nails.js';
import { sanitizeBeardParams, sanitizeCutCard } from './sections/beard.js';

export function sanitizeParams(p = {}) {
  const out = pick(p, FIELDS.consultationParams);
  if (out.techniqueParams) out.techniqueParams = pick(out.techniqueParams, FIELDS.techniqueParams);
  for (const k of ['cutId', 'fringeId', 'styleId', 'shadeId', 'shade2Id', 'swatchId', 'technique']) if (out[k] === undefined) out[k] = null;
  return clean(out);
}

/** Params of any service: hair look, nail design or beard design. */
export function sanitizeSectionParams(section, p) {
  if (section === 'nails') return sanitizeNailDesign(p);
  if (section === 'beard') return sanitizeBeardParams(p);
  return sanitizeParams(p);
}

export function sanitizeAgreement(a = {}) {
  return clean(pick(a, FIELDS.agreement));
}

/**
 * section: 'hair' | 'nails' | 'beard'. visitId links the services of one visit
 * (hair + nails for the same client share one Agreement Card).
 */
export function createConsultation(salonId, { section = 'hair', visitId = null, clientId = null, params = {}, source = 'chair', notTodayShown = 0, demo = false, dayKeyOverride }) {
  if (!SECTIONS.includes(section)) throw new Error('bad-section');
  const id = newId('k');
  const day = dayKeyOverride || muscatDay();
  const data = clean({
    section,
    visitId,
    clientId,
    stylistUid: uid(),
    params: sanitizeSectionParams(section, params),
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
  if (!demo) bumpStats(salonId, day, { consultations: 1, notToday: notTodayShown }, {}, section);
  return id;
}

/** section is the consultation's own service (it never changes); defaults to hair. */
export function updateConsultation(salonId, id, patch, section = 'hair') {
  const { section: ignored, ...rest } = patch;
  void ignored;
  const data = clean({ ...rest, ...updated() });
  if (rest.params) data.params = sanitizeSectionParams(section, rest.params);
  if (rest.agreement) data.agreement = sanitizeAgreement(rest.agreement);
  if (rest.cutCard) data.cutCard = sanitizeCutCard(rest.cutCard);
  return fire(setDoc(doc(db, 'salons', salonId, 'consultations', id), data, { merge: true }), 'consultation');
}

export function approveCustomer(salonId, id, section = 'hair') {
  return updateConsultation(salonId, id, { approvals: { customerAt: serverTimestamp() } }, section);
}

export function approveStylist(salonId, c, { decisionSeconds, agreement, cutCard, params, lookKey, shadeKey, addOns = 0 }) {
  const day = c.dayKey || muscatDay();
  const section = c.section || 'hair';
  updateConsultation(salonId, c.id, {
    approvals: { stylistAt: serverTimestamp(), stylistUid: uid() },
    status: 'approved',
    decisionSeconds: Math.min(86400, Math.round(decisionSeconds)),
    agreement: section === 'hair' ? agreement : undefined,
    cutCard: section === 'beard' ? cutCard : undefined,
    params,
  }, section);
  if (!c.demo) {
    const maps = {};
    if (lookKey) maps.topLooks = { [lookKey]: 1 };
    if (shadeKey) maps.topShades = { [shadeKey]: 1 };
    bumpStats(salonId, day, { approvals: 1, totalDecisionSeconds: Math.round(decisionSeconds), addOns }, maps, section);
  }
}

export function markDone(salonId, c, { rating, nextVisitWeeks }) {
  updateConsultation(salonId, c.id, { status: 'done', rating: rating || null, nextVisitWeeks: nextVisitWeeks || null }, c.section);
  if (!c.demo && rating) bumpStats(salonId, c.dayKey || muscatDay(), { ratingsSum: rating, ratingsCount: 1 }, {}, c.section);
}

export function markAiUsed(salonId, c) {
  updateConsultation(salonId, c.id, { aiPreviewUsed: true }, c.section);
  if (!c.demo) bumpStats(salonId, c.dayKey || muscatDay(), { aiRenders: 1 }, {}, c.section);
}

export function watchConsultationsDay(salonId, day, cb) {
  return watchConsultationsRange(salonId, day, day, cb);
}

export function watchConsultationsRange(salonId, fromKey, toKey, cb) {
  const q = query(collection(db, 'salons', salonId, 'consultations'), where('dayKey', '>=', fromKey), where('dayKey', '<=', toKey), orderBy('dayKey', 'asc'));
  return onSnapshot(q, { includeMetadataChanges: true }, (s) => cb(snapList(s), pendingOf(s)), () => cb([], false));
}

export function watchConsultation(salonId, id, cb) {
  return onSnapshot(doc(db, 'salons', salonId, 'consultations', id), { includeMetadataChanges: true }, (s) => cb(s.exists() ? { id: s.id, ...s.data(), _pending: pendingOf(s) } : null), () => cb(null));
}

export function watchClientConsultations(salonId, clientId, cb) {
  const q = query(collection(db, 'salons', salonId, 'consultations'), where('clientId', '==', clientId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (s) => cb(snapList(s)), () => cb([]));
}
