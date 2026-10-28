// Look parameters (ARCHITECTURE 5): what the barber designs in the Studio and what a
// consultation or Look Code stores. Pure functions, no React, no Firebase, so the
// Studio, the Cut Card, the seed data and the tests all share one implementation.
//
// LookParams = { styleId, zones: { M..N: mm }, lines: { cheek, cheekOffset (-1..1),
//   neckline, necklineOffset (-1..1), sideburn, edge, mustacheEdge }, mustacheId,
//   fadeStartMm: number|null, colorId, greyTarget: number|null,
//   finish: 'matte'|'oiled'|'balm'|'waxed', shape: { ...style.shape }, presetId: string|null }

import STYLES from '../../../data/beard/styles.json';
import MUSTACHES from '../../../data/beard/mustaches.json';
import LINES from '../../../data/beard/lines.json';
import COLORS from '../../../data/beard/colors.json';
import FINISHES from '../../../data/beard/finishes.json';
import REASONS from '../../../data/beard/reasons.json';
import CATALOG_I18N from '../../../data/beard/catalog.i18n.json';

/** The 10 beard zones, customer's own left / right (same ids as src/ai/mesh/zones.js). */
export const LOOK_ZONES = Object.freeze(['M', 'S', 'C', 'J_L', 'J_R', 'K_L', 'K_R', 'B_L', 'B_R', 'N']);
/** Zone groups that set both sides at once in setZoneLength. */
export const ZONE_GROUPS = Object.freeze({ J: ['J_L', 'J_R'], K: ['K_L', 'K_R'], B: ['B_L', 'B_R'] });

export const MAX_ZONE_MM = 200;
export const MAX_GREY = 100;
export const DEFAULT_COLOR_ID = 'natural';
export const DEFAULT_FINISH = 'matte';

/** Length classes from shortest to longest (style.lengthClass). */
export const LENGTH_CLASSES = Object.freeze(['none', 'stubble', 'short', 'medium', 'long', 'xlong']);
/** Chin shapes understood by the renderer (style.shape.chin). 'strip' is the narrow royale strip. */
export const CHIN_SHAPES = Object.freeze(['natural', 'round', 'pointed', 'flat', 'wide-round', 'split', 'braided', 'ring', 'strip']);

/** Allowed option ids per line type, from src/data/lines.json. */
export const LINE_ENUMS = Object.freeze(
  Object.fromEntries(LINES.types.map((t) => [t.id, Object.freeze(t.options.map((o) => o.id))])),
);
export const LINE_TYPES = Object.freeze(LINES.types.map((t) => t.id));
export const PRESETS = Object.freeze(LINES.presets);
export const FINISH_IDS = Object.freeze(FINISHES.map((f) => f.id));
export const MUSTACHE_IDS = Object.freeze(MUSTACHES.map((m) => m.id));
export const COLOR_IDS = Object.freeze(COLORS.map((c) => c.id));

const OFFSET_KEYS = Object.freeze({ cheek: 'cheekOffset', neckline: 'necklineOffset' });
/** Style ids: catalog slugs and shop signature ids ('sig-<slug>-<6>'), as the services store them. */
const STYLE_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const DEFAULT_LINES = Object.freeze({ cheek: 'natural', neckline: '2f', sideburn: 'blended', edge: 'soft', mustacheEdge: 'at' });

const byId = (list) => new Map(list.map((x) => [x.id, x]));
const STYLE_MAP = byId(STYLES);
const MUSTACHE_MAP = byId(MUSTACHES);
const COLOR_MAP = byId(COLORS);
const FINISH_MAP = byId(FINISHES);
const PRESET_MAP = byId(LINES.presets);
const LINE_OPTION_MAP = new Map(LINES.types.map((t) => [t.id, byId(t.options)]));
const SAFETY_MAP = byId(REASONS.safetyQuestions);

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;
const roundHalf = (v) => Math.round(v * 2) / 2;
const toNum = (v) => {
  if (v === null || v === undefined || v === '') return NaN;
  return Number(v);
};

/** Catalog style by id (seed catalog only; shop signature styles live in Firestore). */
export function getStyle(id) {
  return STYLE_MAP.get(id) || null;
}
export function getMustache(id) {
  return MUSTACHE_MAP.get(id) || null;
}
export function getColor(id) {
  return COLOR_MAP.get(id) || null;
}
export function getFinish(id) {
  return FINISH_MAP.get(id) || null;
}
export function getPreset(id) {
  return PRESET_MAP.get(id) || null;
}
/** Option of a line type ('cheek', 'neckline', 'sideburn', 'edge', 'mustacheEdge'). */
export function getLineOption(type, id) {
  const opts = LINE_OPTION_MAP.get(type);
  return (opts && opts.get(id)) || null;
}

/** Style shape with known values only: unknown chin shapes read 'natural', a fade needs two lengths. */
function copyShape(shape) {
  const s = shape && typeof shape === 'object' ? shape : {};
  const fade = Array.isArray(s.fadeB) && s.fadeB.length === 2 ? s.fadeB.map(toNum) : null;
  return {
    chin: CHIN_SHAPES.includes(s.chin) ? s.chin : 'natural',
    jFront: s.jFront === true,
    mustacheFloating: s.mustacheFloating === true,
    fadeB: fade && fade.every(Number.isFinite) ? fade.map((v) => round1(clamp(v, 0, MAX_ZONE_MM))) : null,
    flare: s.flare === true,
    lengthAdjustable: LOOK_ZONES.includes(s.lengthAdjustable) ? s.lengthAdjustable : null,
  };
}

function zoneLength(v) {
  const n = toNum(v);
  return Number.isFinite(n) ? round1(clamp(n, 0, MAX_ZONE_MM)) : 0;
}

/**
 * Starting look for a style. Zones, lines and shape come from the style; mustache from
 * style.mustacheId; color 'natural'; finish 'matte'; line offsets 0; fade start from
 * shape.fadeB. For a customer-set zone (shape.lengthAdjustable, the Sunnah chin) the
 * style default is used, or the customer's current length when the profile measured
 * it confidently and it is longer: a Sunnah beard is not cut shorter by default.
 */
export function paramsFromStyle(style, { profile = null } = {}) {
  const s = style && typeof style === 'object' ? style : {};
  const zones = {};
  for (const z of LOOK_ZONES) zones[z] = zoneLength(s.zones ? s.zones[z] : 0);
  const shape = copyShape(s.shape);
  const adj = shape.lengthAdjustable;
  if (adj && LOOK_ZONES.includes(adj) && profile && profile.beard && profile.beard.zones) {
    const cur = profile.beard.zones[adj];
    if (cur && isNum(cur.lengthMm) && isNum(cur.confidence) && cur.confidence >= 0.5 && cur.lengthMm > zones[adj]) {
      zones[adj] = zoneLength(cur.lengthMm);
    }
  }
  const sl = s.lines && typeof s.lines === 'object' ? s.lines : {};
  const lines = {
    cheek: sl.cheek || DEFAULT_LINES.cheek,
    cheekOffset: 0,
    neckline: sl.neckline || DEFAULT_LINES.neckline,
    necklineOffset: 0,
    sideburn: sl.sideburn || DEFAULT_LINES.sideburn,
    edge: sl.edge || DEFAULT_LINES.edge,
    mustacheEdge: sl.mustacheEdge || DEFAULT_LINES.mustacheEdge,
  };
  return {
    styleId: s.id ? String(s.id) : null,
    zones,
    lines,
    mustacheId: s.mustacheId || null,
    fadeStartMm: shape.fadeB ? zoneLength(shape.fadeB[0]) : null,
    colorId: DEFAULT_COLOR_ID,
    greyTarget: null,
    finish: DEFAULT_FINISH,
    shape,
    presetId: null,
  };
}

/**
 * Complete, clamped copy of a LookParams: every zone present (0..200 mm, 0.1 mm),
 * offsets -1..1, grey 0..100 or null, fade start 0..200 mm or null, color 'natural'
 * and finish 'matte' when missing. Enum values are kept as they are (validateParams
 * reports unknown ones). The input is not changed.
 */
export function clampParams(p) {
  const src = p && typeof p === 'object' ? p : {};
  const zones = {};
  for (const z of LOOK_ZONES) zones[z] = zoneLength(src.zones ? src.zones[z] : 0);
  const sl = src.lines && typeof src.lines === 'object' ? src.lines : {};
  const offset = (v) => {
    const n = toNum(v);
    return Number.isFinite(n) ? Math.round(clamp(n, -1, 1) * 1000) / 1000 : 0;
  };
  const lines = {
    cheek: sl.cheek ?? DEFAULT_LINES.cheek,
    cheekOffset: offset(sl.cheekOffset),
    neckline: sl.neckline ?? DEFAULT_LINES.neckline,
    necklineOffset: offset(sl.necklineOffset),
    sideburn: sl.sideburn ?? DEFAULT_LINES.sideburn,
    edge: sl.edge ?? DEFAULT_LINES.edge,
    mustacheEdge: sl.mustacheEdge ?? DEFAULT_LINES.mustacheEdge,
  };
  const grey = toNum(src.greyTarget);
  const fade = toNum(src.fadeStartMm);
  return {
    styleId: src.styleId ?? null,
    zones,
    lines,
    mustacheId: src.mustacheId || null,
    fadeStartMm: Number.isFinite(fade) ? round1(clamp(fade, 0, MAX_ZONE_MM)) : null,
    colorId: src.colorId || DEFAULT_COLOR_ID,
    greyTarget: Number.isFinite(grey) ? Math.round(clamp(grey, 0, MAX_GREY)) : null,
    finish: src.finish || DEFAULT_FINISH,
    shape: copyShape(src.shape),
    presetId: src.presetId || null,
  };
}

/**
 * Problems with a LookParams as i18n keys (catalog.err.*), empty when valid. Missing
 * color means natural (older docs store null).
 */
export function validateParams(p) {
  const errors = new Set();
  if (!p || typeof p !== 'object') return ['catalog.err.style'];
  if (typeof p.styleId !== 'string' || !STYLE_ID_RE.test(p.styleId)) errors.add('catalog.err.style');
  if (!p.zones || typeof p.zones !== 'object') {
    errors.add('catalog.err.zones');
  } else {
    for (const z of LOOK_ZONES) {
      const v = p.zones[z];
      if (!isNum(v)) errors.add('catalog.err.zones');
      else if (v < 0 || v > MAX_ZONE_MM) errors.add('catalog.err.zoneRange');
    }
  }
  if (!p.lines || typeof p.lines !== 'object') {
    errors.add('catalog.err.lines');
  } else {
    for (const type of LINE_TYPES) {
      if (!LINE_ENUMS[type].includes(p.lines[type])) errors.add(`catalog.err.${type}`);
    }
    for (const k of Object.values(OFFSET_KEYS)) {
      const v = p.lines[k];
      if (v !== undefined && v !== null && (!isNum(v) || v < -1 || v > 1)) errors.add('catalog.err.offset');
    }
  }
  if (p.mustacheId !== null && p.mustacheId !== undefined && !MUSTACHE_MAP.has(p.mustacheId)) errors.add('catalog.err.mustache');
  if (p.colorId !== null && p.colorId !== undefined && !COLOR_MAP.has(p.colorId)) errors.add('catalog.err.color');
  if (p.greyTarget !== null && p.greyTarget !== undefined && (!isNum(p.greyTarget) || p.greyTarget < 0 || p.greyTarget > MAX_GREY)) {
    errors.add('catalog.err.grey');
  }
  if (!FINISH_MAP.has(p.finish)) errors.add('catalog.err.finish');
  if (p.fadeStartMm !== null && p.fadeStartMm !== undefined && (!isNum(p.fadeStartMm) || p.fadeStartMm < 0 || p.fadeStartMm > MAX_ZONE_MM)) {
    errors.add('catalog.err.fade');
  }
  if (p.presetId !== null && p.presetId !== undefined && !PRESET_MAP.has(p.presetId)) errors.add('catalog.err.preset');
  return [...errors];
}

/**
 * A look from outside the Studio (a Look Code, which anyone with the shop's Try-at-home
 * link can write): complete and clamped by clampParams (unknown keys such as a picture
 * dropped), the style from the params or else `fallbackStyleId`, and the problems
 * validateParams still finds (unknown lines, finish, color, mustache, preset or style
 * id). Use `params` only when `errors` is empty.
 */
export function checkLookParams(raw, fallbackStyleId = null) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const own = typeof src.styleId === 'string' && src.styleId ? src.styleId : null;
  const fallback = typeof fallbackStyleId === 'string' && fallbackStyleId ? fallbackStyleId : null;
  const params = clampParams({ ...src, styleId: own || fallback });
  return { params, errors: validateParams(params) };
}

/**
 * Applies a Gulf line-up preset (src/data/lines.json presets) on top of any look:
 * patch.lines replace line types (their drag offsets reset to 0 when the type changes),
 * patch.zonesMax caps zone lengths, patch.zonesSet sets them, patch.finish sets the
 * finish. Unknown preset: a clamped copy, unchanged.
 */
export function applyPreset(params, presetId) {
  const out = clampParams(params);
  const preset = PRESET_MAP.get(presetId);
  if (!preset) return out;
  const patch = preset.patch || {};
  if (patch.lines) {
    for (const [type, value] of Object.entries(patch.lines)) {
      if (!LINE_ENUMS[type] || !LINE_ENUMS[type].includes(value)) continue;
      if (out.lines[type] !== value && OFFSET_KEYS[type]) out.lines[OFFSET_KEYS[type]] = 0;
      out.lines[type] = value;
    }
  }
  if (patch.zonesMax) {
    for (const [z, mm] of Object.entries(patch.zonesMax)) {
      if (LOOK_ZONES.includes(z) && isNum(mm)) out.zones[z] = Math.min(out.zones[z], zoneLength(mm));
    }
  }
  if (patch.zonesSet) {
    for (const [z, mm] of Object.entries(patch.zonesSet)) {
      if (LOOK_ZONES.includes(z) && isNum(mm)) out.zones[z] = zoneLength(mm);
    }
  }
  if (patch.finish && FINISH_MAP.has(patch.finish)) out.finish = patch.finish;
  out.presetId = preset.id;
  return out;
}

/**
 * Global length control: every zone times `factor` (0..4), rounded to 0.5 mm and
 * clamped. A Sunnah-trimmed mustache (mustacheEdge 'short') keeps its length; shaved
 * zones stay shaved. The fade start scales with the zones.
 */
export function scaleLength(params, factor) {
  const out = clampParams(params);
  const f = toNum(factor);
  if (!Number.isFinite(f)) return out;
  const k = clamp(f, 0, 4);
  for (const z of LOOK_ZONES) {
    if (z === 'M' && out.lines.mustacheEdge === 'short') continue;
    out.zones[z] = clamp(roundHalf(out.zones[z] * k), 0, MAX_ZONE_MM);
  }
  if (out.fadeStartMm !== null) out.fadeStartMm = clamp(roundHalf(out.fadeStartMm * k), 0, MAX_ZONE_MM);
  return out;
}

/** Sets one zone ('C', 'K_L'...) or both sides of a group ('J', 'K', 'B'), clamped to 0..200 mm. */
export function setZoneLength(params, zone, mm) {
  const out = clampParams(params);
  const ids = ZONE_GROUPS[zone] || (LOOK_ZONES.includes(zone) ? [zone] : []);
  const n = toNum(mm);
  if (!ids.length || !Number.isFinite(n)) return out;
  for (const z of ids) out.zones[z] = zoneLength(n);
  return out;
}

/**
 * Color choice with its grey default: grey blending starts at its middle option
 * (keeps 50% grey), salt and pepper keeps the detected ratio (null), every other
 * color clears the grey target.
 */
export function setColor(params, colorId) {
  const out = clampParams(params);
  const color = COLOR_MAP.get(colorId);
  if (!color) return out;
  out.colorId = color.id;
  if (Array.isArray(color.greyBlend) && color.greyBlend.length) {
    const cur = out.greyTarget;
    out.greyTarget = isNum(cur) && color.greyBlend.includes(cur) ? cur : color.greyDefault ?? color.greyBlend[0];
  } else {
    out.greyTarget = null;
  }
  return out;
}

/** Safety questions (src/data/reasons.json) to ask before this color, in order. */
export function safetyFor(colorId) {
  const color = COLOR_MAP.get(colorId);
  if (!color || !Array.isArray(color.safety)) return [];
  return color.safety.map((id) => SAFETY_MAP.get(id)).filter(Boolean);
}

/**
 * Safety question ids whose answer is a risk (or still unanswered) for this color.
 * safety: the session's { patchTest48h, metallicSaltProducts, pureHenna, irritationToday }.
 */
export function safetyFlags(colorId, safety) {
  const answers = safety && typeof safety === 'object' ? safety : {};
  return safetyFor(colorId)
    .filter((q) => {
      const a = answers[q.id] === undefined ? null : answers[q.id];
      return q.riskWhen.includes(a);
    })
    .map((q) => q.id);
}

/** "See all styles" length filter chips (PRD 6.4). Long includes very long. */
export const LENGTH_FILTERS = Object.freeze([
  Object.freeze({ id: 'none', labelKey: 'catalog.length.none', classes: Object.freeze(['none']) }),
  Object.freeze({ id: 'stubble', labelKey: 'catalog.length.stubble', classes: Object.freeze(['stubble']) }),
  Object.freeze({ id: 'short', labelKey: 'catalog.length.short', classes: Object.freeze(['short']) }),
  Object.freeze({ id: 'medium', labelKey: 'catalog.length.medium', classes: Object.freeze(['medium']) }),
  Object.freeze({ id: 'long', labelKey: 'catalog.length.long', classes: Object.freeze(['long', 'xlong']) }),
]);

/** "See all styles" maintenance filter chips by trim interval in days (maxDays null = no limit). */
export const MAINTENANCE_FILTERS = Object.freeze([
  Object.freeze({ id: 'high', labelKey: 'catalog.maint.high', minDays: 0, maxDays: 4 }),
  Object.freeze({ id: 'weekly', labelKey: 'catalog.maint.weekly', minDays: 5, maxDays: 10 }),
  Object.freeze({ id: 'low', labelKey: 'catalog.maint.low', minDays: 11, maxDays: null }),
]);

/** Length class of a style; derived from its longest zone when the field is missing. */
export function lengthClassOf(style) {
  if (style && LENGTH_CLASSES.includes(style.lengthClass)) return style.lengthClass;
  const zones = (style && style.zones) || {};
  const max = Math.max(0, ...LOOK_ZONES.map((z) => (isNum(zones[z]) ? zones[z] : 0)));
  if (max <= 0) return 'none';
  if (max <= 7) return 'stubble';
  if (max <= 15) return 'short';
  if (max <= 40) return 'medium';
  if (max <= 80) return 'long';
  return 'xlong';
}

export function matchesLength(style, filterId) {
  if (!filterId || filterId === 'all') return true;
  const f = LENGTH_FILTERS.find((x) => x.id === filterId);
  return f ? f.classes.includes(lengthClassOf(style)) : true;
}

export function matchesMaintenance(style, filterId) {
  if (!filterId || filterId === 'all') return true;
  const f = MAINTENANCE_FILTERS.find((x) => x.id === filterId);
  if (!f) return true;
  const d = Number(style && style.trimDays);
  if (!Number.isFinite(d)) return false;
  return d >= f.minDays && (f.maxDays === null || d <= f.maxDays);
}

/** Styles (or Ranked items, which carry .style) that pass both filters, order kept. */
export function filterStyles(list, { length = null, maintenance = null } = {}) {
  return (Array.isArray(list) ? list : []).filter((item) => {
    const style = item && item.style ? item.style : item;
    return matchesLength(style, length) && matchesMaintenance(style, maintenance);
  });
}

function pick(lang, obj) {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  return (lang === 'en' ? obj.en || obj.ar : obj.ar || obj.en) || '';
}

function say(lang, key, vars) {
  const dict = CATALOG_I18N[lang] || CATALOG_I18N.en;
  const s = dict[key] ?? CATALOG_I18N.en[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : String(vars[k]))) : s;
}

const fmtMm = (mm) => String(Math.round(mm * 10) / 10);

/**
 * One line describing a look, for history lists and share text, for example
 * "Short boxed beard · up to 14 mm · Crisp (trimmer) · Natural short".
 * style: optional style object (needed for shop signature styles, which are not in
 * the seed catalog). Digits stay Latin in Arabic.
 */
export function lookSummary(params, lang = 'ar', style = null) {
  const l = lang === 'en' ? 'en' : 'ar';
  const p = clampParams(params);
  const st = style || getStyle(p.styleId);
  const parts = [];
  const name = st ? pick(l, st.name) : p.styleId || '';
  if (name) parts.push(name);
  const max = Math.max(...LOOK_ZONES.map((z) => p.zones[z]));
  parts.push(max > 0 ? say(l, 'catalog.summary.upTo', { mm: fmtMm(max) }) : say(l, 'catalog.summary.shaved'));
  if (max > 0) {
    const edge = getLineOption('edge', p.lines.edge);
    if (edge) parts.push(pick(l, edge.name));
    const must = p.zones.M > 0 ? getMustache(p.mustacheId) : null;
    if (must) parts.push(pick(l, must.name));
    const color = getColor(p.colorId);
    if (color && color.id !== DEFAULT_COLOR_ID) parts.push(pick(l, color.name));
    if (p.greyTarget !== null && color && color.id !== DEFAULT_COLOR_ID) {
      parts.push(say(l, 'catalog.summary.grey', { pct: p.greyTarget }));
    }
    const finish = getFinish(p.finish);
    if (finish && finish.id !== DEFAULT_FINISH) parts.push(pick(l, finish.name));
  }
  return parts.join(' · ');
}
