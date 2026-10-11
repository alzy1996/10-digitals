import { forwardRef, useMemo } from 'react'
import { addStrings, formatDistance, t } from '../i18n/strings.js'
import { MORE } from '../i18n/strings-more.js'
import { nearestExits } from '../ops/exits.js'
import { Icon } from './icons.jsx'
import { Sheet } from './Sheet.jsx'
import { levelButtonLabel, pick } from './model.js'
import './emergency.css'

addStrings(MORE)

/**
 * Emergency (v0.5, PLAN S20; DESIGN-MALL.md 3.7): mall operations switched it on. Directions stop (no route, no walk);
 * the sheet says what to do (the ops message or the default), lists the exits (straight-line distance on your level,
 * otherwise "Ground level · use the stairs"), and that lifts are not safe. The map shows the exits as pins.
 * The demo button ends it (prototype only: in the product only mall operations can).
 */
export const EmergencyScreen = forwardRef(function EmergencyScreen({ index, lang, you, message, onEnd }, ref) {
  const exits = useMemo(() => nearestExits(index, you), [index, you])
  return (
    <Sheet
      ref={ref}
      label={t('emergency.title', lang)}
      className="emergency-sheet"
      head={
        <div className="emergency-head">
          <span className="emergency-icon" aria-hidden="true">
            <Icon name="warning" size={28} />
          </span>
          <h2 className="emergency-title">{t('emergency.title', lang)}</h2>
        </div>
      }
      footer={
        onEnd ? (
          <button type="button" className="text-btn emergency-end" onClick={onEnd}>
            {t('emergency.end', lang)}
          </button>
        ) : null
      }
    >
      <div className="emergency-body" data-sheet-rows="">
        <p className="emergency-msg" role="alert">
          {message ? pick(message, lang) : t('emergency.default', lang)}
        </p>
        <div className="list" data-sheet-rows="">
          <div className="list-head section-label">{t('emergency.exits', lang)}</div>
          {exits.map((e) => (
            <div key={e.anchorId} className="row">
              <span className="row-icon emergency-exit-icon">
                <Icon name="exit" size={24} />
              </span>
              <span className="row-main">
                <span className="row-title block">{pick(e.label, lang)}</span>
                <span className="row-sub block">{e.distanceM != null ? t('emergency.about', lang, { m: formatDistance(e.distanceM, lang) }) : t('emergency.otherLevel', lang)}</span>
              </span>
              <span className="row-end">
                <span className="level-badge">
                  <bdi dir="ltr">{levelButtonLabel(index, e.levelId, lang)}</bdi>
                </span>
              </span>
            </div>
          ))}
        </div>
        <p className="emergency-nolifts">
          <Icon name="nolift" size={22} />
          {t('emergency.noLifts', lang)}
        </p>
        <p className="caption">{t('emergency.routingOff', lang)}</p>
      </div>
    </Sheet>
  )
})
