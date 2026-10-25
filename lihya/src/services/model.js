// Pure data shaping for the Firebase layer. No Firebase calls here, so every
// rule about what may be stored (labels only, no images, no raw ratios, prices
// with 3 decimals, Muscat day keys) is unit-tested without an emulator.

import { DEFAULT_GUARD_CHART, validateGuardChart } from '../lib/guards.js';
import { normalizeOmanPhone, roundOmr } from '../lib/format.js';
import { toDate } from '../lib/time.js';
import { LIMITS } from '../config/app.js';

export const ZONE_KEYS = ['M', 'S', 'C', 'J_L', 'J_R', 'K_L', 'K_R', 'B_L', 'B_R', 'N'];
export const ROLES = ['owner', 'manager', 'barber'];
export const INVITE_ROLES = ['manager', 'barber'];
export const PRODUCT_CATEGORIES = ['service', 'dye', 'oil', 'balm', 'other'];
export const CONSULTATION_STATUS = ['draft', 'approved', 'done', 'cancelled'];
export const APPROVED_STATUS = ['approved', 'done'];
export const CONSENT_TYPES = ['ai_render', 'profile_save'];
export const FACE_SHAPES = ['oval', 'round', 'square', 'oblong', 'heart', 'diamond', 'triangle'];
export const UNDERTONES = ['warm', 'cool', 'neutral', 'olive'];
export const AGE_BANDS = ['18-24', '25-34', '35-44', '45-54', '55+'];
export const LANGUAGES = ['ar', 'en'];

export const RANGE_LIMIT = 2000;
export const RECENT_CLIENTS_DEFAULT = 20;
export const SEARCH_LIMIT = 10;
export const MAX_ADDONS = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Shop settings defaults (PRD 10.2). `shop.settings` is always merged over these. */
export const DEFAULT_SETTINGS = Object.freeze({
  aiPreview: false,
  aiDailyCap: LIMITS.aiDailyCapShopDefault,
  retentionDays: LIMITS.retentionDaysDefault,
  growthMmPerDay: LIMITS.growthMmPerDayDefault,
  guardChart: DEFAULT_GUARD_CHART,
  defaultLanguage: 'ar',
  tryAtHome: true,
  whatsapp: '',
});

const SETTINGS_LIMITS = {
  aiDailyCap: [0, LIMITS.aiDailyCapAccount],
  retentionDays: [30, 3650],
  growthMmPerDay: [0.05, 2],
};

// ---------------------------------------------------------------- small helpers

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function round1(v) {
  return Math.round(Number(v) * 10) / 10;
}

export function round2(v) {
  return Math.round(Number(v) * 100) / 100;
}

/** Integer in [min, max], or `fallback` when the input is not a finite number. */
export function clampInt(v, min, max, fallback = null) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return clamp(Math.round(n), min, max);
}

export function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Collapse whitespace, trim and cut to `max` characters. */
export function cleanText(value, max = 80) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

export function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function isPlainObject(v) {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function randomBytes(n) {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** 20-character id with the same alphabet and length as Firestore auto ids. */
export function autoId() {
  let id = '';
  while (id.length < 20) {
    for (const b of randomBytes(40)) {
      // 248 = 4 * 62: reject the top bytes so every character is equally likely.
      if (b < 248 && id.length < 20) id += ID_ALPHABET[b % 62];
    }
  }
  return id;
}

/**
 * Make a value safe for Firestore: undefined -> dropped (in maps) or null (in lists),
 * NaN/Infinity -> null, and a list directly inside a list is wrapped as { list }
 * because Firestore does not store nested arrays. Class instances (Timestamp,
 * FieldValue sentinels, Date) pass through untouched.
 */
export function firestoreSafe(value, inArray = false) {
  if (value === undefined || value === null) return null;
  const t = typeof value;
  if (t === 'number') return Number.isFinite(value) ? value : null;
  if (t === 'string' || t === 'boolean') return value;
  if (t === 'function' || t === 'symbol' || t === 'bigint') return null;
  if (Array.isArray(value)) {
    const list = value.map((v) => firestoreSafe(v, true));
    return inArray ? { list } : list;
  }
  if (isPlainObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined || !k) continue;
      out[k] = firestoreSafe(v, false);
    }
    return out;
  }
  return value;
}

// ---------------------------------------------------------------- text, email, phone, codes

/**
 * Search key for client names: lower case, Arabic letter variants unified
 * (alef forms, ta marbuta, alef maqsura), diacritics and tatweel removed,
 * Arabic-Indic digits mapped to Latin. Stored as `displayNameLower`.
 */
export function searchKey(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function isValidEmail(value) {
  const e = normalizeEmail(value);
  return e.length <= 254 && /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(e);
}

/**
 * Phone for a client or the shop WhatsApp: Omani numbers become +968XXXXXXXX,
 * other international numbers keep +digits (8 to 15 digits).
 * Returns { value: string|null, valid: boolean } (empty input is valid and null).
 */
export function normalizePhone(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { value: null, valid: true };
  const oman = normalizeOmanPhone(text);
  if (oman) return { value: oman, valid: true };
  const digits = text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[^\d+]/g, '')
    .replace(/^00/, '+');
  const m = /^\+?(\d{8,15})$/.exec(digits);
  if (!m) return { value: null, valid: false };
  return { value: `+${m[1]}`, valid: true };
}

const CODE_RE = new RegExp(`^[${LIMITS.lookCodeAlphabet}]{${LIMITS.lookCodeLength}}$`);

/** Random Look Code from the alphabet without 0, O, 1, I (32 symbols, so no modulo bias). */
export function generateLookCode() {
  const alphabet = LIMITS.lookCodeAlphabet;
  let code = '';
  for (const b of randomBytes(LIMITS.lookCodeLength)) code += alphabet[b % alphabet.length];
  return code;
}

/** Upper-case and strip separators; returns the code or null when it cannot be a Look Code. */
export function normalizeLookCode(input) {
  const code = String(input ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return CODE_RE.test(code) ? code : null;
}

// ---------------------------------------------------------------- settings

/** shop.settings merged over DEFAULT_SETTINGS; an invalid guard chart falls back to the default. */
export function mergeSettings(settings) {
  const src = settings && typeof settings === 'object' ? settings : {};
  const out = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (src[key] !== undefined && src[key] !== null) out[key] = src[key];
  }
  if (!Array.isArray(out.guardChart) || validateGuardChart(out.guardChart).length) {
    out.guardChart = DEFAULT_GUARD_CHART;
  }
  return out;
}

function cleanGuardRow(g) {
  const row = {
    id: cleanText(g.id, 20),
    label: {
      en: cleanText(g.label?.en ?? g.label ?? g.id, 30),
      ar: cleanText(g.label?.ar ?? g.label?.en ?? g.label ?? g.id, 30),
    },
    mm: round2(g.mm),
  };
  if (Number.isFinite(Number(g.minMm))) row.minMm = round2(g.minMm);
  if (Number.isFinite(Number(g.maxMm))) row.maxMm = round2(g.maxMm);
  return row;
}

/** Copy of the default guard chart that is safe to write. */
export function defaultGuardChart() {
  return DEFAULT_GUARD_CHART.map(cleanGuardRow);
}

/**
 * Validate and clean an owner's settings patch. Unknown keys are ignored.
 * Returns { value, errors } where errors are short field names.
 */
export function sanitizeSettingsPatch(patch) {
  const value = {};
  const errors = [];
  const src = patch && typeof patch === 'object' ? patch : {};
  for (const [key, raw] of Object.entries(src)) {
    if (raw === undefined) continue;
    switch (key) {
      case 'aiPreview':
      case 'tryAtHome':
        if (typeof raw !== 'boolean') errors.push(key);
        else value[key] = raw;
        break;
      case 'aiDailyCap':
      case 'retentionDays': {
        const [min, max] = SETTINGS_LIMITS[key];
        const n = clampInt(raw, min, max, null);
        if (n === null) errors.push(key);
        else value[key] = n;
        break;
      }
      case 'growthMmPerDay': {
        const n = numOrNull(raw);
        if (n === null) errors.push(key);
        else value[key] = round2(clamp(n, ...SETTINGS_LIMITS.growthMmPerDay));
        break;
      }
      case 'defaultLanguage':
        if (!LANGUAGES.includes(raw)) errors.push(key);
        else value[key] = raw;
        break;
      case 'whatsapp': {
        const p = normalizePhone(raw);
        if (!p.valid) errors.push(key);
        else value[key] = p.value || '';
        break;
      }
      case 'guardChart': {
        if (!Array.isArray(raw) || raw.length > 40) {
          errors.push(key);
          break;
        }
        const rows = raw.map((g) => (g && typeof g === 'object' ? cleanGuardRow(g) : null));
        if (rows.some((r) => !r) || validateGuardChart(rows).length) errors.push(key);
        else value[key] = rows;
        break;
      }
      default:
        break;
    }
  }
  return { value, errors };
}

// ---------------------------------------------------------------- audit diff

function auditValue(v) {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object' && !Array.isArray(v) && !isPlainObject(v)) {
    // Firestore Timestamp -> Date; FieldValue sentinels and other classes -> null.
    return typeof v.toDate === 'function' ? v.toDate() : null;
  }
  if (Array.isArray(v)) return v.map(auditValue);
  if (isPlainObject(v)) {
    const out = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = auditValue(x);
    return out;
  }
  return firestoreSafe(v);
}

function stableJson(v) {
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/**
 * { field: [before, after] } for every key of `after` whose value changed.
 * `prefix` is prepended to field names (for example 'settings.').
 * Values are plain data (Timestamps become Dates, sentinels become null).
 */
export function diffFields(before, after, prefix = '') {
  const b = before && typeof before === 'object' ? before : {};
  const a = after && typeof after === 'object' ? after : {};
  const out = {};
  for (const key of Object.keys(a)) {
    if (a[key] === undefined) continue;
    const bv = auditValue(b[key]);
    const av = auditValue(a[key]);
    if (stableJson(bv) !== stableJson(av)) out[`${prefix}${key}`] = [bv, av];
  }
  return out;
}

// ---------------------------------------------------------------- look params, cut card, profile

const LINE_KEYS = ['cheek', 'cheekOffset', 'neckline', 'necklineOffset', 'sideburn', 'edge', 'mustacheEdge'];

function scalar(v, maxLen = 80) {
  if (typeof v === 'string') return v.slice(0, maxLen);
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean' || v === null) return v;
  return undefined;
}

function zonesMap(src, maxMm = 300) {
  const out = {};
  if (!src || typeof src !== 'object') return out;
  for (const z of ZONE_KEYS) {
    const n = numOrNull(src[z]);
    if (n !== null) out[z] = round1(clamp(n, 0, maxMm));
  }
  return out;
}

/**
 * LookParams as stored in consultations and Look Codes: the designed beard only
 * (zones in mm, lines, mustache, fade, color, grey, finish, shape). Unknown nested
 * objects are dropped; extra top-level scalars are kept for forward compatibility.
 */
export function sanitizeParams(p) {
  if (!p || typeof p !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (['zones', 'lines', 'shape'].includes(k)) continue;
    const s = scalar(v);
    if (s !== undefined) out[k] = s;
  }
  out.zones = zonesMap(p.zones);
  if (p.lines && typeof p.lines === 'object') {
    const lines = {};
    for (const [k, v] of Object.entries(p.lines)) {
      const s = scalar(v, 40);
      if (s !== undefined) lines[k] = s;
    }
    for (const k of LINE_KEYS) if (!(k in lines)) lines[k] = null;
    out.lines = lines;
  }
  if (p.shape && typeof p.shape === 'object') out.shape = firestoreSafe(p.shape);
  for (const k of ['fadeStartMm', 'greyTarget']) {
    if (k in out) out[k] = numOrNull(out[k]);
  }
  return out;
}

function noteText(note) {
  if (typeof note === 'string') return note.slice(0, 200);
  if (note && typeof note === 'object' && typeof note.key === 'string') return note.key.slice(0, 200);
  return '';
}

function stringList(v, max = 20) {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === 'string' ? x : x && typeof x.key === 'string' ? x.key : null))
    .filter(Boolean)
    .slice(0, max)
    .map((x) => x.slice(0, 60));
}

function stringMap(v, maxLen = 200) {
  const out = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, x] of Object.entries(v)) {
    const s = noteText(x);
    if (s && ZONE_KEYS.includes(k)) out[k] = s.slice(0, maxLen);
  }
  return out;
}

/**
 * The stored Cut Card summary (PRD 10.2): { zonesMm, guards, cheekLineMm, necklineMm,
 * notes, safetyFlags }. Accepts the full card from buildCutCard() or an already
 * compact one.
 */
export function compactCutCard(card) {
  if (!card || typeof card !== 'object') return null;
  if (card.zonesMm && typeof card.zonesMm === 'object') {
    const guards = {};
    for (const [k, g] of Object.entries(card.guards || {})) {
      if (ZONE_KEYS.includes(k) && (typeof g === 'string' || typeof g === 'number')) guards[k] = String(g).slice(0, 20);
    }
    return {
      zonesMm: zonesMap(card.zonesMm),
      guards,
      cheekLineMm: numOrNull(card.cheekLineMm),
      necklineMm: numOrNull(card.necklineMm),
      notes: stringMap(card.notes),
      safetyFlags: stringList(card.safetyFlags),
    };
  }
  const zonesMm = {};
  const guards = {};
  const notes = {};
  for (const row of Array.isArray(card.rows) ? card.rows : []) {
    if (!row || !ZONE_KEYS.includes(row.zone)) continue;
    const mm = numOrNull(row.mm);
    if (mm !== null) zonesMm[row.zone] = round1(clamp(mm, 0, 300));
    const g = row.guard;
    if (g && typeof g === 'object') {
      const id = g.kind === 'guard' ? g.guardId : g.kind;
      if (id !== null && id !== undefined) guards[row.zone] = String(id).slice(0, 20);
    }
    const note = noteText(row.note);
    if (note) notes[row.zone] = note;
  }
  return {
    zonesMm,
    guards,
    cheekLineMm: numOrNull(card.cheekLine?.mmAboveJaw),
    necklineMm: numOrNull(card.neckline?.mmAboveAdamsApple),
    notes,
    safetyFlags: stringList(card.color?.safetyFlags ?? card.safetyFlags),
  };
}

/**
 * Client profile labels only (PRD 10.2): faceShape, mst, undertone, ageBand, growability.
 * Accepts toCoarseProfile() output or a FaceProfile; never keeps measures, Lab values or ratios.
 */
export function coarseLabels(src) {
  const c = src && typeof src === 'object' ? src : {};
  const faceShape = typeof c.faceShape === 'string' ? c.faceShape : c.faceShape?.top;
  const undertone = typeof c.undertone === 'string' ? c.undertone : c.skin?.undertone;
  const ageBand = typeof c.ageBand === 'string' ? c.ageBand : c.ageBand?.band;
  const mst = c.mst ?? c.skin?.mst;
  const growability = typeof c.growability === 'number' ? c.growability : c.beard?.growability;
  return {
    faceShape: FACE_SHAPES.includes(faceShape) ? faceShape : null,
    mst: clampInt(mst, 1, 10, null),
    undertone: UNDERTONES.includes(undertone) ? undertone : null,
    ageBand: AGE_BANDS.includes(ageBand) ? ageBand : null,
    growability: clampInt(growability, 0, 100, null),
  };
}

/** Zone lengths in mm (labels-free numbers only), for client visit records. */
export function zoneLengths(src) {
  return zonesMap(src, 300);
}

/**
 * Learned growth rate (mm per day) from the lengths left at the last visit and the
 * lengths measured at this visit. Median over zones, clamped to 0.1..1.5 mm/day and
 * blended 50/50 with the previous learned value. Returns `current` when it cannot learn.
 */
export function learnGrowthRate(previous, measuredMm, at, current = null) {
  if (!previous || !previous.zonesMm || !measuredMm) return current;
  const days = (toDate(at).getTime() - toDate(previous.at).getTime()) / DAY_MS;
  if (!Number.isFinite(days) || days < 3 || days > 120) return current;
  const rates = [];
  for (const z of ZONE_KEYS) {
    const before = numOrNull(previous.zonesMm[z]);
    const now = numOrNull(measuredMm[z]);
    if (before === null || now === null || now <= before) continue;
    rates.push((now - before) / days);
  }
  const m = median(rates);
  if (m === null) return current;
  const learned = clamp(m, 0.1, 1.5);
  const prev = numOrNull(current);
  return round2(prev === null ? learned : (prev + learned) / 2);
}

// ---------------------------------------------------------------- products

/**
 * Validate a product (owner entry or CSV row). Prices only ever come from here:
 * OMR, rounded to 3 decimals. `partial` validates only the keys present (updates).
 */
export function normalizeProduct(p, { partial = false } = {}) {
  const src = p && typeof p === 'object' ? p : {};
  const value = {};
  const errors = [];
  const has = (k) => src[k] !== undefined;
  if (!partial || has('name')) {
    const name = cleanText(src.name, 100);
    if (!name) errors.push('name');
    else value.name = name;
  }
  if (!partial || has('nameAr')) value.nameAr = cleanText(src.nameAr, 100);
  if (!partial || has('category')) {
    const cat = String(src.category ?? '').trim().toLowerCase();
    if (!PRODUCT_CATEGORIES.includes(cat)) errors.push('category');
    else value.category = cat;
  }
  if (!partial || has('priceOmr')) {
    let raw = src.priceOmr;
    if (typeof raw === 'string') {
      // "1.500", "1.500 OMR", "١٫٥٠٠ ر.ع." -> 1.5. A comma is ambiguous (thousands or decimal), so it is rejected.
      raw = raw
        .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
        .replace(/٫/g, '.')
        .replace(/\s/g, '');
      const m = raw.includes(',') ? null : /^[^\d.]*(\d*\.?\d+)[^\d]*$/.exec(raw);
      raw = m ? m[1] : null;
    }
    const n = numOrNull(raw);
    if (n === null || n < 0 || n > 100000) errors.push('priceOmr');
    else value.priceOmr = roundOmr(n);
  }
  if (!partial || has('active')) {
    const a = src.active;
    value.active = a === undefined || a === null || a === '' ? true : a === true || a === 'true' || a === 1 || a === '1';
  }
  return { value, errors };
}

/** Same product (for CSV re-imports): same normalized name and category. */
export function productKey(p) {
  return `${p?.category || ''}|${searchKey(p?.name)}`;
}

// ---------------------------------------------------------------- styles

const STYLE_RESERVED = ['createdAt', 'createdBy', 'updatedAt', 'updatedBy'];

/** Style document data from a catalog style (styles.json shape), safe to write. */
export function styleData(style) {
  const out = {};
  for (const [k, v] of Object.entries(style || {})) {
    if (STYLE_RESERVED.includes(k) || v === undefined) continue;
    out[k] = firestoreSafe(v);
  }
  out.id = String(style.id);
  out.hidden = style.hidden === true;
  out.signature = style.signature === true;
  out.order = numOrNull(style.order) ?? 0;
  return out;
}

/** Owner/manager edit of a style: reserved keys and identity cannot change. */
export function sanitizeStylePatch(patch) {
  const out = {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (v === undefined || STYLE_RESERVED.includes(k) || k === 'id' || k === 'signature' || k === 'baseId') continue;
    if (k === 'hidden') out.hidden = v === true;
    else if (k === 'localFit') out.localFit = clampInt(v, 0, 5, 0);
    else if (k === 'order') out.order = numOrNull(v) ?? 0;
    else out[k] = firestoreSafe(v);
  }
  return out;
}

export function sortStyles(list) {
  return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.id).localeCompare(String(b.id)));
}

/** URL-safe slug for signature style ids. */
export function slug(value) {
  return (
    String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'style'
  );
}
