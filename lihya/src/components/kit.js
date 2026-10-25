// Shared helpers for the UI kit (src/components). Pure functions plus two small
// contexts and an i18n hook that also works outside <I18nProvider> (PDF nodes,
// static markup), so pure-SVG components can be rendered anywhere.

import { createContext, useContext, useMemo } from 'react';
import { useT, translate, pickLang } from '../lib/i18n/useT.js';
import { APP, LIMITS } from '../config/app.js';

/** Join class names, skipping falsy values. */
export function cx(...parts) {
  let out = '';
  for (const p of parts) {
    if (!p) continue;
    out = out ? `${out} ${p}` : String(p);
  }
  return out;
}

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/** Number of decimals a step implies (0.5 -> 1, 0.25 -> 2, 1 -> 0). */
export function stepDecimals(step) {
  const s = String(step);
  if (s.includes('e-')) return Number(s.split('e-')[1]) || 0;
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/** Snap a value to the step grid that starts at min, clamped to [min, max], without float drift. */
export function snapToStep(value, min, max, step = 1) {
  const v = Number(value);
  if (!Number.isFinite(v)) return min;
  const st = step > 0 ? step : 1;
  const n = Math.round((clamp(v, min, max) - min) / st);
  const d = Math.max(stepDecimals(st), stepDecimals(min));
  const snapped = Number((min + n * st).toFixed(d));
  return clamp(snapped, min, max);
}

/** Track position (0..1, start side to end side) to a snapped value. */
export function ratioToValue(ratio, min, max, step = 1) {
  const r = clamp(Number(ratio) || 0, 0, 1);
  return snapToStep(min + r * (max - min), min, max, step);
}

/** Value to track position 0..1. */
export function valueToRatio(value, min, max) {
  if (!(max > min)) return 0;
  return clamp((Number(value) - min) / (max - min), 0, 1);
}

/**
 * Clean a typed or pasted code: uppercase, characters outside the alphabet removed.
 * @returns {{ value: string, rejected: string[] }} rejected = distinct characters that were dropped
 */
export function sanitizeCode(input, alphabet = LIMITS.lookCodeAlphabet, length = LIMITS.lookCodeLength) {
  const allowed = new Set(String(alphabet).toUpperCase());
  const rejected = [];
  let value = '';
  for (const raw of String(input ?? '')) {
    const ch = raw.toUpperCase();
    if (/\s/.test(ch) || ch === '-') continue;
    if (allowed.has(ch)) {
      if (value.length < length) value += ch;
    } else if (!rejected.includes(ch)) {
      rejected.push(ch);
    }
  }
  return { value, rejected };
}

/**
 * Grid layout for the on-screen code keypad: the alphabet keys in `cols` columns,
 * then the action keys sharing the remaining slots of the last row (or a new row).
 * @returns {{ cols, actions: { paste: number, backspace: number } }} spans per action key (0 = hidden)
 */
export function keypadLayout(count, { cols = 6, paste = true } = {}) {
  const rem = (cols - (count % cols)) % cols;
  if (!paste) return { cols, actions: { paste: 0, backspace: rem >= 1 ? rem : cols } };
  if (rem >= 2) {
    const p = Math.floor(rem / 2);
    return { cols, actions: { paste: p, backspace: rem - p } };
  }
  // 0 or 1 free slots: put both actions on a new full row (one free slot stays empty).
  const half = Math.floor(cols / 2);
  return { cols, actions: { paste: half, backspace: cols - half } };
}

// Icons in public/icons/sprite.svg. Directional ones mirror in RTL.
export const ICON_NAMES = Object.freeze([
  'camera', 'face', 'profile', 'scissors', 'razor', 'guard', 'ruler', 'timeline', 'compare', 'share', 'print',
  'whatsapp', 'lock', 'cloud', 'globe', 'settings', 'user', 'users', 'plus', 'minus', 'undo', 'check', 'close',
  'chevron-left', 'chevron-right', 'chevron-down', 'chevron-up', 'arrow-left', 'arrow-right', 'home', 'dashboard',
  'catalog', 'box', 'report', 'download', 'upload', 'search', 'eye', 'warning', 'info', 'sun', 'moon', 'logout',
  'mail', 'google', 'qr', 'flash', 'mirror', 'palette', 'drop', 'clock', 'calendar', 'trash', 'edit', 'copy',
  'link', 'wifi-off', 'phone', 'refresh', 'grid', 'list', 'keypad', 'hand', 'bulb', 'star-line', 'dot',
  'backspace', 'filter', 'beard', 'mustache', 'logo',
]);

export const MIRRORED_ICONS = Object.freeze(['chevron-left', 'chevron-right', 'arrow-left', 'arrow-right', 'undo', 'logout', 'backspace']);

export function isMirroredIcon(name) {
  return MIRRORED_ICONS.includes(name);
}

/** Set by ScreenFrame's footer so BottomAction does not add a second safe-area padding. */
export const FooterContext = createContext(false);

/** Set by OwnerShell: { nav, setFramed } so a ScreenFrame inside it renders the phone tabs under its top bar. */
export const ShellContext = createContext(null);

const noop = () => {};

/**
 * Like useT(), but never throws: outside <I18nProvider> (or when `langProp` is given and differs)
 * it returns a stand-alone translator for that language. Used by pure-SVG components that may
 * be rendered into PDFs or static markup.
 */
export function useOptionalT(langProp) {
  let ctx = null;
  try {
    // useT() reads the context first and only then throws when there is no provider, so it runs
    // unconditionally on every render and the hook order never changes.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    ctx = useT();
  } catch {
    ctx = null;
  }
  const lang = langProp === 'ar' || langProp === 'en' ? langProp : ctx?.lang || APP.defaultLanguage;
  const useCtx = Boolean(ctx) && ctx.lang === lang;
  const fallback = useMemo(
    () => ({
      lang,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      isRTL: lang === 'ar',
      t: (key, vars) => translate(lang, key, vars),
      pick: (obj, enKey, arKey) => pickLang(lang, obj, enKey, arKey),
      setLang: noop,
      toggleLang: noop,
    }),
    [lang],
  );
  return useCtx ? ctx : fallback;
}

/** Context read helper that tolerates a missing provider. */
export function useFooterContext() {
  return useContext(FooterContext);
}

/** Respect the user's reduced-motion setting (checked at call time). */
export function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
