// The shop's style catalog: shops/{shopId}/styles/{styleId}, seeded from
// src/data/styles.json when the shop is created. Owners and managers show or
// hide styles, edit local fit, reorder, and clone signature styles.

import { query, where } from 'firebase/firestore';
import { autoId, diffFields, sanitizeStylePatch, slug, sortStyles, styleData } from './model.js';
import { auditOp, createdStamp, updatedStamp } from './ops.js';
import { codedError, colRef, commitOps, listenQuery, recall, requireShopId, requireUser } from './db.js';

/**
 * Staff view: cb([style], meta) in catalog order. Hidden styles are left out
 * unless opts.includeHidden (catalog manager).
 */
export function watchStyles(shopId, cb, opts = {}, onError) {
  requireShopId(shopId);
  const includeHidden = Boolean(opts && opts.includeHidden);
  const errorCb = onError || (opts && opts.onError);
  return listenQuery(colRef(`shops/${shopId}/styles`), cb, errorCb, {
    remember: true,
    rememberAs: `shops/${shopId}/styles`,
    label: 'styles',
    map: (list) => sortStyles(includeHidden ? list : list.filter((s) => !s.hidden)),
  });
}

/** Try at home (no staff access): visible styles only, while the shop has Try at home on. */
export function watchPublicStyles(shopId, cb, onError) {
  requireShopId(shopId);
  const q = query(colRef(`shops/${shopId}/styles`), where('hidden', '==', false));
  return listenQuery(q, cb, onError, { label: 'publicStyles', map: sortStyles, retry: false });
}

/** Owner/manager edit (hidden, localFit, order, and the full shape for signature styles). */
export function updateStyle(shopId, styleId, patch = {}) {
  requireShopId(shopId);
  const me = requireUser();
  if (!styleId) throw codedError('invalid-argument', 'styleId');
  const change = sanitizeStylePatch(patch);
  if (!Object.keys(change).length) return;
  const path = `shops/${shopId}/styles/${styleId}`;
  const before = recall(path) || {};
  commitOps(
    [
      { path, data: { ...change, ...updatedStamp(me.uid) }, update: true },
      auditOp(shopId, me.uid, { action: 'style.update', path, changedFields: diffFields(before, change) }),
    ],
    'style.update',
  );
}

/**
 * Clone a style as the shop's own signature style (visible, signature: true,
 * baseId = the original). Returns the new style id at once.
 */
export function createSignatureStyle(shopId, baseStyle, patch = {}) {
  requireShopId(shopId);
  const me = requireUser();
  if (!baseStyle || !baseStyle.id) throw codedError('invalid-argument', 'baseStyle');
  const styleId = `sig-${slug(baseStyle.id)}-${autoId().slice(0, 6).toLowerCase()}`;
  const base = { ...baseStyle };
  delete base.id;
  const data = styleData({
    ...base,
    ...sanitizeStylePatch(patch),
    id: styleId,
    hidden: false,
    signature: true,
    order: Number(patch.order ?? (Number(baseStyle.order) || 0) + 1),
  });
  data.baseId = String(baseStyle.id);
  const path = `shops/${shopId}/styles/${styleId}`;
  commitOps(
    [
      { path, data: { ...data, ...createdStamp(me.uid), ...updatedStamp(me.uid) } },
      auditOp(shopId, me.uid, { action: 'style.signature', path, changedFields: { baseId: [null, data.baseId] } }),
    ],
    'style.create',
  );
  return styleId;
}

/** Save the catalog order: ids[0] first. Writes order 10, 20, 30 and so on. */
export function setStyleOrder(shopId, ids) {
  requireShopId(shopId);
  const me = requireUser();
  const list = (Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string' && id);
  if (!list.length) return;
  const beforeList = recall(`shops/${shopId}/styles`);
  const beforeIds = Array.isArray(beforeList) ? sortStyles(beforeList).map((s) => s.id) : null;
  const ops = list.map((id, i) => ({
    path: `shops/${shopId}/styles/${id}`,
    data: { order: (i + 1) * 10, ...updatedStamp(me.uid) },
    update: true,
  }));
  ops.push(
    auditOp(shopId, me.uid, {
      action: 'style.order',
      path: `shops/${shopId}/styles`,
      changedFields: { order: [beforeIds, list] },
    }),
  );
  commitOps(ops, 'style.order');
}
