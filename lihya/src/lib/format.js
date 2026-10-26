import { APP } from '../config/app.js';

const LATN = { ar: 'ar-OM-u-nu-latn', en: 'en-GB' };

/** OMR with exactly 3 decimals, for example "1.500 OMR" or "1.500 ر.ع.". */
export function formatOmr(value, lang = 'ar') {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const s = n.toFixed(APP.currencyDecimals);
  return lang === 'ar' ? `${s} ر.ع.` : `${s} OMR`;
}

/** Round to 3 decimals without float drift. */
export function roundOmr(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

export function formatNumber(value, lang = 'ar', options = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return new Intl.NumberFormat(LATN[lang] || LATN.en, options).format(n);
}

/** Millimetres: integers stay integers, others keep one decimal. */
export function formatMm(mm, lang = 'ar') {
  const n = Number(mm);
  if (!Number.isFinite(n)) return '';
  const v = Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1);
  return lang === 'ar' ? `${v} مم` : `${v} mm`;
}

/**
 * Whole percent with the Latin sign in both languages ("64%"): digits stay Latin in Arabic, so one
 * sign everywhere keeps chips, rings, sliders and sentences alike. The language argument stays in
 * the signature so every caller keeps passing it.
 */
export function formatPercent(value, _lang = 'ar') {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return '';
  return `${n}%`;
}

/** Oman mobile/landline: +968 and 8 digits. Returns the normalized "+968XXXXXXXX" or null. */
export function normalizeOmanPhone(raw) {
  if (raw == null) return null;
  const digits = String(raw)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[^\d+]/g, '');
  let rest = digits;
  if (rest.startsWith('+968')) rest = rest.slice(4);
  else if (rest.startsWith('00968')) rest = rest.slice(5);
  else if (rest.startsWith('968') && rest.length === 11) rest = rest.slice(3);
  if (!/^\d{8}$/.test(rest)) return null;
  return `+968${rest}`;
}

/** wa.me link. `phone` optional (opens the chooser when missing). */
export function waLink(text, phone) {
  const p = phone ? String(phone).replace(/[^\d]/g, '') : '';
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}
