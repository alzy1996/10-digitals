import { t } from '../i18n/strings.js'
import { Icon } from './icons.jsx'
import { pick } from './model.js'

/**
 * Header (v0.5, Sam's Stitch mock): one white pill with the brand mark, the venue name and its open / closed chip, the
 * PROTOTYPE · SIMULATION badge on the second line; then the demo stamp-quest pill (when the offers are loaded) and the
 * round "ع / EN" toggle, labelled in the language it switches to (PLAN.md section 8).
 */
export function Header({ index, lang, onToggleLang, status = null, stamps = 0, questTotal = 0, onQuest, onInfo, emergency = false, kiosk = false }) {
  const target = lang === 'ar' ? 'en' : 'ar'
  const name = index ? pick(index.venue.meta.name, lang) : t('app.name', lang)
  return (
    <header className={`header-row${emergency ? ' is-emergency' : ''}`}>
      {/* v0.5: the mall pill opens Mall info (hours, Ramadan, services) */}
      <button
        type="button"
        className="header"
        onClick={onInfo}
        disabled={!onInfo}
        aria-label={`${name} · ${t('app.badge', lang)}${status ? ` · ${status.text}` : ''}${onInfo ? ` · ${t('info.openLabel', lang)}` : ''}`}
      >
        <span className="brand-mark" aria-hidden="true">
          <Icon name="pin" size={22} />
        </span>
        <span className="header-text">
          {/* v0.5 emergency mode: the badge takes the name's line (the SIMULATION badge stays whole below it) */}
          {emergency ? <span className="emergency-badge">{t('emergency.badge', lang)}</span> : null}
          <span className="venue-line" hidden={emergency}>
            <span className="venue-name" title={name}>
              {name}
            </span>
            {kiosk ? <span className="venue-status is-kiosk">{t('kiosk.badge', lang)}</span> : null}
            {status ? (
              <span className={`venue-status ${status.ok ? 'is-open' : 'is-closed'}`} title={status.text}>
                {status.short}
              </span>
            ) : null}
          </span>
          <span className="badge-sim">{t('app.badge', lang)}</span>
        </span>
      </button>
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
