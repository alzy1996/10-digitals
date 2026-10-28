// Beard strings live in the shared dictionaries under "beard." (scripts/i18n/beard.mjs).
// LIHYA's screens, AI and reports pass keys without the prefix ("capture.title", or keys
// that come from the AI such as "ai.step.face"), so every lookup here adds it once.
import { useMemo } from 'react';
import { translate as sharedTranslate, useT as useSharedT } from '../../../lib/i18n/useT.js';
import { APP } from './config.js';

const PREFIX = 'beard.';

export function beardKey(key) {
  const k = String(key ?? '');
  return k.startsWith(PREFIX) ? k : PREFIX + k;
}

/** Interpolate {name} placeholders (missing values stay as written). */
export function format(str, vars) {
  if (!vars) return str;
  return String(str).replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
}

/** Translate outside React (reports, PDFs). Falls back to English, then the key. */
export function translate(lang, key, vars) {
  const full = beardKey(key);
  const s = sharedTranslate(lang === 'en' ? 'en' : 'ar', full);
  if (s === full && import.meta.env?.DEV) console.warn(`[beard] missing string: ${full}`);
  const text = s === full ? String(key) : s;
  return format(text, { app: lang === 'en' ? APP.name : APP.nameAr, ...vars });
}

/** Pick the right field of a bilingual object: { en, ar } or { name, nameAr }. */
export function pickLang(lang, obj, enKey = 'en', arKey = 'ar') {
  if (obj == null) return '';
  if (typeof obj === 'string') return obj;
  if (lang === 'ar') return obj[arKey] || obj[enKey] || '';
  return obj[enKey] || obj[arKey] || '';
}

/** The language follows the app setting; this device's choice is the shared toggle. */
export function hasLangPref() {
  return true;
}

/** const { t, lang, dir, isRTL, setLang, toggleLang, pick } = useT(); (LIHYA's API on the shared language) */
export function useT() {
  const shared = useSharedT();
  const { lang, setLang, toggle } = shared;
  return useMemo(
    () => ({
      lang,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      isRTL: lang === 'ar',
      t: (key, vars) => translate(lang, key, vars),
      setLang: (next) => setLang(next),
      toggleLang: toggle,
      pick: (obj, enKey, arKey) => pickLang(lang, obj, enKey, arKey),
    }),
    [lang, setLang, toggle],
  );
}
