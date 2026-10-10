import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { strings } from '../content/content'
import type { Lang } from '../content/content'

interface I18nContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (typeof strings)[Lang]
  dir: 'ltr' | 'rtl'
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en')

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
  }, [])

  useEffect(() => {
    const dir = lang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.setAttribute('dir', dir)
    document.documentElement.setAttribute('lang', lang)
  }, [lang])

  const value: I18nContextValue = {
    lang,
    setLang,
    t: strings[lang],
    dir: lang === 'ar' ? 'rtl' : 'ltr',
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}
