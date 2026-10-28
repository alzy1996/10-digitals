// Small text helpers shared by the Cut Card, the daily report and the share texts.
// Arabic counted nouns follow the dual and plural rules (1, 2, 3-10, 11+); digits stay Latin.

import { translate } from '../lib/i18n.js';

function countKey(n) {
  if (n === 0) return 'zero';
  if (n === 1) return 'one';
  if (n === 2) return 'two';
  if (n >= 3 && n <= 10) return 'few';
  return 'many';
}

/** "in 14 days" / "بعد 14 يومًا". */
export function daysPhrase(lang, days) {
  const n = Math.max(0, Math.round(Number(days) || 0));
  return translate(lang, `report.days.${countKey(n)}`, { n });
}

/** "Trim every 4 days" / "تشذيب كل 4 أيام". */
export function trimPhrase(lang, days) {
  const n = Math.max(1, Math.round(Number(days) || 1));
  return translate(lang, `report.trim.${countKey(n)}`, { n });
}

/** Seconds as m:ss (Latin digits), for decision times. */
export function formatDuration(seconds) {
  const n = Number(seconds);
  if (seconds === null || seconds === undefined || !Number.isFinite(n) || n < 0) return '';
  const s = Math.round(n);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

const RTL_CHAR = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/;
const LTR_CHAR = /[A-Za-z\u00C0-\u024F]/;

/**
 * Direction of a piece of text from its first strong letter ('rtl' for Arabic,
 * 'ltr' for Latin, undefined when it has none). Names typed by staff can be in
 * either script; html2canvas draws each run with its element's direction, so a
 * name in the other script needs its own dir to keep brackets and order right.
 */
export function textDir(text) {
  const s = String(text ?? '');
  for (const ch of s) {
    if (RTL_CHAR.test(ch)) return 'rtl';
    if (LTR_CHAR.test(ch)) return 'ltr';
  }
  return undefined;
}
