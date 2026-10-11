import { forwardRef, useMemo } from 'react'
import { t } from '../i18n/strings.js'
import { entryChoices } from './firstScreen.js'
import { mallStatus } from './hours.js'
import { Icon } from './icons.jsx'
import { Sheet } from './Sheet.jsx'
import { levelButtonLabel, pick } from './model.js'

/**
 * Find me (v0.5, the first screen; DESIGN-MALL.md 3.1): where the shopper is, before anything else. The exact way is
 * the Dallni sign's QR code (here the simulated plate picker); or the entrance / car-park lift they came in by. No GPS:
 * indoors it knows neither the floor nor the shop, and the screen says so.
 */
export const WelcomeScreen = forwardRef(function WelcomeScreen({ index, lang, hoursPreview, onScan, onPick, onBrowse }, ref) {
  const choices = useMemo(() => entryChoices(index), [index])
  const status = mallStatus(index, lang, new Date(), hoursPreview)
  const mall = pick(index.venue.meta.name, lang)
  return (
    <Sheet
      ref={ref}
      label={t('welcome.where', lang)}
      className="welcome-sheet"
      head={
        <div className="welcome-head">
          <h2 className="welcome-title">{t('welcome.title', lang, { mall })}</h2>
          {status ? (
            <span className={`status-chip ${status.ok ? 'is-open' : 'is-closed'}`}>
              <span className="status-dot" aria-hidden="true" />
              {status.text}
            </span>
          ) : null}
        </div>
      }
    >
      <div className="welcome-body" data-sheet-rows="">
        <h3 className="welcome-where">{t('welcome.where', lang)}</h3>
        <button type="button" className="btn-gradient btn-scan" onClick={onScan}>
          <span className="btn-scan-icon" aria-hidden="true">
            <Icon name="scan" size={28} />
          </span>
          <span className="btn-scan-text">
            <span className="btn-scan-title">{t('welcome.scan', lang)}</span>
            <span className="btn-scan-sub">{t('welcome.scanSub', lang)}</span>
          </span>
        </button>
        <div className="section-label welcome-or">{t('welcome.orPick', lang)}</div>
        <div className="entry-grid" role="group" aria-label={t('welcome.orPick', lang)}>
          {choices.map((c) => (
            <button key={c.anchorId} type="button" className={`entry-card is-${c.kind}`} onClick={() => onPick(c.anchorId)}>
              <span className="entry-tile" aria-hidden="true">
                <Icon name={c.kind === 'entrance' ? 'door' : 'parking'} size={24} />
              </span>
              <span className="entry-label">{pick(c.label, lang)}</span>
              <span className="entry-level" aria-hidden="true">
                <bdi dir="ltr">{levelButtonLabel(index, c.levelId, lang)}</bdi>
              </span>
            </button>
          ))}
        </div>
        <button type="button" className="text-btn welcome-browse" onClick={onBrowse}>
          {t('welcome.browse', lang)}
        </button>
        <p className="caption welcome-gps">
          <Icon name="info" size={18} />
          <span>{t('welcome.gps', lang)}</span>
        </p>
      </div>
    </Sheet>
  )
})
