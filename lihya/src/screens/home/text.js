// Small text helpers for the Try at home screens (S21, S22).

import { getStyle } from '../../lib/look.js';
import { formatMuscat } from '../../lib/time.js';
import { pickLang } from '../../lib/i18n/useT.js';

/** Shop name in the UI language (main) and in the other language when the shop has both. */
export function shopNames(info, lang) {
  const en = info && typeof info.name === 'string' ? info.name.trim() : '';
  const ar = info && typeof info.nameAr === 'string' ? info.nameAr.trim() : '';
  const main = lang === 'ar' ? ar || en : en || ar;
  const otherRaw = lang === 'ar' ? en : ar;
  const other = otherRaw && otherRaw !== main ? otherRaw : '';
  return { main, other, otherLang: lang === 'ar' ? 'en' : 'ar' };
}

/** The shop's own style (signature styles too), else the seed catalog style, else null. */
export function findStyle(styles, styleId) {
  if (!styleId) return null;
  const own = Array.isArray(styles) ? styles.find((s) => s && s.id === styleId) : null;
  return own || getStyle(styleId) || null;
}

/** Style name in the UI language and in the other one. */
export function styleNames(style, lang) {
  if (!style || !style.name) return { main: '', other: '' };
  const main = pickLang(lang, style.name);
  const other = pickLang(lang === 'ar' ? 'en' : 'ar', style.name);
  return { main, other: other && other !== main ? other : '' };
}

/** Long Muscat date with Latin digits, for example "24 November 2026" / "24 نوفمبر 2026". */
export function longDate(ms, lang) {
  if (!Number.isFinite(ms)) return '';
  return formatMuscat(new Date(ms), lang, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Characters separated by spaces so screen readers spell the code letter by letter. */
export function spelled(code) {
  return String(code || '')
    .split('')
    .join(' ');
}
