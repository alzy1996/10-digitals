import { t } from '../i18n/strings.js'
import { Icon } from './icons.jsx'
import { pick } from './model.js'

/**
 * Header card: brand mark, venue name, the PROTOTYPE · SIMULATION badge and the 56 px "ع / EN" toggle.
 * The toggle is labelled in the language it switches to (PLAN.md section 8).
 */
export function Header({ index, lang, onToggleLang }) {
  const target = lang === 'ar' ? 'en' : 'ar'
  const name = index ? pick(index.venue.meta.name, lang) : t('app.name', lang)
  return (
    <header className="header">
      <div className="brand-mark" aria-hidden="true">
        <Icon name="pin" size={24} />
      </div>
      <div className="header-text">
        <div className="venue-name" title={name}>
          {name}
        </div>
        <span className="badge-sim">{t('app.badge', lang)}</span>
      </div>
      <button
        type="button"
        className="lang-btn"
        data-target={target}
        lang={target}
        onClick={onToggleLang}
        aria-label={t('lang.toggleLabel', lang)}
        title={t('lang.toggleLabel', lang)}
      >
        {t('lang.toggle', lang)}
      </button>
    </header>
  )
}
