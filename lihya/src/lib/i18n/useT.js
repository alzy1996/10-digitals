import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import ar from './ar.json';
import en from './en.json';
import { APP, PREF_KEYS } from '../../config/app.js';

// Strings: ar.json / en.json hold shared keys; each feature area adds its own
// namespace file in ./ns/<area>.json shaped { "en": {...}, "ar": {...} }.
const nsFiles = import.meta.glob('./ns/*.json', { eager: true, import: 'default' });

function build() {
  const dict = { ar: { ...ar }, en: { ...en } };
  for (const file of Object.values(nsFiles)) {
    if (file && file.en) Object.assign(dict.en, file.en);
    if (file && file.ar) Object.assign(dict.ar, file.ar);
  }
  return dict;
}

export const DICT = build();

function readPref() {
  try {
    const v = localStorage.getItem(PREF_KEYS.lang);
    return v === 'ar' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

/** Interpolate {name} placeholders. */
export function format(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
}

/** Translate outside React (reports, PDFs). Falls back to English, then the key. */
export function translate(lang, key, vars) {
  const s = DICT[lang]?.[key] ?? DICT.en[key] ?? key;
  return format(s, vars);
}

/** Pick the right field of a bilingual object: { en, ar } or { name, nameAr }. */
export function pickLang(lang, obj, enKey = 'en', arKey = 'ar') {
  if (obj == null) return '';
  if (typeof obj === 'string') return obj;
  if (lang === 'ar') return obj[arKey] || obj[enKey] || '';
  return obj[enKey] || obj[arKey] || '';
}

const I18nContext = createContext(null);

export function I18nProvider({ children, initialLang }) {
  const [lang, setLangState] = useState(() => initialLang || readPref() || APP.defaultLanguage);

  useEffect(() => {
    const el = document.documentElement;
    el.lang = lang;
    el.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const setLang = useCallback((next) => {
    if (next !== 'ar' && next !== 'en') return;
    setLangState(next);
    try {
      localStorage.setItem(PREF_KEYS.lang, next);
    } catch {
      // private mode: preference is not kept, the app still works
    }
  }, []);

  const value = useMemo(() => {
    const t = (key, vars) => translate(lang, key, vars);
    return {
      lang,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      isRTL: lang === 'ar',
      t,
      setLang,
      toggleLang: () => setLang(lang === 'ar' ? 'en' : 'ar'),
      pick: (obj, enKey, arKey) => pickLang(lang, obj, enKey, arKey),
    };
  }, [lang, setLang]);

  return createElement(I18nContext.Provider, { value }, children);
}

/** const { t, lang, dir, isRTL, setLang, toggleLang, pick } = useT(); */
export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useT must be used inside <I18nProvider>');
  return ctx;
}
