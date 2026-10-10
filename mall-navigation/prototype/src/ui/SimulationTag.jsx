import { useLayoutEffect, useRef, useState } from 'react'
import { t } from '../i18n/strings.js'
import './hud.css'

/**
 * The SIMULATION capsule (DESIGN-GLASS.md 7.3): the amber tag plus "Not your live position", on tinted dark glass,
 * 36 px (Arrived in the Walk view). `compact`: the amber 28 px pill alone, as it sits in the turn card's top-end corner
 * while walking (the note stays in the accessible name). One of the two is on screen in every Walk view state
 * (playing, paused, lift card, arrived): the Walk view is a simulation inside the 3D model, never camera AR or live
 * positioning. The note stays whenever it fits, measured (not by breakpoint): when the full note does not fit the
 * capsule shows the short one ("Not live"), and only when even that does not fit the tag alone (both stay in the
 * accessible name).
 *
 * @param {{ lang: 'en'|'ar', compact?: boolean, className?: string }} props
 */
export function SimulationTag({ lang, compact = false, className = '' }) {
  const name = `${t('sim.label', lang)} · ${t('sim.notLive', lang)}`
  const noteRef = useRef(null)
  const tinyRef = useRef(null)
  const [tagOnly, setTagOnly] = useState(false)

  useLayoutEffect(() => {
    if (compact) return undefined
    const note = noteRef.current
    const tiny = tinyRef.current
    const row = note?.closest('.walk-simrow') ?? note?.parentElement?.parentElement
    if (!note || !tiny || !row) return undefined
    const over = (el) => el.scrollWidth > el.clientWidth + 1
    const measure = () => {
      // the full note first, then the short one, then the tag alone (synchronous: before paint)
      note.style.display = ''
      tiny.style.display = 'none'
      let none = false
      if (over(note)) {
        note.style.display = 'none'
        tiny.style.display = ''
        if (over(tiny)) {
          tiny.style.display = 'none'
          none = true
        }
      }
      setTagOnly(none)
    }
    measure()
    // (the web fonts can arrive after the first measure)
    let alive = true
    document.fonts?.ready?.then(() => alive && measure())
    if (typeof ResizeObserver === 'undefined') return () => (alive = false)
    let w = row.clientWidth
    const ro = new ResizeObserver(() => {
      if (row.clientWidth === w) return
      w = row.clientWidth
      measure()
    })
    ro.observe(row)
    return () => {
      alive = false
      ro.disconnect()
    }
  }, [compact, lang])

  if (compact) {
    return (
      <span className={`sim-tag sim-pill ${className}`} role="note" aria-label={name}>
        <span aria-hidden="true">{t('sim.label', lang)}</span>
      </span>
    )
  }
  return (
    <div className={`sim-capsule${tagOnly ? ' is-tagonly' : ''} ${className}`} role="note" aria-label={name}>
      <span className="sim-tag" aria-hidden="true">
        {t('sim.label', lang)}
      </span>
      <span ref={noteRef} className="sim-note" aria-hidden="true">
        {t('sim.notLiveShort', lang)}
      </span>
      <span ref={tinyRef} className="sim-note" aria-hidden="true" style={{ display: 'none' }}>
        {t('sim.notLiveTiny', lang)}
      </span>
    </div>
  )
}
