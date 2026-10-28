// Every day boundary and report uses Asia/Muscat (UTC+4, no daylight saving).
// Never use the UTC date for a dayKey.

export const TZ = 'Asia/Muscat';
const MUSCAT_OFFSET_MS = 4 * 60 * 60 * 1000;

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 'YYYY-MM-DD' for the Muscat calendar day that contains `date`. */
export function dayKey(date = new Date()) {
  return dayKeyFmt.format(toDate(date));
}

/** Accepts Date, epoch ms, ISO string or a Firestore Timestamp. */
export function toDate(value) {
  if (value instanceof Date) return value;
  if (value && typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'number' || typeof value === 'string') return new Date(value);
  if (value && typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return new Date(NaN);
}

/** [start, end) of a Muscat day as real instants. */
export function muscatDayRange(key) {
  const [y, m, d] = parseKey(key);
  const start = new Date(Date.UTC(y, m - 1, d) - MUSCAT_OFFSET_MS);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Shift a dayKey by whole days (calendar math, no DST in Muscat). */
export function addDaysToKey(key, days) {
  const [y, m, d] = parseKey(key);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** The last `n` Muscat day keys ending with the day of `from`, oldest first. */
export function lastNDayKeys(n, from = new Date()) {
  const today = dayKey(from);
  const keys = [];
  for (let i = n - 1; i >= 0; i -= 1) keys.push(addDaysToKey(today, -i));
  return keys;
}

/** Every dayKey from `startKey` to `endKey` inclusive. */
export function dayKeysBetween(startKey, endKey) {
  const keys = [];
  let k = startKey;
  let guard = 0;
  while (k <= endKey && guard < 3660) {
    keys.push(k);
    k = addDaysToKey(k, 1);
    guard += 1;
  }
  return keys;
}

/** ISO string with the +04:00 Muscat offset, for example 2026-10-25T09:12:00+04:00. */
export function muscatIso(date = new Date()) {
  const t = new Date(toDate(date).getTime() + MUSCAT_OFFSET_MS);
  return `${t.toISOString().slice(0, 19)}+04:00`;
}

/** Whole days between two instants (b - a), rounded down. */
export function daysBetween(a, b) {
  return Math.floor((toDate(b).getTime() - toDate(a).getTime()) / (24 * 60 * 60 * 1000));
}

/** Localised date/time in Muscat. Digits stay Latin in Arabic so measurements read the same. */
export function formatMuscat(date, lang = 'ar', options = { dateStyle: 'medium', timeStyle: 'short' }) {
  const locale = lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB';
  return new Intl.DateTimeFormat(locale, { timeZone: TZ, ...options }).format(toDate(date));
}

export function formatDayKey(key, lang = 'ar') {
  const { start } = muscatDayRange(key);
  return formatMuscat(start, lang, { dateStyle: 'medium' });
}

function parseKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
  if (!m) throw new Error(`Invalid dayKey: ${key}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
