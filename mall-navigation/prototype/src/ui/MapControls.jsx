import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n/strings.js'
import { Icon } from './icons.jsx'
import { levelButtonLabel, levelName } from './model.js'

const MODES = [
  { mode: 'stack', key: 'view.overview', icon: 'stack' },
  { mode: 'floor', key: 'view.floor', icon: 'floor' },
  { mode: 'top', key: 'view.top', icon: 'map2d' },
]
/** v0.2: the first-person Walk view, offered only while a route is shown (navigate, arrived). */
const WALK_MODE = { mode: 'fpv', key: 'view.fpv', icon: 'eye' }

/**
 * Scroll a capped level picker so the active level shows whole and, when the picker shows 3 or more levels, not at an
 * edge that fades out (more levels beyond it): it moves to the middle of what shows. Scroll positions are whole
 * buttons (the picker also scroll-snaps to them).
 */
function showActiveLevel(el) {
  const btn = el.querySelector('[aria-pressed="true"]')
  const bh = btn?.offsetHeight ?? 0
  if (!btn || bh <= 0) return
  const count = el.querySelectorAll('.level-btn').length
  const n = Math.max(1, Math.floor((el.clientHeight + 1) / bh))
  if (n >= count) {
    if (el.scrollTop !== 0) el.scrollTop = 0
    return
  }
  const i = Math.round(btn.offsetTop / bh)
  let first = Math.round(el.scrollTop / bh)
  const lo = first + (first > 0 && n >= 3 ? 1 : 0)
  const hi = first + n - 1 - (first + n < count && n >= 3 ? 1 : 0)
  if (i < lo || i > hi) first = Math.min(Math.max(0, i - Math.floor((n - 1) / 2)), count - n)
  const top = first * bh
  if (Math.abs(el.scrollTop - top) > 1) el.scrollTop = top
}

/**
 * Map controls, kept to the two top corners so the middle of the map stays free:
 * - one 56 px "View" control at the start edge (icon + name of the current view); it opens a short menu with
 *   Overview / Floor / 2D (56 px rows);
 * - the level picker at the end edge (the edge where reading ends, so it moves to the left in Arabic:
 *   PLAN.md section 9). Levels are listed top floor first, labelled like the lift buttons; the App caps its
 *   height to the space above the bottom sheet, and it scrolls inside that space.
 * `walkAvailable` (v0.2) adds a 4th menu row, "Walk view" (`onView('fpv')`), while a route is shown.
 */
export function MapControls({ index, lang, view, onView, onLevel, routeLevelIds, showViews = true, showLevels = true, walkAvailable = false }) {
  const [open, setOpen] = useState(false)
  const [more, setMore] = useState({ above: false, below: false })
  const boxRef = useRef(null)
  const levelsRef = useRef(null)

  // the picker is capped to the space above the sheet (App: a whole number of buttons): when it scrolls, a fade and a
  // chevron show the edge that has more levels, and the active level is always in view, clear of the fades (also
  // when the cap changes: a sheet snap, a resize)
  useEffect(() => {
    const el = levelsRef.current
    if (!el) return undefined
    const check = () => {
      const above = el.scrollTop > 2
      const below = el.scrollTop + el.clientHeight < el.scrollHeight - 2
      setMore((m) => (m.above === above && m.below === below ? m : { above, below }))
    }
    const onResize = () => {
      showActiveLevel(el)
      check()
    }
    onResize()
    el.addEventListener('scroll', check, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null
    ro?.observe(el)
    // (a button too: compact buttons change the content, not always the capped box)
    if (el.firstElementChild) ro?.observe(el.firstElementChild)
    return () => {
      el.removeEventListener('scroll', check)
      ro?.disconnect()
    }
  }, [index])

  useEffect(() => {
    if (levelsRef.current) showActiveLevel(levelsRef.current)
  }, [view.levelId])

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!index) return null
  const levels = [...index.levels].sort((a, b) => b.ordinal - a.ordinal)
  const onRoute = new Set(routeLevelIds ?? [])
  const modes = walkAvailable ? [...MODES, WALK_MODE] : MODES
  const current = modes.find((m) => m.mode === view.mode) ?? MODES[0]
  return (
    <div className="map-ctrls">
      {showViews ? (
        <div className="view-box" ref={boxRef}>
          <button
            type="button"
            className="view-ctrl"
            aria-haspopup="true"
            aria-expanded={open}
            aria-label={`${t('view.label', lang)}: ${t(current.key, lang)}`}
            onClick={() => setOpen((o) => !o)}
          >
            <Icon name={current.icon} size={22} />
            <span className="view-ctrl-text">{t(current.key, lang)}</span>
          </button>
          {open ? (
            <div className="view-menu" role="group" aria-label={t('view.label', lang)}>
              {modes.map((m) => (
                <button
                  key={m.mode}
                  type="button"
                  className="view-opt"
                  aria-pressed={view.mode === m.mode}
                  onClick={() => {
                    setOpen(false)
                    onView(m.mode)
                  }}
                >
                  <Icon name={m.icon} size={22} />
                  <span className="flex-1">{t(m.key, lang)}</span>
                  {view.mode === m.mode ? <Icon name="check" size={20} className="view-check" /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <span />
      )}
      {showLevels ? (
        <div className="levels-wrap">
        <div
          ref={levelsRef}
          className={`levels${more.above ? ' has-more-above' : ''}${more.below ? ' has-more-below' : ''}`}
          role="group"
          aria-label={t('view.levels', lang)}
        >
          {levels.map((level) => (
            <button
              key={level.id}
              type="button"
              className="level-btn"
              aria-pressed={view.levelId === level.id}
              aria-label={levelName(index, level.id, lang)}
              title={levelName(index, level.id, lang)}
              onClick={() => onLevel(level.id)}
            >
              <bdi dir="ltr">{levelButtonLabel(index, level.id, lang)}</bdi>
              {onRoute.has(level.id) ? <span className="level-dot" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
        {more.above ? (
          <span className="levels-more is-above" aria-hidden="true">
            <Icon name="chevron" size={16} className="rot-up" />
          </span>
        ) : null}
        {more.below ? (
          <span className="levels-more is-below" aria-hidden="true">
            <Icon name="chevron" size={16} className="rot-down" />
          </span>
        ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * v0.2 floating "Walk view" pill (DESIGN-GLASS.md 7.5): pewter glass, 56 px, at the map's inline-end bottom corner,
 * 12 px above the sheet (CSS uses the App's --sheet-top). It opens the first-person Walk view (a SIMULATION inside
 * the 3D model). The App adds its rect to `engine.setScreenObstacles` (selector `.walk-pill`). While a toast shows
 * (they sit in the same row above the sheet) it is hidden in place.
 */
export function WalkViewButton({ lang, onClick, hidden = false }) {
  // `hidden`: a toast ("Now on Level 1") is using the row just above the sheet for a moment; the pill keeps its
  // place (no layout jump), it is only not shown
  return (
    <button
      type="button"
      className="walk-pill"
      onClick={onClick}
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
      style={hidden ? { visibility: 'hidden' } : undefined}
    >
      <Icon name="eye" size={22} />
      <span>{t('view.fpv', lang)}</span>
    </button>
  )
}
