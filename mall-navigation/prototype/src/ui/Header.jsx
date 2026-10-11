import { t } from '../i18n/strings.js'
import { Icon } from './icons.jsx'
import { pick } from './model.js'

/**
 * Header (v0.5, Sam's Stitch mock): one white pill with the brand mark, the venue name and its open / closed chip, the
 * PROTOTYPE · SIMULATION badge on the second line; then the demo stamp-quest pill (when the offers are loaded) and the
 * round "ع / EN" toggle, labelled in the language it switches to (PLAN.md section 8).
 */
export function Header({ index, lang, onToggleLang, status = null, stamps = 0, questTotal = 0, onQuest }) {
  const target = lang === 'ar' ? 'en' : 'ar'
  const name = index ? pick(index.venue.meta.name, lang) : t('app.name', lang)
  return (
    <header className="header-row">
      <div className="header">
        <div className="brand-mark" aria-hidden="true">
          <Icon name="pin" size={22} />
        </div>
        <div className="header-text">
          <div className="venue-line">
            <span className="venue-name" title={name}>
              {name}
            </span>
            {status ? (
              <span className={`venue-status ${status.ok ? 'is-open' : 'is-closed'}`} title={status.text}>
                {status.short}
              </span>
            ) : null}
          </div>
          <span className="badge-sim">{t('app.badge', lang)}</span>
        </div>
      </div>
      {questTotal ? (
        <button type="button" className="quest-btn" onClick={onQuest} aria-label={`${t('home.questLabel', lang)} · ${t('home.questPill', lang, { n: stamps })}`}>
          <Icon name="star" size={18} />
          <span>
            <bdi dir="ltr">
              {lang === 'ar' ? `${stamps.toLocaleString('ar-EG')}/٤` : `${stamps}/${questTotal}`}
            </bdi>
          </span>
        </button>
      ) : null}
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
