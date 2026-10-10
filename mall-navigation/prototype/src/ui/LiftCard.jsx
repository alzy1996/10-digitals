import { useEffect, useRef, useState } from 'react'
import { Icon } from './icons.jsx'
import { liftCardContent } from './hudModel.js'
import './hud.css'

const FADE_IN_MS = 240
const HOLD_MS = 600
const FADE_OUT_MS = 320

/**
 * Lift / stairs card (DESIGN-GLASS.md 6.2): while a lift or the stairs carry the simulated walker between floors, the
 * Walk view does not slide the camera through the floors; a dark overlay (blur 12 px) fades in over the cut with a
 * centred card: "Lift A → Level 1", "Press “1”" and a teal progress line. Fade in 240 ms, shown at least 600 ms (also
 * at 4x), fade out 320 ms. The turn card and its SIMULATION pill stay above it; the turn card names the lift and the
 * floor, so the card itself shows the button to press ("Press “B1”", the "Lift B → Parking B1" line is read to screen
 * readers only); the stairs, which have no button, keep their line.
 *
 * @param {{ index: object, lang: 'en'|'ar', step: object|null, active: boolean, progress?: number }} props
 *   step: the current route step (a lift / stairs connector step); active: the ride is on (sim.onConnector, phase
 *   'ride', connectorType 'lift' | 'stairs'); progress: sim.rideProgress (0..1).
 */
export function LiftCard({ index, lang, step, active, progress = 0 }) {
  const content = active ? liftCardContent(index, step, lang) : null
  const [shown, setShown] = useState(null) // { content, phase: 'in' | 'out' }
  const since = useRef(0)
  const timer = useRef(0)
  const contentKey = content ? `${content.headline}|${content.body}` : ''

  useEffect(() => {
    clearTimeout(timer.current)
    if (content) {
      if (!shown || shown.phase === 'out') since.current = performance.now()
      // mount at opacity 0, then fade in on the next frame
      setShown((s) => ({ content, phase: s && s.phase === 'in' ? 'in' : 'enter' }))
      const id = requestAnimationFrame(() => setShown((s) => (s ? { ...s, phase: 'in' } : s)))
      return () => cancelAnimationFrame(id)
    }
    if (!shown) return undefined
    const wait = Math.max(0, since.current + FADE_IN_MS + HOLD_MS - performance.now())
    timer.current = setTimeout(() => {
      setShown((s) => (s ? { ...s, phase: 'out' } : s))
      timer.current = setTimeout(() => setShown(null), FADE_OUT_MS)
    }, wait)
    return () => clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey])

  if (!shown) return null
  const c = shown.content
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100)
  return (
    <div className={`lift-overlay${shown.phase === 'in' ? ' is-in' : ''}${shown.phase === 'out' ? ' is-out' : ''}`} role="status" lang={lang}>
      <div className="lift-card">
        <span className="lift-disc" aria-hidden="true">
          <Icon name={c.icon} size={30} />
        </span>
        {/* the turn card above already says "Take Lift B to Parking B1": the card shows the button to press */}
        <p className={c.body ? 'sr-only' : 'lift-head'}>{c.headline}</p>
        {c.body ? <p className="lift-head">{c.body}</p> : null}
        <div className="lift-progress" aria-hidden="true">
          <span style={{ width: `${shown.phase === 'out' ? 100 : pct}%` }} />
        </div>
      </div>
    </div>
  )
}
