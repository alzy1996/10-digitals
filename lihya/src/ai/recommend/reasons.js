// Reason chips (PRD 6.3) and warning chips. Templates live in src/data/reasons.json;
// their texts are the catalog i18n keys (src/lib/i18n/ns/catalog.json), so a chip is
// { key, id, vars } and the UI shows t(key, vars).
//
// Selection: every chip that applies to a style gets a contribution = the points its
// score component earns above a neutral 0.5 (face 30, grow 25, contrast 15, life 10
// points at full weight) or the Eid boost itself (+10). The 3 biggest are shown,
// never more (PRD: "Pick the 3 chips with the biggest contribution").

import REASONS from '../../data/reasons.json';

export const MAX_REASONS = 3;

/** Score weights (PRD 6.1), in points (x 100). occasion: the Eid / wedding boost. */
export const POINTS = Object.freeze({ face: 30, grow: 25, contrast: 15, age: 10, life: 10, local: 10, occasion: 10 });
export const NEUTRAL = 0.5;

const CHIP_BY_ID = new Map(REASONS.chips.map((c) => [c.id, c]));
const CHIP_ORDER = REASONS.chips.map((c) => c.id);
const TRIM_BY_ID = new Map(REASONS.trimTemplates.map((t) => [t.id, t]));
const WARNINGS = REASONS.warnings;
const WARN_BY_ID = new Map(WARNINGS.map((w) => [w.id, w]));

/** Face chips: which face shapes they speak to and when the jawline delta supports them. */
export const FACE_CHIPS = Object.freeze([
  Object.freeze({ id: 'face_elongate', shapes: Object.freeze(['round']), min: 3 }),
  Object.freeze({ id: 'face_soften', shapes: Object.freeze(['square']), min: 3 }),
  Object.freeze({ id: 'face_widen', shapes: Object.freeze(['oblong']), min: 3 }),
  Object.freeze({ id: 'face_balance_chin', shapes: Object.freeze(['heart', 'diamond']), min: 4 }),
]);

/** A shape counts for a face chip when it is the top shape or holds at least this share. */
export const FACE_CHIP_SHARE = 0.3;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function chip(id, vars = {}) {
  const c = CHIP_BY_ID.get(id);
  return { key: c ? c.key : `catalog.reason.${id}`, id, vars };
}

/**
 * Trim interval as a template: { id: 'low_maint', key, cardKey, vars: { days, weeks } }.
 * key is the chip text ("Trim every 2 weeks"); cardKey the short card label ("Every 2 weeks").
 * Arabic needs the dual and plural forms, hence the variants.
 */
export function trimReason(trimDays) {
  const d = Math.max(1, Math.round(Number(trimDays) || 1));
  let variant;
  const vars = { days: d };
  if (d === 1) variant = 'day';
  else if (d === 2) variant = 'days2';
  else if (d % 7 === 0) {
    const w = d / 7;
    vars.weeks = w;
    if (w === 1) variant = 'week';
    else if (w === 2) variant = 'weeks2';
    else if (w <= 10) variant = 'weeks';
    else variant = 'weeksMany';
  } else if (d <= 10) variant = 'days';
  else variant = 'daysMany';
  const t = TRIM_BY_ID.get(variant);
  return { id: 'low_maint', key: t.key, cardKey: `catalog.trim.${variant}`, vars };
}

/**
 * Which face chip (if any) this look earns. shapeShares: { shape: share } (sums to 1, or
 * { shape: 1 } for a barber override); top: the top shape; jaw: jawlineDetail output.
 * Returns { id, strength } or null.
 */
export function faceChipFor(shapeShares, top, jaw) {
  if (!shapeShares || !jaw) return null;
  const measure = {
    face_elongate: jaw.lengthPct,
    face_soften: jaw.jawSoftPct,
    face_widen: jaw.lengthPct < 2 ? jaw.widthPct : 0,
    face_balance_chin: jaw.jawWidthPct,
  };
  let best = null;
  for (const fc of FACE_CHIPS) {
    const share = Math.max(...fc.shapes.map((s) => shapeShares[s] || 0));
    const isTop = fc.shapes.includes(top);
    if (!isTop && share < FACE_CHIP_SHARE) continue;
    const m = measure[fc.id];
    if (!isNum(m) || m < fc.min) continue;
    const strength = (isTop ? Math.max(share, FACE_CHIP_SHARE) : share) * m;
    if (!best || strength > best.strength) best = { id: fc.id, strength };
  }
  return best;
}

/**
 * Up to MAX_REASONS chips, biggest contribution first.
 * ctx: { style, parts: { face, grow, contrast, life }, weak: [zone], faceChip: { id } | null,
 *        contrastLevel: 0..1 | null, beardDarker: boolean, eid: boolean, needsZones: [zone],
 *        growKnown: false when some needed zone was not measured (no grow_ok chip then) }
 */
export function pickReasons(ctx) {
  const { style = {}, parts = {}, weak = [], faceChip = null, contrastLevel = null, beardDarker = false, eid = false } = ctx || {};
  const cands = [];
  const gain = (component, value) => POINTS[component] * ((isNum(value) ? value : NEUTRAL) - NEUTRAL);

  if (faceChip) {
    const g = gain('face', parts.face);
    if (g > 0) cands.push({ ...chip(faceChip.id), contribution: g });
  }
  const needs = Array.isArray(ctx && ctx.needsZones) ? ctx.needsZones : [];
  if (needs.length && ctx.growKnown !== false && !weak.length && isNum(parts.grow) && parts.grow >= 0.9) {
    cands.push({ ...chip('grow_ok', {}), zones: needs.slice(), contribution: gain('grow', parts.grow) });
  }
  const edge = style.lines && style.lines.edge;
  if (
    isNum(contrastLevel) &&
    contrastLevel >= 0.55 &&
    beardDarker &&
    (edge === 'crisp' || edge === 'razor') &&
    style.lengthClass !== 'none'
  ) {
    const g = gain('contrast', parts.contrast);
    if (g > 0) cands.push({ ...chip('high_contrast'), contribution: g });
  }
  const trim = Number(style.trimDays);
  if (Number.isFinite(trim) && trim >= 7 && isNum(parts.life) && parts.life >= 0.75) {
    const t = trimReason(trim);
    cands.push({ key: t.key, id: 'low_maint', vars: t.vars, contribution: gain('life', parts.life) });
  }
  if (eid) cands.push({ ...chip('eid_ready'), contribution: POINTS.occasion });

  cands.sort((a, b) => b.contribution - a.contribution || CHIP_ORDER.indexOf(a.id) - CHIP_ORDER.indexOf(b.id));
  return cands.slice(0, MAX_REASONS).map((c) => {
    const out = { key: c.key, id: c.id, vars: c.vars || {}, contribution: Math.round(c.contribution * 10) / 10 };
    if (c.zones) out.zones = c.zones;
    return out;
  });
}

/** Zone groups in the order their warnings are shown (cheeks first: PRD grow_warn). */
const WARN_GROUPS = Object.freeze(WARNINGS.filter((w) => w.zones && w.zones.length));
export const MAX_ZONE_WARNINGS = 2;

/**
 * Warning chips for zones under 40 % density (PRD 6.1 penalty): one chip per weak zone
 * group, cheeks first; more than MAX_ZONE_WARNINGS groups collapse into one
 * "{count} zones ... under 40%" chip.
 */
export function warningsFor(weakZones) {
  const weak = new Set(Array.isArray(weakZones) ? weakZones : []);
  if (!weak.size) return [];
  const groups = WARN_GROUPS.filter((g) => g.zones.some((z) => weak.has(z)));
  if (groups.length > MAX_ZONE_WARNINGS) {
    const w = WARN_BY_ID.get('under40');
    return [{ key: w.key, id: w.id, vars: { count: weak.size }, zones: [...weak] }];
  }
  return groups.map((g) => ({
    key: g.key,
    id: g.id === 'patchy_cheeks' ? 'grow_warn' : g.id,
    vars: {},
    zones: g.zones.filter((z) => weak.has(z)),
  }));
}

/** "{n} styles hidden by the work rule" chip, or null when nothing was hidden. */
export function workRuleNotice(hiddenCount) {
  const n = Math.max(0, Math.round(Number(hiddenCount) || 0));
  if (!n) return null;
  const w = WARN_BY_ID.get('work_rule_hidden');
  return { key: w.key, id: w.id, vars: { n } };
}

/** Full beard: mustache, chin, jaw and cheeks all kept, longer than stubble. */
export function isFullBeard(style) {
  const z = (style && style.zones) || {};
  const on = (id) => isNum(z[id]) && z[id] > 0;
  const lc = style && style.lengthClass;
  return on('M') && on('C') && (on('J_L') || on('J_R')) && (on('K_L') || on('K_R')) && lc !== 'none' && lc !== 'stubble';
}

function pairingMatches(match, style) {
  if (!match) return false;
  if (match.fullBeard && isFullBeard(style)) return true;
  if (Array.isArray(match.styleIds) && match.styleIds.includes(style.id)) return true;
  if (Array.isArray(match.lengthClasses) && match.lengthClasses.includes(style.lengthClass)) return true;
  return false;
}

/**
 * Haircut pairing hints (PRD 6.4) that apply to a style: [{ key, id, vars, haircut, suggestStyleId }].
 */
export function pairingHints(style) {
  if (!style) return [];
  return REASONS.pairings
    .filter((p) => pairingMatches(p.match, style))
    .map((p) => ({ key: p.key, id: p.id, vars: {}, haircut: p.haircut, suggestStyleId: p.suggestStyleId || null }));
}
