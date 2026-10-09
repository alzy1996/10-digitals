import { t } from '../i18n/strings.js'
import { Icon } from './icons.jsx'
import './hud.css'

const SPEEDS = [1, 2, 4]

/**
 * Walk view bottom bar (DESIGN-GLASS.md 7.3, ref 5): one frosted pewter capsule with End and Speed at the start, Next
 * step (on the last step: Arrived ✓, the same as the map sheet's "You've arrived") and Map at the end, each a 56 px button with its icon over a short label, and the one glowing 72 px Play / Pause
 * in the middle (the screen's primary action) standing out of the capsule. End is a stop square ("End"): it ends the
 * whole route (with the App's 5 s Undo), so it never wears the ✕ that reads as "close this view". The layout mirrors
 * in Arabic (End at the right); the Next chevron follows reading direction. The bar takes the taps it does not use:
 * a near miss never lands on the mini-map under it.
 *
 * @param {{ lang: 'en'|'ar',
 *   sim: { active: boolean, playing: boolean, done: boolean, speed: 1|2|4 },
 *   canNext: boolean, isLast?: boolean, onEnd: Function, onSpeed: (m: number) => void, onPlay: Function,
 *   onPause: Function, onNext: Function, onOpenMap: Function, className?: string }} props  isLast: the last step (the
 *   Next slot says Arrived and onNext ends the walk there; not the primary style: Play stays the one primary action)
 */
export function BottomBar({ lang, sim, canNext = true, isLast = false, onEnd, onSpeed, onPlay, onPause, onNext, onOpenMap, className = '' }) {
  const playing = Boolean(sim?.active && sim?.playing)
  let label = t('sim.walk', lang)
  let icon = 'play'
  if (playing) {
    label = t('sim.pause', lang)
    icon = 'pause'
  } else if (sim?.active && sim?.done) {
    label = t('sim.replay', lang)
    icon = 'restart'
  } else if (sim?.active) {
    label = t('sim.resume', lang)
  }
  const speed = SPEEDS.includes(sim?.speed) ? sim.speed : 1
  return (
    <nav className={`walk-bar ${className}`} aria-label={t('sim.label', lang)}>
      <div className="bar-side is-start">
        <button type="button" className="bar-btn" onClick={onEnd} aria-label={t('nav.end', lang)} title={t('nav.end', lang)}>
          <Icon name="stop" size={20} />
          <span className="bar-label" aria-hidden="true">
            {t('hud.end', lang)}
          </span>
        </button>
        <button
          type="button"
          className="bar-btn bar-speed"
          onClick={() => onSpeed?.(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
          aria-label={t('sim.speedNow', lang, { speed: t(`sim.speed${speed}`, lang) })}
        >
          <span className="bar-speed-val">{t(`sim.speed${speed}`, lang)}</span>
          <span className="bar-label" aria-hidden="true">
            {t('sim.speed', lang)}
          </span>
        </button>
      </div>
      <button type="button" className="bar-play" onClick={playing ? onPause : onPlay} aria-label={label} title={label}>
        <Icon name={icon} size={30} />
      </button>
      <div className="bar-side is-end">
        {isLast ? (
          <button type="button" className="bar-btn is-arrive" onClick={onNext} aria-label={t('arrived.title', lang)} title={t('arrived.title', lang)}>
            <Icon name="check" size={22} />
            <span className="bar-label" aria-hidden="true">
              {t('hud.arrived', lang)}
            </span>
          </button>
        ) : (
          <button type="button" className="bar-btn" onClick={onNext} disabled={!canNext} aria-label={t('nav.next', lang)} title={t('nav.next', lang)}>
            <Icon name="chevron" size={22} className="flip-rtl" />
            <span className="bar-label" aria-hidden="true">
              {t('nav.next', lang)}
            </span>
          </button>
        )}
        <button type="button" className="bar-btn" onClick={onOpenMap} aria-label={t('hud.openMap', lang)} title={t('hud.openMap', lang)}>
          <Icon name="stack" size={20} />
          <span className="bar-label" aria-hidden="true">
            {t('hud.openMap', lang)}
          </span>
        </button>
      </div>
    </nav>
  )
}
