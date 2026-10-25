import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
// Strings live in src/i18n/strings/*.js, each `export default { en: {...}, ar: {...} }` (merged here).
const parts = import.meta.glob('./strings/*.js', { eager: true })
const DICTS = { en: {}, ar: {} }
for (const mod of Object.values(parts)) {
  Object.assign(DICTS.en, mod.default.en)
  Object.assign(DICTS.ar, mod.default.ar)
}
export const I18N_DICTS = DICTS
const I18nContext = createContext(null)

function initialLang() {
  try {
    const saved = window.localStorage.getItem('nm_lang') // per-viewer convenience only
    if (saved === 'ar' || saved === 'en') return saved
  } catch {
    /* storage blocked */
  }
  const nav = (navigator.language || 'en').toLowerCase()
  return nav.startsWith('ar') ? 'ar' : 'en'
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(initialLang)

  useEffect(() => {
    const el = document.documentElement
    el.lang = lang
    el.dir = lang === 'ar' ? 'rtl' : 'ltr'
    try {
      window.localStorage.setItem('nm_lang', lang)
    } catch {
      /* ignore */
    }
  }, [lang])

  const t = useCallback(
    (key, params) => {
      let s = DICTS[lang][key] ?? DICTS.en[key] ?? key
      if (params) for (const k in params) s = s.replaceAll('{' + k + '}', params[k])
      return s
    },
    [lang],
  )

  /** Pick the right language from a bilingual record: {en, ar} | {name, nameAr} | {x, xAr} */
  const pick = useCallback(
    (obj, field = 'name') => {
      if (!obj) return ''
      if (obj.en !== undefined || obj.ar !== undefined) return (lang === 'ar' ? obj.ar : obj.en) || obj.en || obj.ar || ''
      const arKey = field + 'Ar'
      return (lang === 'ar' ? obj[arKey] : obj[field]) || obj[field] || obj[arKey] || ''
    },
    [lang],
  )

  const value = useMemo(
    () => ({
      lang,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      isAr: lang === 'ar',
      setLang: setLangState,
      toggle: () => setLangState((l) => (l === 'ar' ? 'en' : 'ar')),
      t,
      pick,
    }),
    [lang, t, pick],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const c = useContext(I18nContext)
  if (!c) throw new Error('useI18n outside I18nProvider')
  return c
}
