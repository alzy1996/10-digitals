import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { t } from '../i18n/strings.js'
import { Icon } from './icons.jsx'
import { placeBubble } from './hudModel.js'
import './hud.css'

/** Under this many metres to the turn the bubble shows its icon alone (the turn card above still says it). */
const NEAR_M = 6
/**
 * ...and to the destination: its sign is in view and names it, as does the card (one marker per turn, DESIGN-GLASS
 * 6.5): the icon alone, which never covers the sign.
 */
const ARRIVE_NEAR_M = 30

/**
 * Floating turn bubble (DESIGN-GLASS.md 6.5, ref 5): frost glass with dark ink, anchored in the 3D scene at the top of
 * the target ring's light beam. It is positioned from the engine's anchors on every rendered frame by writing
 * `transform` straight to the DOM (never React state per frame, never a render of its own: idle = no work).
 * - The 34 px icon disc sits on the anchor; the box hangs above and toward the inline end, flips below / to the other
 *   side near the free area's edges and never covers the top HUD, the dome or the bar.
 * - Off screen: a 44 px frost pill at the free area's left / right edge (the side the turn really is, never mirrored);
 *   behind you: a pill at the bottom centre.
 * - Within 6 m of the turn (30 m of the destination, whose sign is then in view): the icon alone (`keepBox`: waiting at the lift doors, the box keeps
 *   "Press “B1”"); and no edge pill then (the view turns into the corner early, the point slides off the far side):
 *   hidden, the turn card says it.
 *
 * @param {{ lang: 'en'|'ar',
 *   content: { icon: string, title: string, sub: string|null, kind: 'turn'|'connector'|'arrive' },
 *   onAnchors?: (cb: (anchors: object) => void) => (() => void),
 *   getAnchors?: () => object,
 *   free: { top: number, bottom: number, left: number, right: number } | null,
 *   hidden?: boolean }} props
 *   content: hudModel.bubbleContent(); onAnchors / getAnchors: engine.onAnchors / engine.getAnchors (CONTRACT 3b);
 *   free: the free area between the top HUD and the dome, in the map container's CSS px.
 */
export function TurnBubble({ lang, content, onAnchors, getAnchors, free, hidden = false, keepBox = false }) {
  const rootRef = useRef(null)
  const boxRef = useRef(null)
  const edgeRef = useRef(null)
  const size = useRef({ w: 0, h: 0 })
  const last = useRef({ mode: '', near: null, side: '', below: null, t: '', b: '' })
  const freeRef = useRef(free)
  freeRef.current = free
  const hiddenRef = useRef(hidden)
  hiddenRef.current = hidden
  const keepRef = useRef(keepBox)
  keepRef.current = keepBox
  const nearMRef = useRef(NEAR_M)
  nearMRef.current = content?.kind === 'arrive' ? ARRIVE_NEAR_M : NEAR_M
  const rtl = lang === 'ar'

  const place = useCallback(
    (anchors) => {
      const root = rootRef.current
      const box = boxRef.current
      if (!root || !box) return
      const L = last.current
      const anchor = anchors && anchors.mode === 'fpv' ? anchors.nextTurn : null
      const near = !keepRef.current && Number.isFinite(anchor?.distanceM) && anchor.distanceM < nearMRef.current
      const p = hiddenRef.current || !freeRef.current ? { mode: 'hidden' } : placeBubble(anchor, size.current, freeRef.current, { rtl, near })
      // attribute writes only when something changed; one transform write per frame
      if (L.mode !== p.mode) {
        root.dataset.mode = p.mode
        L.mode = p.mode
      }
      if (p.mode === 'hidden') return
      const tr = `translate3d(${p.x}px, ${p.y}px, 0)`
      if (L.t !== tr) {
        root.style.transform = tr
        L.t = tr
      }
      const side = p.side ?? ''
      if (L.side !== side) {
        root.dataset.side = side
        L.side = side
        edgeRef.current?.setAttribute('aria-label', t(side === 'left' ? 'hud.edgeLeft' : 'hud.edgeRight', lang))
      }
      if (p.mode === 'anchored') {
        const bt = `translate3d(${p.boxDx}px, ${p.boxDy}px, 0)`
        if (L.b !== bt) {
          box.style.transform = bt
          L.b = bt
        }
        if (L.near !== near) {
          if (near) root.dataset.near = ''
          else delete root.dataset.near
          L.near = near
        }
      }
    },
    [rtl, lang],
  )

  // measure the box when its text changes (then position it at once from the last frame's anchors)
  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    size.current = { w: box.offsetWidth, h: box.offsetHeight }
    last.current.b = ''
    last.current.side = ''
    place(getAnchors ? getAnchors() : null)
  }, [content?.title, content?.sub, content?.kind, lang, hidden, keepBox, free?.top, free?.bottom, free?.left, free?.right, place, getAnchors])

  // re-measure when the box itself changes size (web fonts arriving, language switch), then re-place
  useEffect(() => {
    const box = boxRef.current
    if (!box || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => {
      const w = box.offsetWidth
      const h = box.offsetHeight
      if (w === size.current.w && h === size.current.h) return
      size.current = { w, h }
      last.current.b = ''
      place(getAnchors ? getAnchors() : null)
    })
    ro.observe(box)
    return () => ro.disconnect()
  }, [place, getAnchors])

  useEffect(() => {
    if (!onAnchors) return undefined
    return onAnchors(place)
  }, [onAnchors, place])

  const icon = content?.icon ?? 'turn_straight'
  const contentKey = `${content?.title}|${content?.sub}|${lang}`
  return (
    <div ref={rootRef} className="tb" data-mode="hidden" data-kind={content?.kind ?? 'turn'}>
      <span className="tb-icon" aria-hidden="true">
        <Icon name={icon} size={20} />
      </span>
      <div ref={boxRef} className="tb-box" dir={rtl ? 'rtl' : 'ltr'} lang={lang} aria-hidden="true">
        <span className="tb-in" key={contentKey}>
          <span className="tb-title">{content?.title}</span>
          {content?.sub ? <span className="tb-sub">{content.sub}</span> : null}
        </span>
      </div>
      <span ref={edgeRef} className="tb-pill is-edge" role="img" aria-label={t('hud.edgeRight', lang)}>
        <span className="tb-mini">
          <Icon name={icon} size={18} />
        </span>
        <Icon name="chevron" size={20} className="tb-chev" />
      </span>
      <span className="tb-pill is-behind" role="img" aria-label={t('hud.behind', lang)}>
        <Icon name="turn_uturn" size={24} />
      </span>
    </div>
  )
}
