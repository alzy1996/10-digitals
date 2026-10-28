// Beard (from LIHYA): the designed beard (10 zones in mm, lines, shape) and the
// Cut Card summary the barber cuts from. Short labels and numbers only.
import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase.js';
import { snapList, clean, committed, fire, newId, uid, updated } from '../base.js';
import { logAudit, diffFields } from '../audit.js';
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

// ---------------------------------------------------------------------------
// Beard style catalog: salons/{id}/beard_styles/{styleId}. The seed list (LIHYA's
// styles.json) is passed in by the beard screens so this file never pulls the JSON into
// the app shell. Docs carry the style shape plus the catalog owner fields (hidden,
// localFit 0..5, signature, order, baseId, updatedAt, updatedBy). Owner edits win.
// ---------------------------------------------------------------------------

const STYLE_KEYS = ['id', 'name', 'zones', 'zoneNote', 'shape', 'lines', 'mustacheId', 'faces', 'trimDays', 'localFit', 'lengthClass', 'weights', 'required', 'ageFit', 'theatrical', 'tags', 'order', 'hidden', 'signature', 'baseId'];

export function sortBeardStyles(list) {
  return [...list].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.id).localeCompare(String(b.id)));
}

const cleanName = (v, max = 80) => String(v ?? '').trim().slice(0, max);

/** Style document data that is safe to write (unknown keys dropped, owner fields bounded). */
export function beardStyleData(style = {}) {
  const out = {};
  for (const k of STYLE_KEYS) if (style[k] !== undefined) out[k] = style[k];
  out.id = String(style.id || '');
  if (out.name !== undefined) {
    const n = typeof out.name === 'string' ? { en: out.name, ar: out.name } : out.name || {};
    out.name = { en: cleanName(n.en), ar: cleanName(n.ar || n.en) };
  }
  out.hidden = style.hidden === true;
  out.signature = style.signature === true;
  out.localFit = Math.max(0, Math.min(5, Math.round(Number(style.localFit) || 0)));
  out.order = Math.max(-100000, Math.min(100000, Number(style.order) || 0));
  return clean(JSON.parse(JSON.stringify(out)));
}

/** Seed styles merged with the salon's docs (doc fields win; signature styles appended). */
export function mergeBeardStyles(base = [], remote = []) {
  const byId = new Map(base.map((s) => [s.id, { hidden: false, signature: false, ...s }]));
  for (const d of remote || []) {
    if (!d || !d.id) continue;
    const { _pending, ...rest } = d;
    void _pending;
    byId.set(d.id, { ...(byId.get(d.id) || {}), ...rest });
  }
  return sortBeardStyles([...byId.values()]);
}

/** Staff view: cb(styles) merged and sorted; hidden ones only with includeHidden. */
export function watchBeardCatalog(salonId, base, cb, { includeHidden = false } = {}, onError) {
  return onSnapshot(
    collection(db, 'salons', salonId, 'beard_styles'),
    (s) => {
      const merged = mergeBeardStyles(base, snapList(s));
      cb(includeHidden ? merged : merged.filter((x) => !x.hidden), { hasPendingWrites: s.metadata.hasPendingWrites, fromCache: s.metadata.fromCache, remoteCount: s.size });
    },
    (err) => (onError ? onError(err) : cb(includeHidden ? mergeBeardStyles(base) : mergeBeardStyles(base).filter((x) => !x.hidden))),
  );
}

/**
 * Try at home: the salon's visible styles. Once the catalog is seeded (the owner opened
 * Beard styles), only published docs show; before that, the seed list without hidden ones.
 */
export async function publicBeardStyles(salonId, base) {
  try {
    const s = await getDocs(query(collection(db, 'salons', salonId, 'beard_styles'), where('hidden', '==', false)));
    const remote = snapList(s);
    if (!remote.length) return mergeBeardStyles(base).filter((x) => !x.hidden);
    const ids = new Set(remote.map((x) => x.id));
    return mergeBeardStyles(base, remote).filter((x) => ids.has(x.id) && !x.hidden);
  } catch {
    return mergeBeardStyles(base).filter((x) => !x.hidden);
  }
}

/** Write every seed style once (owners / managers), so hidden styles stay hidden for the public. */
export async function seedBeardStyles(salonId, base) {
  for (let i = 0; i < base.length; i += 400) {
    const batch = writeBatch(db);
    for (const st of base.slice(i, i + 400)) batch.set(doc(db, 'salons', salonId, 'beard_styles', st.id), { ...beardStyleData(st), ...updated() });
    await committed(batch.commit(), 'beardCatalogSeed');
  }
}

/** Owner / manager edit of one style (hidden, localFit, order, or the full shape of a signature style). */
export function updateBeardStyle(salonId, style, patch = {}) {
  if (!style || !style.id) throw new Error('bad-style');
  const next = beardStyleData({ ...style, ...patch, id: style.id, signature: style.signature, baseId: style.baseId });
  fire(setDoc(doc(db, 'salons', salonId, 'beard_styles', style.id), { ...next, ...updated() }), 'beardStyle');
  logAudit(salonId, 'catalog.beard.update', `salons/${salonId}/beard_styles/${style.id}`, diffFields(style, { ...style, ...patch }));
}

/** Clone a style as the salon's own signature style (visible, signature: true). Returns the new id. */
export function createSignatureBeardStyle(salonId, baseStyle, patch = {}) {
  if (!baseStyle || !baseStyle.id) throw new Error('bad-style');
  const slug = String(baseStyle.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'style';
  const id = `sig-${slug}-${newId().slice(0, 6).toLowerCase()}`;
  const data = beardStyleData({ ...baseStyle, ...patch, id, hidden: false, signature: true, order: Number(patch.order ?? (Number(baseStyle.order) || 0) + 1) });
  data.baseId = String(baseStyle.id);
  fire(setDoc(doc(db, 'salons', salonId, 'beard_styles', id), { ...data, ...updated() }), 'beardStyle');
  logAudit(salonId, 'catalog.beard.signature', `salons/${salonId}/beard_styles/${id}`, { baseId: [null, data.baseId] });
  return id;
}

/** Catalog order: styles in the new order get order 10, 20, 30 ... (one batch, one audit entry). */
export function setBeardStyleOrder(salonId, styles) {
  const list = (styles || []).filter((s) => s && s.id);
  if (!list.length) return;
  const batch = writeBatch(db);
  list.forEach((s, i) => batch.set(doc(db, 'salons', salonId, 'beard_styles', s.id), { ...beardStyleData({ ...s, order: (i + 1) * 10 }), ...updated() }));
  fire(batch.commit(), 'beardStyleOrder');
  logAudit(salonId, 'catalog.beard.order', `salons/${salonId}/beard_styles`, { order: [null, list.map((s) => s.id).join(',').slice(0, 190)] });
}

/** One client document, live (the beard Studio reads the learned growth, the Cut Card the phone). */
export function watchBeardClient(salonId, clientId, cb, onError) {
  return onSnapshot(
    doc(db, 'salons', salonId, 'clients', clientId),
    (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null),
    (err) => (onError ? onError(err) : cb(null)),
  );
}

/**
 * Save the beard profile labels to the client (only with his yes): face shape, MST,
 * undertone, age band. The hair labels on the same record are left as they are.
 */
export function saveBeardClientProfile(salonId, clientId, labels = {}) {
  const profile = {};
  for (const k of ['faceShape', 'mst', 'undertone', 'ageBand']) if (labels[k] !== undefined && labels[k] !== null) profile[k] = labels[k];
  const data = clean({ consent: { profile: true, at: serverTimestamp(), by: uid() }, profile, ...updated() });
  fire(setDoc(doc(db, 'salons', salonId, 'clients', clientId), data, { merge: true }), 'beardClientProfile');
}

/**
 * LIHYA's Cut Card (lib/cutcard.js buildCutCard) as the short summary the consultation
 * stores: zone lengths in mm, the guard per zone, the cheek line and neckline heights,
 * one note per zone and the color safety flags. Plain values only, never a photo.
 */
export function compactBeardCutCard(card) {
  if (!card || typeof card !== 'object') return null;
  const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.round(Number(v) * 10) / 10 : null);
  const zonesMm = {};
  const guards = {};
  const notes = {};
  for (const row of Array.isArray(card.rows) ? card.rows : []) {
    if (!row || !BEARD_ZONES.includes(row.zone)) continue;
    const mm = num(row.mm);
    if (mm !== null) zonesMm[row.zone] = Math.max(0, Math.min(300, mm));
    const g = row.guard;
    if (g && typeof g === 'object') {
      const gid = g.kind === 'guard' ? g.guardId : g.kind;
      if (gid !== null && gid !== undefined) guards[row.zone] = String(gid).slice(0, 20);
    }
    const note = row.note && typeof row.note === 'object' ? row.note.key || row.note.en || '' : row.note || '';
    if (note) notes[row.zone] = String(note).slice(0, 200);
  }
  const flags = card.color?.safetyFlags ?? card.safetyFlags;
  return sanitizeCutCard({
    zonesMm,
    guards,
    cheekLineMm: num(card.cheekLine?.mmAboveJaw),
    necklineMm: num(card.neckline?.mmAboveAdamsApple),
    notes,
    safetyFlags: Array.isArray(flags) ? flags.map((x) => (typeof x === 'string' ? x : x && typeof x.key === 'string' ? x.key : null)).filter(Boolean) : null,
  });
}
