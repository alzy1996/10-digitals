import { forwardRef, useEffect, useRef, useState } from 'react'

/**
 * Bottom sheet over the always-visible 3D map. `maxHeight` keeps the map in view (navigate: <= 47%, Arabic 49%).
 * The App measures the sheet (via the forwarded ref) to tell the engine how much of the screen is free.
 * `footer` (the screen's primary button) stays pinned at the bottom, fully visible; with `scroll` the rest
 * scrolls above it on short screens (a browser tab on a phone is much shorter than the phone), and a soft edge
 * over the footer shows when there is more to scroll to.
 */
export const Sheet = forwardRef(function Sheet({ children, maxHeight = '60%', label, className = '', scroll = false, footer = null }, ref) {
  const scrollRef = useRef(null)
  const [more, setMore] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return undefined
    const check = () => setMore(el.scrollHeight - el.clientHeight - el.scrollTop > 2)
    check()
    el.addEventListener('scroll', check, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null
    if (ro) {
      ro.observe(el)
      for (const c of el.children) ro.observe(c)
    }
    return () => {
      el.removeEventListener('scroll', check)
      ro?.disconnect()
    }
  }, [scroll, children])

  return (
    <section ref={ref} className={`sheet ${className}`} style={{ maxHeight }} aria-label={label}>
      <div className="sheet-handle" aria-hidden="true" />
      {scroll ? (
        <div ref={scrollRef} className="sheet-scroll">
          {children}
        </div>
      ) : (
        children
      )}
      {footer ? <div className={`sheet-footer${more ? ' has-more' : ''}`}>{footer}</div> : null}
    </section>
  )
})
