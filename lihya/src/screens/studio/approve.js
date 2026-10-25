// "This is my look" (PRD 8.1 step 9): the approval shared by the Studio (one look),
// Compare (his favorite) and the AI Final Look screen. It records the approval in the
// session, builds the Cut Card on this phone, and writes the approved consultation in
// the background (offline-safe: the write is queued and never awaited).

import { buildCutCard } from '../../lib/cutcard.js';
import { getStyle } from '../../lib/look.js';
import { approveConsultation, createConsultation } from '../../services/consultations.js';

/** The style object for an id: the shop's own list first (signature styles), then the seed catalog. */
export function findStyle(styles, styleId) {
  if (!styleId) return null;
  const list = Array.isArray(styles) ? styles : [];
  return list.find((s) => s && s.id === styleId) || getStyle(styleId);
}

/**
 * Approve a saved look (lookId) or, without one, the look open in the Studio.
 *
 * @param {object} o
 * @param {object} o.session useSession() value
 * @param {object} [o.shop] useShop() value ({ shopId }); the session's shopId otherwise
 * @param {object} [o.settings] shop settings (guardChart, growthMmPerDay)
 * @param {Array}  [o.styles] the shop's styles (for signature styles)
 * @param {string|null} [o.lookId] saved look id; null approves session.activeParams
 * @param {number|null} [o.growthMmPerDay] the client's learned growth rate, when known
 * @param {boolean} [o.aiPreviewUsed] default: an AI Final Look exists in the session
 * @returns {{ ok: boolean, reason?: 'noLook', approved?, cutCard?, consultationId?, syncError? }}
 */
export function approveLook({ session, shop = null, settings = null, styles = null, lookId = null, growthMmPerDay = null, aiPreviewUsed } = {}) {
  if (!session || typeof session.approve !== 'function') return { ok: false, reason: 'noLook' };
  const look = lookId && Array.isArray(session.looks) ? session.looks.find((l) => l.id === lookId) : null;
  const approved = session.approve(look ? look.id : null);
  if (!approved || !approved.params) return { ok: false, reason: 'noLook' };

  const params = approved.params;
  const style = findStyle(styles, params.styleId || (look && look.styleId));
  const s = settings || {};
  const learned = Number(growthMmPerDay);
  const shopGrowth = Number(s.growthMmPerDay);
  const growth = Number.isFinite(learned) && learned > 0 ? learned : Number.isFinite(shopGrowth) && shopGrowth > 0 ? shopGrowth : null;

  const cutCard = buildCutCard({
    params,
    profile: session.effectiveProfile || session.profile || null,
    style,
    guardChart: s.guardChart,
    safety: session.safety,
    growthMmPerDay: growth,
    now: approved.at,
    front: session.shots ? session.shots.front : null,
  });
  session.setCutCard(cutCard);

  const shopId = (shop && shop.shopId) || session.shopId;
  let consultationId = session.consultationId || null;
  let syncError = null;
  try {
    if (!consultationId) {
      consultationId = createConsultation(shopId, {
        clientId: session.client && session.client.id ? session.client.id : null,
        styleId: params.styleId || null,
        params,
        startedAt: session.startedAt || approved.at,
      });
      session.setConsultationId(consultationId);
    }
    approveConsultation(shopId, consultationId, {
      params,
      cutCard,
      decisionSeconds: approved.decisionSeconds,
      aiPreviewUsed: aiPreviewUsed === undefined ? Boolean(session.aiResult) : aiPreviewUsed === true,
    });
  } catch (err) {
    // The Cut Card is on this phone already; only the shop's record is missing.
    console.error('approve: the consultation could not be written', err);
    syncError = err;
  }
  return { ok: true, approved, cutCard, consultationId, syncError };
}

export default approveLook;
