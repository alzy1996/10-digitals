// Beard (from LIHYA): the designed beard (10 zones in mm, lines, shape) and the
// Cut Card summary the barber cuts from. Short labels and numbers only.
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase.js';
import { snapList, clean } from '../base.js';
import { BEARD_ZONES, FIELDS, pick } from '../schema.js';

const SAFE_ID = /^[A-Za-z0-9_-]*$/;
const clampMm = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(300, Number(v))) : 0);
const safeId = (v) => (v && SAFE_ID.test(v) ? v : null);

export function sanitizeBeardParams(p = {}) {
  const zones = {};
  for (const z of BEARD_ZONES) if (p.zones?.[z] !== undefined) zones[z] = clampMm(p.zones[z]);
  const lines = pick(p.lines || {}, FIELDS.beardLines);
  for (const k of ['cheekOffset', 'necklineOffset']) if (lines[k] !== undefined) lines[k] = Math.max(-1, Math.min(1, Number(lines[k]) || 0));
  const shape = p.shape ? pick(p.shape, FIELDS.beardShape) : null;
  if (shape?.fadeB) shape.fadeB = shape.fadeB.slice(0, 2).map((v) => (v === null ? null : clampMm(v)));
  return clean({
    styleId: safeId(p.styleId),
    zones,
    lines,
    mustacheId: safeId(p.mustacheId),
    fadeStartMm: p.fadeStartMm === null || p.fadeStartMm === undefined ? null : clampMm(p.fadeStartMm),
    colorId: safeId(p.colorId),
    greyTarget: p.greyTarget === null || p.greyTarget === undefined ? null : Math.max(0, Math.min(100, Number(p.greyTarget) || 0)),
    finish: safeId(p.finish),
    shape,
    presetId: safeId(p.presetId),
  });
}

export function sanitizeCutCard(c = {}) {
  const small = (m) => Object.fromEntries(Object.entries(m || {}).slice(0, 10).map(([k, v]) => [k, typeof v === 'number' ? v : String(v ?? '').slice(0, 200)]));
  return clean({
    zonesMm: small(c.zonesMm),
    guards: small(c.guards),
    cheekLineMm: Number.isFinite(c.cheekLineMm) ? c.cheekLineMm : null,
    necklineMm: Number.isFinite(c.necklineMm) ? c.necklineMm : null,
    notes: small(c.notes),
    safetyFlags: Array.isArray(c.safetyFlags) ? c.safetyFlags.slice(0, 20).map((s) => String(s).slice(0, 60)) : null,
  });
}

export function watchBeardStyles(salonId, cb) {
  return onSnapshot(collection(db, 'salons', salonId, 'beard_styles'), (s) => cb(snapList(s)), () => cb([]));
}
