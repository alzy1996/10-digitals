// Small pure helpers for the owner screens (dashboard, settings, reports).
// Day math always goes through src/lib/time.js (Asia/Muscat).

import { PREF_KEYS } from '../../config/app.js';
import { addDaysToKey, dayKey, dayKeysBetween, formatMuscat, muscatDayRange } from '../../lib/time.js';

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** KPI targets from PRD section 1. */
export const TARGETS = Object.freeze({ decisionSeconds: 90, conversionPct: 80 });

/** Longest custom report range (keeps reads well inside the free tier). */
export const MAX_RANGE_DAYS = 92;

export const isNum = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

/** Decision time as words: "45 s", "1 min 12 s", "2 min" (Latin digits). Empty for no value. */
export function formatDecision(seconds, t) {
  if (!isNum(seconds) || Number(seconds) < 0) return '';
  const s = Math.round(Number(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return t('owner.dur.s', { s: r });
  if (r === 0) return t('owner.dur.m', { m });
  return t('owner.dur.ms', { m, s: r });
}

/** One decimal, Latin digits ("4.5"). */
export function oneDecimal(v) {
  if (!isNum(v)) return '';
  return (Math.round(Number(v) * 10) / 10).toFixed(1);
}

/** Short weekday + day of month for a dayKey ("Sun 25" / "الأحد 25"). */
export function shortDay(key, lang) {
  const { start } = muscatDayRange(key);
  return formatMuscat(start, lang, { weekday: 'short', day: 'numeric' });
}

/** Weekday name only ("Sun" / "الأحد"). */
export function weekdayName(key, lang) {
  const { start } = muscatDayRange(key);
  return formatMuscat(start, lang, { weekday: 'short' });
}

/** Long date for headings ("Sunday 25 October 2026"). */
export function longDay(key, lang) {
  const { start } = muscatDayRange(key);
  return formatMuscat(start, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Date for summaries ("25 October 2026" / "25 أكتوبر 2026"). */
export function mediumDay(key, lang) {
  const { start } = muscatDayRange(key);
  return formatMuscat(start, lang, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Muscat time of a timestamp ("09:45"). */
export function clockTime(value, lang) {
  try {
    return formatMuscat(value, lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  } catch {
    return '';
  }
}

/** Report range for a preset ('today' | 'yesterday' | 'week' | 'month' | 'custom'). */
export function rangeFor(preset, today, custom = {}) {
  switch (preset) {
    case 'yesterday': {
      const k = addDaysToKey(today, -1);
      return { start: k, end: k };
    }
    case 'week':
      return { start: addDaysToKey(today, -6), end: today };
    case 'month':
      return { start: `${today.slice(0, 8)}01`, end: today };
    case 'custom':
      return { start: custom.start || today, end: custom.end || today };
    case 'today':
    default:
      return { start: today, end: today };
  }
}

/** Problems with a custom range: null when fine, else an i18n key. */
export function rangeError(start, end, today) {
  if (!DAY_RE.test(String(start || '')) || !DAY_RE.test(String(end || ''))) return 'owner.rep.range.invalid';
  if (start > end) return 'owner.rep.range.order';
  if (end > today) return 'owner.rep.range.future';
  if (dayKeysBetween(start, end).length > MAX_RANGE_DAYS) return 'owner.rep.range.tooLong';
  return null;
}

/** The last n Muscat day keys ending today, oldest first. */
export function lastDays(n, today) {
  const keys = [];
  for (let i = n - 1; i >= 0; i -= 1) keys.push(addDaysToKey(today, -i));
  return keys;
}

// ------------------------------------------------------------------ per-device markers

// Housekeeping marker next to the other per-device preferences (not business data).
const PURGE_PREFIX = `${PREF_KEYS.purgeDay}.`;

/** True when this device has not run the retention purge for this shop today (Muscat). */
export function purgeDue(shopId, today = dayKey()) {
  try {
    return localStorage.getItem(PURGE_PREFIX + shopId) !== today;
  } catch {
    return true;
  }
}

export function markPurged(shopId, today = dayKey()) {
  try {
    localStorage.setItem(PURGE_PREFIX + shopId, today);
  } catch {
    // private mode: the purge simply runs again next time
  }
}

// ------------------------------------------------------------------ theme (device preference)

export function currentTheme() {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/** Apply and remember the theme on this device only (never business data). */
export function applyTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  const el = document.documentElement;
  el.dataset.theme = next;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', next === 'light' ? '#F6F3EE' : '#0F1012');
  try {
    localStorage.setItem(PREF_KEYS.theme, next);
  } catch {
    // private mode: the theme holds until the page is closed
  }
  return next;
}

// ------------------------------------------------------------------ AI Worker

/** VITE_AI_WORKER_URL without a trailing slash ('' when not configured). */
export function workerUrl() {
  const env = typeof import.meta !== 'undefined' ? import.meta.env : null;
  const raw = env && env.VITE_AI_WORKER_URL ? String(env.VITE_AI_WORKER_URL).trim() : '';
  return raw.replace(/\/+$/, '');
}

// ------------------------------------------------------------------ one-shot reads from watchers

/**
 * First answer of a service watcher as a Promise: waits for server data (not only the
 * offline cache) up to `waitMs`, then settles with whatever the cache had.
 */
export function firstValue(subscribe, waitMs = 5000) {
  return new Promise((resolve, reject) => {
    let done = false;
    let unsub = null;
    let cached;
    let timer = null;
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (typeof unsub === 'function') {
        const u = unsub;
        unsub = null;
        setTimeout(u, 0);
      }
      fn(value);
    };
    try {
      unsub = subscribe(
        (data, meta) => {
          if (meta && meta.fromCache) cached = data;
          else finish(resolve, data);
        },
        (err) => finish(reject, err),
      );
    } catch (err) {
      finish(reject, err);
      return;
    }
    if (done && typeof unsub === 'function') {
      unsub();
      return;
    }
    timer = setTimeout(() => {
      if (cached !== undefined) finish(resolve, cached);
      else finish(reject, Object.assign(new Error('timeout'), { code: 'unavailable' }));
    }, waitMs);
  });
}
