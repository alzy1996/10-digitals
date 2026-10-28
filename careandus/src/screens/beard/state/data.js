// LIHYA's service calls on the Care & Us data layer. Salon = salons/{id}, the barber is a
// staff member (role stylist, section beard), consultations carry section 'beard', the
// look in `params` (sanitizeBeardParams) and the Cut Card summary in `cutCard`.
// No photo or thumbnail is ever written.
import STYLE_SEED from '../../../data/beard/styles.json';
import {
  compactBeardCutCard,
  createSignatureBeardStyle,
  publicBeardStyles,
  saveBeardClientProfile,
  seedBeardStyles,
  setBeardStyleOrder,
  updateBeardStyle,
  watchBeardCatalog,
  watchBeardClient,
} from '../../../services/sections/beard.js';
import {
  approveCustomer as sharedApproveCustomer,
  approveStylist as sharedApproveStylist,
  createConsultation as sharedCreateConsultation,
  markDone,
  updateConsultation as sharedUpdateConsultation,
} from '../../../services/consultations.js';
import { createLookCode as sharedCreateLookCode } from '../../../services/lookCodes.js';
import { sendRequest } from '../../../services/requests.js';
import { markVisit } from '../../../services/clients.js';
import { logConsent } from '../../../services/consents.js';
import { dayKey } from '../../../lib/time.js';

export const SECTION = 'beard';
export { STYLE_SEED, compactBeardCutCard };

/* ------------------------------------------------------------------ styles */

/** cb(styles, meta): seed styles merged with the salon's edits; hidden ones only with includeHidden. */
export function watchStyles(salonId, cb, opts = {}, onError) {
  if (!salonId) return null;
  return watchBeardCatalog(salonId, STYLE_SEED, cb, { includeHidden: Boolean(opts && opts.includeHidden) }, onError);
}

/** Try at home: the visible styles (a one-time read). */
export function loadPublicStyles(salonId) {
  return publicBeardStyles(salonId, STYLE_SEED);
}

export function seedStyles(salonId) {
  return seedBeardStyles(salonId, STYLE_SEED);
}

export function updateStyle(salonId, style, patch) {
  return updateBeardStyle(salonId, style, patch);
}

export function createSignatureStyle(salonId, baseStyle, patch) {
  return createSignatureBeardStyle(salonId, baseStyle, patch);
}

/** styles: the full style objects in their new order. */
export function setStyleOrder(salonId, styles) {
  return setBeardStyleOrder(salonId, styles);
}

/* ------------------------------------------------------------------ clients */

export function watchClient(salonId, clientId, cb, onError) {
  if (!salonId || !clientId) return null;
  return watchBeardClient(salonId, clientId, cb, onError);
}

/** coarse = toCoarseProfile(profile): faceShape, mst, undertone, ageBand (labels only). */
export function saveClientProfile(salonId, clientId, coarse, consultationId = null) {
  if (!salonId || !clientId || !coarse) return;
  saveBeardClientProfile(salonId, clientId, {
    faceShape: typeof coarse.faceShape === 'string' ? coarse.faceShape : coarse.faceShape?.top,
    mst: Number.isFinite(Number(coarse.mst)) ? Math.min(10, Math.max(1, Math.round(Number(coarse.mst)))) : null,
    undertone: typeof coarse.undertone === 'string' ? coarse.undertone : coarse.skin?.undertone,
    ageBand: typeof coarse.ageBand === 'string' ? coarse.ageBand : coarse.ageBand?.band,
  });
  logConsent(salonId, { type: 'profile_save', clientId, consultationId, granted: true });
}

/* ------------------------------------------------------------------ consultations */

const meta = (id, extra = {}) => ({ id, section: SECTION, demo: false, ...extra });

/** A draft consultation for this visit. Returns the id at once (the write syncs in the background). */
export function createConsultation(salonId, { clientId = null, params = null, visitId = null } = {}) {
  return sharedCreateConsultation(salonId, { section: SECTION, visitId, clientId, params: params || {} });
}

export function updateConsultation(salonId, id, patch = {}) {
  if (!salonId || !id) return undefined;
  const change = {};
  if (patch.params) change.params = patch.params;
  if (patch.clientId !== undefined) change.clientId = patch.clientId || null;
  if (patch.aiPreviewUsed !== undefined) change.aiPreviewUsed = patch.aiPreviewUsed === true;
  if (!Object.keys(change).length) return undefined;
  return sharedUpdateConsultation(salonId, id, change, SECTION);
}

/** The customer agrees to the look on the Cut Card. */
export function approveByCustomer(salonId, id) {
  return sharedApproveCustomer(salonId, id, SECTION);
}

/** The barber agrees: status approved with the final params, the Cut Card summary and the decision time. */
export function approveByBarber(salonId, id, { params, cutCard, decisionSeconds, addOns = 0, dayKey: day } = {}) {
  return sharedApproveStylist(salonId, meta(id, { dayKey: day || dayKey() }), {
    decisionSeconds: Math.max(0, Number(decisionSeconds) || 0),
    params,
    cutCard: compactBeardCutCard(cutCard),
    lookKey: params && params.styleId ? params.styleId : null,
    addOns,
  });
}

/** After the cut: done with the rating (1..5) and the next visit (days -> weeks, 1..52). */
export function completeConsultation(salonId, id, { rating, nextVisitDays, clientId = null, dayKey: day } = {}) {
  const days = Number(nextVisitDays);
  const weeks = Number.isFinite(days) && days > 0 ? Math.min(52, Math.max(1, Math.round(days / 7))) : null;
  markDone(salonId, meta(id, { dayKey: day || dayKey() }), { rating: rating || null, nextVisitWeeks: weeks });
  if (clientId) markVisit(salonId, clientId);
}

/* ------------------------------------------------------------------ customer at home */

/** The look only (never a photo): { code, expiresAt: Date }. */
export function createLookCode(salonId, params) {
  return sharedCreateLookCode(salonId, params, SECTION);
}

/** Send the look to the salon with a name or phone (never a photo). */
export function sendLook(salonId, { params, customerName, customerPhone, note, lang }) {
  return sendRequest(salonId, { section: SECTION, params, customerName, customerPhone, note, lang });
}

/* ------------------------------------------------------------------ prices */

/**
 * The salon's active products for the beard: the ones tagged section 'beard'; a salon that
 * tagged none yet sees its untagged products (never another service's).
 */
export function beardProducts(products) {
  const active = (Array.isArray(products) ? products : []).filter((p) => p && p.active !== false);
  const tagged = active.filter((p) => p.section === 'beard');
  return tagged.length ? tagged : active.filter((p) => !p.section);
}

/** Add-ons for the daily stats: treatments and retail (as the hair Agreement counts them). */
export function addOnCount(ids, products) {
  return (ids || []).filter((id) => ['treatment', 'retail', 'oil', 'balm'].includes((products || []).find((p) => p.id === id)?.category)).length;
}
