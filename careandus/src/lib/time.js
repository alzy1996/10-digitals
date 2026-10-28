// Every day boundary and report uses Asia/Muscat (UTC+4, no DST).
const TZ = 'Asia/Muscat';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });

export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'number' || typeof value === 'string') return new Date(value);
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
}

/** Muscat calendar date "YYYY-MM-DD". */
export function dayKey(date = new Date()) {
  return dayFmt.format(toDate(date));
}

/** UTC Date at 00:00 Muscat of the given dayKey. */
export function muscatMidnight(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - 4 * 3600 * 1000);
}

/** [start, end) of a Muscat day as Dates. */
export function muscatDayRange(key) {
  const start = muscatMidnight(key);
  return [start, new Date(start.getTime() + 24 * 3600 * 1000)];
}

export function addDaysKey(key, days) {
  const start = muscatMidnight(key);
  return dayKey(new Date(start.getTime() + days * 24 * 3600 * 1000 + 3600 * 1000));
}

export function lastNDayKeys(n, from = new Date()) {
  const today = dayKey(from);
  const keys = [];
  for (let i = n - 1; i >= 0; i -= 1) keys.push(addDaysKey(today, -i));
  return keys;
}

export function formatTime(value, lang = 'ar') {
  const d = toDate(value);
  if (!d) return '';
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatDate(value, lang = 'ar') {
  const d = toDate(value);
  if (!d) return '';
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function formatDateTime(value, lang = 'ar') {
  return `${formatDate(value, lang)} · ${formatTime(value, lang)}`;
}

/** Next 04:00 Muscat (= 00:00 UTC), when the Workers AI free allocation resets. */
export function nextAiReset(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return d;
}

/** ISO string with the +04:00 Muscat offset, for example 2026-10-25T09:12:00+04:00 (LIHYA profile stamps). */
export function muscatIso(date = new Date()) {
  const t = new Date(toDate(date).getTime() + 4 * 3600 * 1000);
  return `${t.toISOString().slice(0, 19)}+04:00`;
}
