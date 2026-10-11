import { forwardRef } from 'react'
import { addStrings, formatDistance, formatDuration, formatMinutesParts, t } from '../i18n/strings.js'
import { MORE } from '../i18n/strings-more.js'
import { CATEGORY_COLORS } from '../engine/tokens.js'
import { formatDay } from './dates.js'
import { venueDate } from './hours.js'
import './offers.css'
import { Icon } from './icons.jsx'
import { Sheet } from './Sheet.jsx'
import { hoursLine, levelName, pick, viaLine } from './model.js'

/**
 * Place (S05): name, level, minutes, hours, step-free toggle and one primary action: GO.
 * The 3D map behind shows the route preview. Folded, the sheet keeps the name row (its head) and GO (its footer).
 */
addStrings(MORE)

export const PlaceScreen = forwardRef(function PlaceScreen({ index, lang, info, route, you, stepFree, hoursPreview = null, deal = null, isNew = false, handoff = null, onToggleStepFree, onGo, onBack }, ref) {
  if (!info) return null
  // Ramadan / Eid aware; the Mall info switch previews a special's hours (v0.5)
  const hours = info.hours ? hoursLine(index, info, lang, new Date(), hoursPreview) : null
  const via = route ? viaLine(route, lang) : null
  const eta = route ? formatMinutesParts(route.etaS, lang) : null
  // lifts and stairs serve several levels: name the level the route takes you to
  const levelId = info.levelId ?? route?.points[route.points.length - 1]?.levelId ?? null
  return (
    <Sheet
      ref={ref}
      label={pick(info.name, lang)}
      head={
        <div className="flex items-start gap-3">
          <button type="button" className="icon-btn" onClick={onBack} aria-label={t('common.back', lang)}>
            <Icon name="back" size={24} className="flip-rtl" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="title">
              {pick(info.name, lang)}
              {isNew ? <span className="badge-new">{t('offers.badgeNew', lang)}</span> : null}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {info.categoryLabelKey ? (
                <span className="cat-chip" style={{ background: info.color, '--cat-c': info.color }}>
                  <Icon name={info.icon} size={18} />
                  {t(info.categoryLabelKey, lang)}
                </span>
              ) : null}
              {levelId ? <span className="subtitle">{levelName(index, levelId, lang)}</span> : null}
            </div>
          </div>
        </div>
      }
      footer={
        <button type="button" className="btn btn-primary btn-go btn-block" onClick={onGo} disabled={!route} style={route ? undefined : { opacity: 0.45 }}>
          {t('place.go', lang)}
          <Icon name="turn_straight" size={26} />
        </button>
      }
    >
      {route ? (
        // light hero numerals ("2" + "min walk"); the accessible name keeps the spoken form ("about 2 min")
        <p className="place-eta mt-2" aria-label={`${formatDuration(route.etaS, lang)} · ${formatDistance(route.lengthM, lang)}`}>
          <span className="nowrap" aria-hidden="true">
            <span className="num-hero">{eta.value}</span> <span className="eta-unit">{t('hud.minWalk', lang)}</span>
          </span>
          <span className="num-card eta-dist nowrap" aria-hidden="true">
            {formatDistance(route.lengthM, lang)}
          </span>
        </p>
      ) : null}
      {hours ? (
        <p className={`fact mt-2 ${hours.ok ? 'open-ok' : 'open-closed'}`}>
          <Icon name="clock" size={20} />
          {hours.text}
        </p>
      ) : null}
      {/* v0.5: the shop's demo offer (pull: shown on its own place screen, never pushed) */}
      {deal ? (
        <div className="offer-card" style={{ '--cat': CATEGORY_COLORS[deal.category] ?? CATEGORY_COLORS.services }}>
          <span className="offer-card-band">{pick(deal.figure, lang)}</span>
          <span className="offer-card-text">
            <span className="offer-card-label">{t('offers.offer', lang)}</span>
            <span className="offer-card-title">{pick(deal.title, lang)}</span>
            <span className="offer-card-until">{t('offers.until', lang, { date: formatDay(deal.to, lang, venueDate(index).ymd.slice(0, 4)) })}</span>
          </span>
        </div>
      ) : null}
      {route && (via || you) ? (
        <p className="caption mt-1">
          {you ? t('place.from', lang, { place: pick(you.label, lang) }) : null}
          {you && via ? ' · ' : null}
          {via}
        </p>
      ) : null}

      {!route ? (
        <div className="notice mt-3" role="alert">
          <Icon name="info" size={22} />
          <span>{t(stepFree ? 'place.noRouteStepFree' : 'place.noRoute', lang)}</span>
        </div>
      ) : null}

      <button type="button" role="switch" aria-checked={stepFree} className="switch-row mt-3" onClick={onToggleStepFree}>
        <Icon name="accessible" size={24} />
        <span className="flex-1">{t('place.stepFreeToggle', lang)}</span>
        <span className="switch" aria-hidden="true" />
      </button>
      {/* v0.5 kiosk: Continue on your phone */}
      {handoff}
    </Sheet>
  )
})
