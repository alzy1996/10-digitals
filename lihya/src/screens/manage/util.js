// Pure helpers for the owner catalog, products and staff screens (S16, S17, S18).
// No React, no Firebase: labels, the signature-style draft and patch, price input.

import { translate, pickLang } from '../../lib/i18n/useT.js';
import { LOOK_ZONES, LENGTH_CLASSES, LINE_TYPES, lengthClassOf } from '../../lib/look.js';
import { parsePriceOmr } from '../../reports/csv.js';

export const EMPTY = Object.freeze([]);

/** Face codes used by styles.json (`faces`), in the order the chips show them. */
export const FACE_CODES = Object.freeze(['OV', 'RD', 'SQ', 'OB', 'HT', 'DM', 'TR']);
const FACE_KEYS = Object.freeze({
  OV: 'face.oval',
  RD: 'face.round',
  SQ: 'face.square',
  OB: 'face.oblong',
  HT: 'face.heart',
  DM: 'face.diamond',
  TR: 'face.triangle',
});

/** Product categories (PRD 10.2), in the order the chips and groups show them. */
export const PRODUCT_CATEGORIES = Object.freeze(['service', 'dye', 'oil', 'balm', 'other']);

/**
 * Zone groups for the length sliders, top of the face to the bottom (sideburns, cheeks,
 * mustache, soul patch, jawline, chin, neck). Paired zones are the customer's own left and right.
 */
export const ZONE_SLIDER_GROUPS = Object.freeze([
  Object.freeze({ id: 'B', zones: Object.freeze(['B_L', 'B_R']) }),
  Object.freeze({ id: 'K', zones: Object.freeze(['K_L', 'K_R']) }),
  Object.freeze({ id: 'M', zones: Object.freeze(['M']) }),
  Object.freeze({ id: 'S', zones: Object.freeze(['S']) }),
  Object.freeze({ id: 'J', zones: Object.freeze(['J_L', 'J_R']) }),
  Object.freeze({ id: 'C', zones: Object.freeze(['C']) }),
  Object.freeze({ id: 'N', zones: Object.freeze(['N']) }),
]);

const PAIRS = Object.freeze([
  ['J_L', 'J_R'],
  ['K_L', 'K_R'],
  ['B_L', 'B_R'],
]);

/**
 * Length stops for the zone sliders: fine steps where beards are short, coarse where
 * they are long, so a phone-width slider is precise from stubble to a 200 mm beard.
 */
export const LENGTH_STOPS = Object.freeze(
  (() => {
    const out = [];
    for (let v = 0; v <= 10; v += 0.5) out.push(v);
    for (let v = 11; v <= 30; v += 1) out.push(v);
    for (let v = 32; v <= 60; v += 2) out.push(v);
    for (let v = 65; v <= 100; v += 5) out.push(v);
    for (let v = 110; v <= 200; v += 10) out.push(v);
    return out;
  })(),
);

/** Index of the stop nearest to `mm`. */
export function nearestStop(mm) {
  const v = Number(mm);
  if (!Number.isFinite(v)) return 0;
  let best = 0;
  let dist = Infinity;
  LENGTH_STOPS.forEach((s, i) => {
    const d = Math.abs(s - v);
    if (d < dist) {
      dist = d;
      best = i;
    }
  });
  return best;
}

/** Next stop up (dir 1) or down (dir -1) from a value that may sit between stops. */
export function stepStop(mm, dir) {
  const v = Number(mm) || 0;
  if (dir > 0) {
    const next = LENGTH_STOPS.find((s) => s > v + 1e-9);
    return next === undefined ? LENGTH_STOPS[LENGTH_STOPS.length - 1] : next;
  }
  for (let i = LENGTH_STOPS.length - 1; i >= 0; i -= 1) if (LENGTH_STOPS[i] < v - 1e-9) return LENGTH_STOPS[i];
  return 0;
}

// ---------------------------------------------------------------- labels

/** Style name in the UI language, and the other language's name (or '' when it is the same). */
export function styleNames(style, lang) {
  const name = (style && style.name) || {};
  const primary = pickLang(lang, name) || (style && style.id) || '';
  const other = pickLang(lang === 'ar' ? 'en' : 'ar', name);
  return { primary, other: other && other !== primary ? other : '' };
}

/** i18n key for a length class (very long has its own label; the filter chip groups it with long). */
export function lengthLabelKey(cls) {
  if (cls === 'xlong') return 'manage.length.xlong';
  return `catalog.length.${LENGTH_CLASSES.includes(cls) ? cls : 'none'}`;
}

/**
 * Trim interval label ("Every 4 days", "Every 2 weeks"), with the Arabic dual and plural forms
 * (same templates the style cards use: catalog.trim.*).
 */
export function trimLabel(t, trimDays) {
  const d = Math.max(1, Math.round(Number(trimDays) || 1));
  if (d === 1) return t('catalog.trim.day');
  if (d === 2) return t('catalog.trim.days2', { days: d });
  if (d % 7 === 0) {
    const w = d / 7;
    if (w === 1) return t('catalog.trim.week');
    if (w === 2) return t('catalog.trim.weeks2', { weeks: w });
    return t(w <= 10 ? 'catalog.trim.weeks' : 'catalog.trim.weeksMany', { weeks: w, days: d });
  }
  return t(d <= 10 ? 'catalog.trim.days' : 'catalog.trim.daysMany', { days: d });
}

export function faceLabelKey(code) {
  return FACE_KEYS[code] || null;
}

/** "Oval, Round, Triangle" or "All face shapes". */
export function facesText(t, faces) {
  const list = Array.isArray(faces) ? faces : [];
  if (!list.length || list.includes('all')) return t('manage.faces.all');
  return list
    .map((c) => (FACE_KEYS[c] ? t(FACE_KEYS[c]) : null))
    .filter(Boolean)
    .join(t('manage.listSep'));
}

/** Product name in the UI language and the other one (when different). */
export function productNames(p, lang) {
  const en = (p && p.name) || '';
  const ar = (p && p.nameAr) || '';
  const primary = lang === 'ar' ? ar || en : en || ar;
  const other = lang === 'ar' ? en : ar;
  return { primary, other: other && other !== primary ? other : '' };
}

// ---------------------------------------------------------------- signature style draft

function zonesOf(style) {
  const out = {};
  const src = (style && style.zones) || {};
  for (const z of LOOK_ZONES) {
    const n = Number(src[z]);
    out[z] = Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : 0;
  }
  return out;
}

export function zonesSymmetric(zones) {
  return PAIRS.every(([l, r]) => Number(zones[l]) === Number(zones[r]));
}

/**
 * Editable copy of a style for the signature editor.
 * mode 'clone': names get the "(signature)" suffix in both languages.
 */
export function draftFromStyle(style, mode) {
  const name = (style && style.name) || {};
  const en = name.en || name.ar || (style && style.id) || '';
  const ar = name.ar || name.en || (style && style.id) || '';
  const zones = zonesOf(style);
  const lines = {};
  const sl = (style && style.lines) || {};
  for (const type of LINE_TYPES) lines[type] = sl[type] || null;
  const faces = Array.isArray(style && style.faces) && style.faces.length ? [...style.faces] : ['all'];
  const fit = Math.round(Number(style && style.localFit));
  return {
    nameAr: mode === 'clone' ? translate('ar', 'manage.sig.defaultName', { name: ar }) : ar,
    nameEn: mode === 'clone' ? translate('en', 'manage.sig.defaultName', { name: en }) : en,
    zones,
    linked: zonesSymmetric(zones),
    lines,
    faces,
    trimDays: Math.min(30, Math.max(1, Math.round(Number(style && style.trimDays) || 7))),
    localFit: Number.isFinite(fit) && fit >= 1 && fit <= 5 ? fit : 3,
  };
}

/** Set one zone (or both sides when linked and the zone is one of a pair). */
export function setDraftZone(draft, zone, mm) {
  const zones = { ...draft.zones, [zone]: mm };
  if (draft.linked) {
    for (const [l, r] of PAIRS) {
      if (zone === l) zones[r] = mm;
      if (zone === r) zones[l] = mm;
    }
  }
  return { ...draft, zones };
}

/** Link left and right: the right side takes the customer's left side value. */
export function linkDraft(draft, linked) {
  if (!linked) return { ...draft, linked: false };
  const zones = { ...draft.zones };
  for (const [l, r] of PAIRS) zones[r] = zones[l];
  return { ...draft, linked: true, zones };
}

/** Faces chip change: "All" and specific shapes exclude each other. */
export function nextFaces(prev, next) {
  const before = Array.isArray(prev) ? prev : [];
  const after = Array.isArray(next) ? next : [];
  if (after.includes('all') && !before.includes('all')) return ['all'];
  if (before.includes('all') && after.length > 1) return after.filter((f) => f !== 'all');
  return after;
}

/** The style the preview and the validator see: the base style with the draft applied. */
export function previewStyle(base, draft) {
  return {
    ...(base || {}),
    name: { en: draft.nameEn.trim() || draft.nameAr.trim(), ar: draft.nameAr.trim() || draft.nameEn.trim() },
    zones: { ...draft.zones },
    lines: { ...((base && base.lines) || {}), ...draft.lines },
    faces: [...draft.faces],
    trimDays: draft.trimDays,
    localFit: draft.localFit,
  };
}

function nonZeroZones(zones) {
  return new Set(LOOK_ZONES.filter((z) => z !== 'N' && Number(zones && zones[z]) > 0));
}

/**
 * Grow-ability weights for an edited style. Unchanged zone set: the base weights as they are.
 * Zones only removed: the base weights for the zones still grown. A zone newly grown:
 * null, so the recommender uses its generic zone weights for every grown zone.
 */
export function weightsFor(zones, base) {
  const baseWeights = base && base.weights && typeof base.weights === 'object' ? base.weights : null;
  const now = nonZeroZones(zones);
  if (!now.size) return {};
  if (!baseWeights) return null;
  const before = nonZeroZones(base.zones);
  const same = now.size === before.size && [...now].every((z) => before.has(z));
  if (same) return { ...baseWeights };
  const added = [...now].filter((z) => !before.has(z));
  const kept = Object.fromEntries(Object.entries(baseWeights).filter(([z, w]) => now.has(z) && Number(w) > 0));
  if (!added.length && Object.keys(kept).length) return kept;
  return null;
}

/** Short zone note like the seed catalog's: "M 6, S 10, C 15, J 8/8, rest 0". */
export function zoneNoteOf(zones) {
  const parts = [];
  for (const z of ['M', 'S', 'C']) if (zones[z] > 0) parts.push(`${z} ${zones[z]}`);
  for (const [l, r] of PAIRS) {
    if (zones[l] > 0 || zones[r] > 0) {
      const g = l.slice(0, 1);
      parts.push(zones[l] === zones[r] ? `${g} ${zones[l]}` : `${g} ${zones[l]}/${zones[r]}`);
    }
  }
  if (zones.N > 0) parts.push(`N ${zones.N}`);
  return parts.length ? `${parts.join(', ')}${parts.length < 7 ? ', rest 0' : ''}` : 'all 0';
}

/** Firestore patch for createSignatureStyle / updateStyle. */
export function signaturePatch(base, draft) {
  const s = previewStyle(base, draft);
  const zones = {};
  for (const z of LOOK_ZONES) zones[z] = Math.round(Number(draft.zones[z] || 0) * 10) / 10;
  return {
    name: s.name,
    zones,
    lines: { ...draft.lines },
    faces: draft.faces.includes('all') ? ['all'] : FACE_CODES.filter((c) => draft.faces.includes(c)),
    trimDays: draft.trimDays,
    localFit: draft.localFit,
    lengthClass: lengthClassOf({ zones }),
    weights: weightsFor(zones, base),
    zoneNote: zoneNoteOf(zones),
  };
}

export function sameDraft(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Whether closing the signature editor may step back in history (navigate(-1)) instead of
 * replacing its URL: only when the list opened it (location state `fromList`) and the entry
 * behind it belongs to this app (the router's history index is above 0). A deep-linked or
 * reloaded editor has nothing of ours behind it, and going back would leave the app.
 */
export function canStepBack(locationState, historyState) {
  const idx = historyState && typeof historyState === 'object' ? Number(historyState.idx) : NaN;
  return Boolean(locationState && locationState.fromList) && Number.isInteger(idx) && idx > 0;
}

// ---------------------------------------------------------------- products

/**
 * Price as typed: Arabic digits and the Arabic decimal mark are read by parsePriceOmr;
 * a lone comma (decimal keypads in some locales) counts as the decimal point.
 * Returns { value, reason } where reason is a report.csv.reason.* suffix.
 */
export function readPrice(raw) {
  let s = String(raw ?? '').trim();
  if (s.includes(',') && !s.includes('.') && !s.includes('٫') && s.split(',').length === 2) s = s.replace(',', '.');
  return parsePriceOmr(s);
}

/** Editable copy of a product (or a blank one). */
export function productDraft(p) {
  if (!p) return { nameAr: '', name: '', category: null, price: '', active: true };
  const nameAr = p.nameAr || '';
  // An Arabic-only product stores its Arabic name in `name` too: leave the English field empty.
  const name = p.name && p.name !== nameAr ? p.name : '';
  const price = Number(p.priceOmr);
  return {
    nameAr,
    name,
    category: PRODUCT_CATEGORIES.includes(p.category) ? p.category : null,
    price: Number.isFinite(price) ? price.toFixed(3) : '',
    active: p.active !== false,
  };
}

/** Validate a product draft: { value: { name, nameAr, category, priceOmr, active }, errors: { field: reasonKey } }. */
export function checkProduct(draft) {
  const errors = {};
  const ar = draft.nameAr.trim();
  const en = draft.name.trim();
  if (!ar && !en) errors.name = 'manage.prod.err.name';
  if (!PRODUCT_CATEGORIES.includes(draft.category)) errors.category = 'manage.prod.err.category';
  const price = readPrice(draft.price);
  if (price.reason) errors.price = `report.csv.reason.${price.reason}`;
  return {
    value: { name: en || ar, nameAr: ar, category: draft.category, priceOmr: price.value, active: draft.active === true },
    errors,
  };
}
