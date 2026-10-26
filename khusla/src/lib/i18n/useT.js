import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import ar from './ar.json';
import en from './en.json';

const DICTS = { ar, en };
const KEY = 'khusla.lang';

function readLang() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'en' || v === 'ar' ? v : 'ar';
  } catch {
    return 'ar';
  }
}

export function translate(lang, key, vars) {
  let s = DICTS[lang]?.[key] ?? DICTS.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(readLang);

  useEffect(() => {
    const el = document.documentElement;
    el.lang = lang;
    el.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      // private browsing: the language simply resets next time
    }
  }, [lang]);

  const setLang = useCallback((l) => setLangState(l === 'en' ? 'en' : 'ar'), []);
  const toggle = useCallback(() => setLangState((l) => (l === 'ar' ? 'en' : 'ar')), []);
  const t = useCallback((key, vars) => translate(lang, key, vars), [lang]);
  const name = useCallback((obj) => {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    return obj[lang] || obj.en || obj.ar || '';
  }, [lang]);

  const value = useMemo(
    () => ({ lang, dir: lang === 'ar' ? 'rtl' : 'ltr', setLang, toggle, t, name, isAr: lang === 'ar' }),
    [lang, setLang, toggle, t, name],
  );
  return createElement(LangContext.Provider, { value }, children);
}

export function useT() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useT must be used inside LangProvider');
  return ctx;
}
