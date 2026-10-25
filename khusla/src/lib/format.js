import { DEFAULTS } from '../config/app.js';

export function formatOmr(value, lang = 'ar') {
  const n = Number(value || 0).toFixed(DEFAULTS.currencyDecimals);
  return lang === 'ar' ? `${n} ر.ع.` : `OMR ${n}`;
}

export function round1(n) {
  return Math.round(n * 10) / 10;
}

/** Lengths are shown rounded to 0.5 cm. */
export function roundHalf(n) {
  return Math.round(n * 2) / 2;
}

export function formatCm(n, lang = 'ar') {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const v = roundHalf(n);
  const s = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return lang === 'ar' ? `${s} سم` : `${s} cm`;
}

export function formatPct(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${Math.round(n)}%`;
}

export function formatDuration(seconds, lang = 'ar') {
  if (!seconds && seconds !== 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return lang === 'ar' ? `${m} د ${s} ث` : `${m}m ${s}s`;
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
