import { forwardRef } from 'react'
import { formatDistance, formatDuration, t } from '../i18n/strings.js'
import { Icon } from './icons.jsx'
import { Sheet } from './Sheet.jsx'
import { hoursLine, levelName, pick, viaLine } from './model.js'

/**
 * Place (S05): name, level, minutes, hours, step-free toggle and one primary action: GO.
 * The 3D map behind shows the route preview.
 */
export const PlaceScreen = forwardRef(function PlaceScreen({ index, lang, info, route, you, stepFree, onToggleStepFree, onGo, onBack }, ref) {
  if (!info) return null
  const hours = info.hours ? hoursLine(index, info.hours, lang) : null
  const via = route ? viaLine(route, lang) : null
  // lifts and stairs serve several levels: name the level the route takes you to
  const levelId = info.levelId ?? route?.points[route.points.length - 1]?.levelId ?? null
  return (
    <Sheet
      ref={ref}
      maxHeight="60%"
      label={pick(info.name, lang)}
      scroll
      footer={
        <button type="button" className="btn btn-primary btn-go btn-block" onClick={onGo} disabled={!route} style={route ? undefined : { opacity: 0.45 }}>
          {t('place.go', lang)}
          <Icon name="turn_straight" size={26} />
        </button>
      }
    >
      <div className="flex items-start gap-3">
        <button type="button" className="icon-btn" onClick={onBack} aria-label={t('common.back', lang)}>
          <Icon name="back" size={24} className="flip-rtl" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="title">{pick(info.name, lang)}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {info.categoryLabelKey ? (
              <span className="cat-chip" style={{ background: info.color }}>
                <Icon name={info.icon} size={18} />
                {t(info.categoryLabelKey, lang)}
              </span>
            ) : null}
            {levelId ? <span className="subtitle">{levelName(index, levelId, lang)}</span> : null}
          </div>
        </div>
      </div>

      <div className="facts mt-4">
        {route ? (
          <>
            <span className="fact">
              <Icon name="walk" size={22} />
              <span className="nowrap font-semibold">{formatDuration(route.etaS, lang)}</span>
            </span>
            <span className="fact nowrap text-ink-2">{formatDistance(route.lengthM, lang)}</span>
          </>
        ) : null}
        {hours ? (
          <span className={`fact ${hours.ok ? 'open-ok' : 'open-closed'}`}>
            <Icon name="clock" size={20} />
            {hours.text}
          </span>
        ) : null}
      </div>
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
    </Sheet>
  )
})
