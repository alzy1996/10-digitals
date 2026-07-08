import { useI18n } from '../lib/i18n'

export default function LangToggle() {
  const { lang, setLang } = useI18n()
  const next = lang === 'en' ? 'ar' : 'en'

  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      aria-label={next === 'ar' ? 'التبديل إلى العربية' : 'Switch to English'}
      className="en-tracking flex min-h-11 min-w-11 items-center justify-center rounded-pill border border-line px-4 text-xs uppercase tracking-[.2em] text-ink transition-colors duration-300 hover:border-accent hover:text-accent"
    >
      {next === 'ar' ? 'ع' : 'EN'}
    </button>
  )
}
