// Pure helpers for the nail screens (no React, no Firestore): shade lists, sold-out substitutes,
// design names for display, the polish CSV, WhatsApp text. Unit-tested in tests/unit/nails-lib.test.js.
import { LIBRARY } from '../../data/nails/library.js';
import { FAMILIES, FINGERS, SHAPES, LENGTHS } from '../../data/nails/taxonomy.js';
import { hexToLab, deltaE2000, isHex } from '../../ai/nails/index.js';
import { parseCsv, toObjects, parseBool } from '../../reports/csv.js';
import { NAIL_FINISHES, NAIL_TYPES } from '../../services/schema.js';

const HEX = /^#[0-9A-Fa-f]{6}$/;
// The reference library without Nail Mirror's brand label: brands and prices come only from the salon's list.
export const LIB = LIBRARY.map((p) => ({ ...p, brand: '' }));
const FAMILY_KEYS = new Set(FAMILIES.map((f) => f.key));

let libLabs = null;
/** Colour family of any hex: the family of the closest library shade (CIEDE2000). */
export function familyOf(hex) {
  if (!isHex(hex)) return null;
  if (!libLabs) libLabs = LIB.map((p) => [p.family, hexToLab(p.hex)]);
  const lab = hexToLab(hex);
  let best = null;
  let bestD = Infinity;
  for (const [family, l] of libLabs) {
    const d = deltaE2000(lab, l);
    if (d < bestD) {
      bestD = d;
      best = family;
    }
  }
  return best;
}

export function inStock(p) {
  return typeof p.stock !== 'number' || p.stock > 0;
}

/** A salon polish document as a shade the studio and the recommender understand. */
export function polishToShade(p) {
  return {
    ...p,
    family: FAMILY_KEYS.has(p.family) ? p.family : familyOf(p.hex),
    finish: NAIL_FINISHES.includes(p.finish) ? p.finish : 'creme',
    type: NAIL_TYPES.includes(p.type) ? p.type : 'gel',
    price: typeof p.priceOmr === 'number' ? p.priceOmr : null,
    salon: true,
  };
}

/**
 * The shades a client can try. The salon's own bottles (active, with a colour) come first;
 * the reference library follows when includeLibrary is on (always when the salon has none yet).
 * hidden polishes stay out unless includeHidden (staff in the chair still see them).
 */
export function buildShades(polishes = [], { includeLibrary = true, includeHidden = true } = {}) {
  const inventory = polishes
    .filter((p) => p && p.active !== false && HEX.test(p.hex || '') && (includeHidden || p.hidden !== true))
    .map(polishToShade);
  const hasInventory = inventory.length > 0;
  const library = includeLibrary || !hasInventory ? LIB : [];
  const shades = [...inventory, ...library];
  const byId = new Map();
  for (const p of [...LIB, ...inventory]) byId.set(p.id, p);
  return { shades, inventory, library: LIB, hasInventory, byId };
}

/** Sold out: the closest bottle that IS on the shelf (CIEDE2000, +4 for a different finish). */
export function findSubstitute(polish, inventory = []) {
  if (!polish || inStock(polish) || !isHex(polish.hex)) return null;
  const lab = hexToLab(polish.hex);
  let best = null;
  let bestD = Infinity;
  for (const q of inventory) {
    if (q.id === polish.id || !inStock(q) || !isHex(q.hex)) continue;
    const d = deltaE2000(lab, hexToLab(q.hex)) + (q.finish === polish.finish ? 0 : 4);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best ? { from: polish, to: best, d: Math.round(bestD * 10) / 10 } : null;
}

/** Stored designs carry ids and colours only: add names / brand / code back from the catalog for display. */
export function hydrateDesign(design, byId) {
  if (!design?.base) return design;
  const fill = (p) => {
    if (!p) return p;
    const src = p.polishId && byId?.get ? byId.get(p.polishId) : null;
    return { name: '', nameAr: '', brand: '', code: '', ...p, ...(src ? { name: src.name || '', nameAr: src.nameAr || '', brand: src.brand || '', code: src.code || '' } : {}) };
  };
  const perFinger = {};
  for (const [k, v] of Object.entries(design.perFinger || {})) perFinger[k] = fill(v);
  return { ...design, base: fill(design.base), perFinger };
}

/** Prices of the polishes used in a design (salon bottles only; the library has none). */
export function designPolishes(design, byId) {
  const ids = new Set([design?.base?.polishId, ...Object.values(design?.perFinger || {}).map((p) => p?.polishId)].filter(Boolean));
  return [...ids].map((id) => byId?.get?.(id)).filter((p) => p && p.salon);
}

/** Every finger with its paint (the base where no accent is set), for cards and summaries. */
export function fingerPaints(design) {
  return FINGERS.map((f) => ({ key: f.key, paint: design?.perFinger?.[f.key] || design?.base || null }));
}

export function lengthKey(value) {
  let best = LENGTHS[0];
  for (const l of LENGTHS) if (Math.abs(l.value - (value || 0)) < Math.abs(best.value - (value || 0))) best = l;
  return best.key;
}

/** Shape changes enforce the shape's minimum length (an almond needs some free edge). */
export function applyShape(design, shapeKey) {
  const sh = SHAPES.find((s) => s.key === shapeKey);
  if (!sh) return design;
  return { ...design, shape: sh.key, length: Math.max(design.length || 0, sh.minLen) };
}

/** Suggested weeks until the next visit by product type. */
export function nextVisitWeeksFor(type) {
  return { lacquer: 1, breathable: 1, presson: 2, gel: 3, dip: 3, biab: 4, acrylic: 3 }[type] || 3;
}

// ---------------------------------------------------------------- polish CSV
export const POLISH_CSV_COLUMNS = ['name', 'nameAr', 'brand', 'code', 'hex', 'finish', 'type', 'stock', 'priceOmr', 'hidden'];
export const POLISH_CSV_TEMPLATE = [
  POLISH_CSV_COLUMNS.join(','),
  'Classic Red,أحمر كلاسيكي,OPI,NL-R01,#B5121B,creme,gel,6,8.5,no',
  'Milk Bath,حمام حليب,,M01,#F3E4E0,milky,gel,,7,no',
].join('\n');

export function polishTemplateHref() {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(`\ufeff${POLISH_CSV_TEMPLATE}\n`)}`;
}

/** polishes CSV: name,nameAr,brand,code,hex,finish,type,stock,priceOmr,hidden (CsvImport result shape). */
export function validatePolishesCsv(text) {
  const { header, records } = toObjects(parseCsv(text));
  const missing = ['name', 'nameAr', 'hex', 'finish'].filter((h) => !header.includes(h));
  if (missing.length) return { error: 'header', missing, valid: [], invalid: [] };
  const valid = [];
  const invalid = [];
  for (const r of records) {
    const reasons = [];
    const name = (r.name || '').slice(0, 80);
    const nameAr = (r.nameAr || '').slice(0, 80);
    if (!name && !nameAr) reasons.push('csv.err.name');
    let hex = (r.hex || '').trim();
    if (hex && !hex.startsWith('#')) hex = `#${hex}`;
    if (!HEX.test(hex)) reasons.push('nails.csv_err_hex');
    const finish = (r.finish || 'creme').toLowerCase();
    if (!NAIL_FINISHES.includes(finish)) reasons.push('nails.csv_err_finish');
    const type = (r.type || '').toLowerCase();
    if (type && !NAIL_TYPES.includes(type)) reasons.push('nails.csv_err_type');
    let stock = null;
    if (r.stock) {
      stock = Number(r.stock);
      if (!Number.isInteger(stock) || stock < 0 || stock > 100000) reasons.push('nails.csv_err_stock');
    }
    let priceOmr = null;
    if (r.priceOmr) {
      const ps = r.priceOmr.replace(/[^\d.,-]/g, '').replace(',', '.');
      priceOmr = Number(ps);
      if (!Number.isFinite(priceOmr) || priceOmr < 0 || priceOmr > 10000) reasons.push('csv.err.price');
      else if (!/^\d+(\.\d{1,3})?$/.test(ps)) reasons.push('csv.err.decimals');
    }
    const hidden = parseBool(r.hidden, false);
    if (hidden === null) reasons.push('nails.csv_err_hidden');
    const brandCode = `${r.brand || ''}${r.code || ''}`;
    if (`${name}${nameAr}${brandCode}`.length > 260) reasons.push('csv.err.name');
    if (reasons.length) invalid.push({ line: r._line, row: r, reasons });
    else
      valid.push({
        name,
        nameAr,
        brand: (r.brand || '').slice(0, 60),
        code: (r.code || '').slice(0, 40),
        hex: hex.toUpperCase(),
        finish,
        type: type || 'gel',
        stock,
        priceOmr: priceOmr === null ? null : Math.round(priceOmr * 1000) / 1000,
        active: true,
        hidden,
      });
  }
  return { valid, invalid };
}

// ---------------------------------------------------------------- WhatsApp
/** wa.me needs digits only; an Oman number may be stored as +968XXXXXXXX. */
export function waDigits(phone) {
  return String(phone || '').replace(/[^\d]/g, '');
}
