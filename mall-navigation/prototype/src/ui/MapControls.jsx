import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n/strings.js'
import { Icon } from './icons.jsx'
import { levelButtonLabel, levelName } from './model.js'

const MODES = [
  { mode: 'stack', key: 'view.overview', icon: 'stack' },
  { mode: 'floor', key: 'view.floor', icon: 'floor' },
  { mode: 'top', key: 'view.top', icon: 'map2d' },
]

/**
 * Map controls, kept to the two top corners so the middle of the map stays free:
 * - one 56 px "View" control at the start edge (icon + name of the current view); it opens a short menu with
 *   Overview / Floor / 2D (56 px rows);
 * - the level picker at the end edge (the edge where reading ends, so it moves to the left in Arabic:
 *   PLAN.md section 9). Levels are listed top floor first, labelled like the lift buttons; the App caps its
 *   height to the space above the bottom sheet, and it scrolls inside that space.
 */
export function MapControls({ index, lang, view, onView, onLevel, routeLevelIds, showViews = true, showLevels = true }) {
  const [open, setOpen] = useState(false)
  const [more, setMore] = useState({ above: false, below: false })
  const boxRef = useRef(null)
  const levelsRef = useRef(null)

  // the picker is capped to the space above the sheet (App): when it scrolls, a fade and a chevron show the edge
  // that has more levels, and the active level is always scrolled into view
  useEffect(() => {
    const el = levelsRef.current
    if (!el) return undefined
    const check = () => {
      const above = el.scrollTop > 2
      const below = el.scrollTop + el.clientHeight < el.scrollHeight - 2
      setMore((m) => (m.above === above && m.below === below ? m : { above, below }))
    }
    check()
    el.addEventListener('scroll', check, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null
    ro?.observe(el)
    return () => {
      el.removeEventListener('scroll', check)
      ro?.disconnect()
    }
  }, [index])

  useEffect(() => {
    const el = levelsRef.current
    const btn = el?.querySelector('[aria-pressed="true"]')
    if (!el || !btn) return
    const top = btn.offsetTop
    const bottom = top + btn.offsetHeight
    if (top < el.scrollTop + 4) el.scrollTop = Math.max(0, top - 4)
    else if (bottom > el.scrollTop + el.clientHeight - 4) el.scrollTop = bottom - el.clientHeight + 4
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
  const current = MODES.find((m) => m.mode === view.mode) ?? MODES[0]
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
              {MODES.map((m) => (
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
                  {view.mode === m.mode ? <Icon name="check" size={20} /> : null}
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
              {levelButtonLabel(index, level.id, lang)}
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
