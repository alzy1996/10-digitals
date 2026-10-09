import { useEffect, useRef } from 'react'
import { engine, enginePromise } from '../engineHost.js'

/**
 * Full-screen 3D map. Mounts the singleton engine canvas once the lazy engine chunk has loaded
 * (StrictMode-safe: mount and unmount run in order on the same promise, and the engine ignores a second
 * mount on the same element and keeps its renderer between mounts).
 *
 * `onError({ kind: 'webgl' | 'load', error })`: WebGL could not start, or the engine chunk could not be downloaded.
 * `pulse` ({ levelId, x, y } | null) draws the "you are here" pulse as a DOM overlay at the projected puck
 * position (PLAN.md 19.2), recomputed only when the engine renders, so the 3D scene stays idle.
 */
export function MapView({ onError, pulse }) {
  const hostRef = useRef(null)
  const pulseRef = useRef(null)
  const pulseAt = useRef(pulse)
  pulseAt.current = pulse

  useEffect(() => {
    const el = hostRef.current
    let failed = false
    enginePromise
      .then((e) => {
        try {
          e.mount(el)
        } catch (err) {
          // WebGL could not start on this phone
          failed = true
          onError?.({ kind: 'webgl', error: err })
        }
      })
      .catch((err) => {
        // the engine chunk could not be downloaded (offline, flaky network)
        failed = true
        onError?.({ kind: 'load', error: err })
      })
    return () => {
      enginePromise.then((e) => {
        if (!failed) e.unmount()
      }, () => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const place = () => {
      const div = pulseRef.current
      if (!div) return
      const p = pulseAt.current
      const s = p ? engine.projectToScreen({ levelId: p.levelId, x: p.x, y: p.y, h: 0.3 }) : null
      const host = hostRef.current
      // (the map ends at the bottom sheet's top edge: the App keeps --sheet-top)
      const sheetTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sheet-top'))
      const bottom = Number.isFinite(sheetTop) && host ? Math.min(host.clientHeight, sheetTop) : host?.clientHeight
      const inside = s && host && s.sx > 0 && s.sy > 0 && s.sx < host.clientWidth && s.sy < bottom
      // reduced motion: no pulse (its position lives in the animation keyframes, DESIGN-GLASS 9)
      if (!inside || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        div.style.display = 'none'
        return
      }
      div.style.display = 'block'
      div.style.setProperty('--pos', `translate(${s.sx.toFixed(1)}px, ${s.sy.toFixed(1)}px)`)
    }
    place()
    const off = engine.onRender(place)
    return off
  }, [pulse?.levelId, pulse?.x, pulse?.y])

  return (
    <div ref={hostRef} className="map-layer">
      <div ref={pulseRef} className="you-pulse" style={{ display: 'none' }} aria-hidden="true" />
    </div>
  )
}
