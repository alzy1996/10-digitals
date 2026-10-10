import { formatClock, formatDistance, formatSteps, t } from '../i18n/strings.js'
import { Icon } from './icons.jsx'
import './hud.css'

/**
 * Walk view stat chips (DESIGN-GLASS.md 7.3, ref 5): Arrival (clock time in the venue's time zone, at 1x walking),
 * Distance left on the route, and the footsteps left as an estimate ("≈ 130"). Pewter tinted glass (no blur), 48 px,
 * three equal columns, each with its round coloured icon (a 26 px ring under 380 px wide). Hidden on screens under
 * 700 px tall (the turn card's summary line carries arrival + distance there).
 *
 * `end` (optional) closes the row; the Walk view no longer passes one (the level chip sits in the mini-map dome, so
 * every phone keeps the icons: DESIGN-GLASS 7.1).
 *
 * @param {{ lang: 'en'|'ar', arrivalMs: number, distanceLeftM: number, timeZone?: string, end?: import('react').ReactNode,
 *   className?: string }} props
 */
export function StatChips({ lang, arrivalMs, distanceLeftM, timeZone = 'Asia/Muscat', end = null, className = '' }) {
  const chips = [
    { key: 'arrival', icon: 'clock', color: 'var(--chip-arrival)', label: t('hud.arrival', lang), value: formatClock(arrivalMs, lang, timeZone) },
    { key: 'distance', icon: 'pin', color: 'var(--chip-distance)', label: t('hud.distance', lang), value: formatDistance(distanceLeftM, lang) },
    { key: 'steps', icon: 'footprints', color: 'var(--chip-steps)', label: t('hud.steps', lang), value: formatSteps(distanceLeftM, lang) },
  ]
  return (
    <div className={`stat-chips${end ? ' has-end' : ''} ${className}`} role="group" aria-label={t('hud.summaryLabel', lang)}>
      {chips.map((c) => (
        <div key={c.key} className="stat-chip" style={{ '--chip-c': c.color }}>
          <span className="stat-ico" aria-hidden="true">
            <Icon name={c.icon} size={20} />
          </span>
          <span className="stat-txt">
            <span className="stat-label">{c.label}</span>
            <span className="stat-val">{c.value}</span>
          </span>
        </div>
      ))}
      {end}
    </div>
  )
}
