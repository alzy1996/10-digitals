import { createContext, forwardRef, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { t } from '../i18n/strings.js'
import {
  DRAG_SLOP_PX,
  canonicalSnap,
  computeSnapHeights,
  distinctSnaps,
  dragHeight,
  handleAction,
  isTopSnap,
  pickSnap,
  snapDuration,
  tapNext,
  velocityOf,
} from './sheetModel.js'

/**
 * The App's side of the sheets: `{ snap, setSnap(snap), lang, topLimit(): number, onLayout(layout) }`. Without it
 * (the debug gallery) a sheet keeps its own snap.
 */
export const SheetContext = createContext(null)

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** The text field an event comes from (input, textarea, contenteditable), or null. */
function editableOf(target) {
  const el = target instanceof Element ? target.closest('input, textarea, [contenteditable=""], [contenteditable="true"]') : null
  if (!el) return null
  if (el.tagName === 'INPUT' && /^(button|checkbox|radio|range|submit|reset|color|file|image)$/i.test(el.type)) return null
  return el
}
const fieldHasText = (el) => ('value' in el ? String(el.value).length > 0 : (el.textContent ?? '').length > 0)

/**
 * Row bottoms (px from the body's content top): the body's children, and the children of `[data-sheet-rows]`. A list's
 * section heading is not a place to cut (a cut there would show a heading with nothing under it).
 */
function collectRows(body, inner) {
  const origin = body.getBoundingClientRect().top - body.scrollTop
  const out = new Set()
  const walk = (el) => {
    for (const c of el.children) {
      if (c.hasAttribute('data-sheet-rows')) walk(c)
      else if (c.classList.contains('list-head')) continue
      else {
        const r = c.getBoundingClientRect()
        if (r.height > 0) out.add(Math.ceil(r.bottom - origin))
      }
    }
  }
  walk(inner)
  return [...out].sort((a, b) => a - b)
}

/**
 * Foldable bottom sheet over the always-visible 3D map (snap maths: ./sheetModel.js).
 *
 * Layout: the handle (a real 44 px button: a tap cycles peek -> half -> full, Enter / Space too), the `head` (the one row
 * that stays when the sheet is folded), the body (scrolls only at the top snap) and the pinned `footer` (the primary
 * action: always on screen at every snap). With `bodyAfterFooter` the body comes after the footer (navigate: Next stays
 * right under the step, the simulator block below it). Escape folds the sheet.
 *
 * At rest the sheet is exactly its snap height (it floats 12 px above the bottom edge, radius 28 on every corner). While
 * it moves (a drag of the handle / head, a drag of the body from its top, a snap animation) only transforms change: the
 * sheet box takes the taller of the two heights and slides (translateY), the footer slides the other way so it stays at
 * the visible bottom, and clip-paths hide what is below it; the box is set back to the snap height when it settles.
 * After each settle the sheet reports its visible rect (`onLayout`) so the App frames the map in the free area.
 */
export const Sheet = forwardRef(function Sheet(
  { children, head = null, footer = null, label, className = '', bodyAfterFooter = false, stretch = false, expandOnType = false, halfRatio = 0.5, lang: langProp },
  ref,
) {
  const ctx = useContext(SheetContext)
  const [ownSnap, setOwnSnap] = useState('half')
  // v0.5 wide layout: the sheet is docked in the side panel: always full height, no handle, no dragging
  const docked = Boolean(ctx?.docked)
  const dockedRef = useRef(docked)
  dockedRef.current = docked
  const snap = docked ? 'full' : (ctx?.snap ?? ownSnap)
  const lang = ctx?.lang ?? langProp ?? 'en'
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  const snapRef = useRef(snap)
  snapRef.current = snap
  /** the snap the sheet was last sent to (a new snap is animated by the snap effect, not jumped to by `measure`) */
  const appliedSnapRef = useRef(snap)
  const setSnap = useCallback((s) => (ctxRef.current?.setSnap ?? setOwnSnap)(s), [])

  const secRef = useRef(null)
  const gripRef = useRef(null)
  const headRef = useRef(null)
  const bodyRef = useRef(null)
  const innerRef = useRef(null)
  const footRef = useRef(null)
  /** measured snap heights ({ peek, half, full, ... }) and viewport metrics */
  const heightsRef = useRef(null)
  const metricsRef = useRef(null)
  const [heights, setHeights] = useState(null)
  /** the visible height now (moving or not), the settled one, the box height while moving */
  const visRef = useRef(null)
  const restRef = useRef(null)
  const motionRef = useRef(null)
  const dragRef = useRef(null)
  const suppressUntil = useRef(0)
  const lastLayout = useRef('')
  /** more content below what shows: false | 'fade' (top snap, or scrolled) | 'cue' (a lower snap) */
  const [more, setMore] = useState(false)
  const bodyId = useId()
  const stretchRef = useRef(stretch)
  /** the half snap's share of the viewport (v0.5 home: a little taller, so the bento's first cards show at half) */
  const halfRatioRef = useRef(halfRatio)
  halfRatioRef.current = halfRatio
  stretchRef.current = stretch || docked
  const afterRef = useRef(bodyAfterFooter)
  afterRef.current = bodyAfterFooter

  const setSecRef = useCallback(
    (el) => {
      secRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) ref.current = el
    },
    [ref],
  )

  /**
   * More content below what shows: at the top snap (or once scrolled) the body's bottom fades; at a lower snap, where
   * the body is cut at a row boundary, a hairline and a small chevron under the last whole row say "pull up for more"
   * (no fade there: it would cut into that row).
   */
  const checkMore = useCallback(() => {
    const body = bodyRef.current
    const h = heightsRef.current
    if (!body || !h) return
    const top = isTopSnap(h, snapRef.current)
    const below = body.scrollHeight - body.clientHeight - body.scrollTop > 2
    const m = !below ? false : top || body.scrollTop > 0 ? 'fade' : body.clientHeight > 0 ? 'cue' : false
    setMore((x) => (x === m ? x : m))
  }, [])

  const publish = useCallback(() => {
    const m = metricsRef.current
    const h = heightsRef.current
    const v = restRef.current
    if (!m || !h || v == null) return
    const canon = canonicalSnap(h, snapRef.current)
    const layout = {
      top: m.vh - m.gap - v,
      height: v,
      bottomGap: m.gap,
      viewportH: m.vh,
      snap: canon,
      heights: h,
      // what the heights were computed from (test fixtures: tests/fixtures/sheet-measures.js)
      metrics: { chrome: m.chrome, bodyH: m.bodyH, rows: m.rows, topLimit: m.topLimit, stretch: stretchRef.current },
    }
    const key = `${Math.round(layout.top)}|${v}|${canon}|${h.peek}|${h.half}|${h.full}`
    if (key === lastLayout.current) return
    lastLayout.current = key
    ctxRef.current?.onLayout?.(layout)
  }, [])

  /** Rest state: the box is exactly the visible height, no transforms. */
  const applyRest = useCallback(
    (v) => {
      const sec = secRef.current
      const body = bodyRef.current
      const foot = footRef.current
      if (!sec || !body) return
      sec.classList.remove('is-moving')
      // after the first settle the content never re-plays its entry fade (no dim flash after a snap or a drag)
      sec.classList.add('sheet-settled')
      // (none at rest: a height change is never a transition, also not under the reduced-motion rule's 1 ms)
      sec.style.transition = 'none'
      sec.style.transform = ''
      sec.style.clipPath = ''
      sec.style.height = `${v}px`
      if (foot) {
        foot.style.transition = ''
        foot.style.transform = ''
      }
      body.style.transition = ''
      body.style.clipPath = ''
      restRef.current = v
      visRef.current = v
      const m = metricsRef.current
      // folded: nothing of the body shows, so nothing in it takes focus either
      body.inert = Boolean(m && v <= m.chrome + 1)
      document.documentElement.removeAttribute('data-sheet-moving')
      checkMore()
    },
    [checkMore],
  )

  /** Moving: the box is `H` tall, slid down so `v` px show; the footer stays at the visible bottom. */
  const applyMotion = useCallback((H, v, ms) => {
    const sec = secRef.current
    const body = bodyRef.current
    const foot = footRef.current
    if (!sec || !body) return
    const off = Math.max(0, H - v)
    const tr = (prop) => (ms ? `${prop} ${ms}ms var(--ease)` : 'none')
    if (!sec.classList.contains('is-moving')) {
      sec.classList.add('is-moving')
      document.documentElement.setAttribute('data-sheet-moving', '')
    }
    if (sec.style.height !== `${H}px`) sec.style.height = `${H}px`
    sec.style.transition = ms ? `${tr('transform')}, ${tr('clip-path')}` : 'none'
    sec.style.transform = `translateY(${off}px)`
    sec.style.clipPath = `inset(0 0 ${off}px 0 round var(--r-sheet))`
    if (foot && !afterRef.current) {
      foot.style.transition = tr('transform')
      foot.style.transform = `translateY(${-off}px)`
    }
    body.style.transition = tr('clip-path')
    body.style.clipPath = `inset(0 0 ${off}px 0)`
    visRef.current = v
  }, [])

  const measure = useCallback(() => {
    const sec = secRef.current
    const body = bodyRef.current
    const inner = innerRef.current
    if (!sec || !body || !inner || motionRef.current || dragRef.current?.started) return
    const app = sec.offsetParent ?? document.documentElement
    const vh = app.clientHeight || window.innerHeight
    const cs = getComputedStyle(sec)
    const gap = parseFloat(cs.bottom) || 0
    const chrome =
      (parseFloat(cs.paddingTop) || 0) +
      (parseFloat(cs.paddingBottom) || 0) +
      (parseFloat(cs.borderTopWidth) || 0) +
      (parseFloat(cs.borderBottomWidth) || 0) +
      (gripRef.current?.offsetHeight ?? 0) +
      (headRef.current?.offsetHeight ?? 0) +
      (footRef.current?.offsetHeight ?? 0)
    const bodyH = body.scrollHeight
    const rows = collectRows(body, inner)
    const topLimit = ctxRef.current?.topLimit?.() ?? 88
    const h = computeSnapHeights({ viewportH: vh, topLimit, bottomGap: gap, chrome, bodyH, rows, stretch: stretchRef.current, halfRatio: halfRatioRef.current })
    metricsRef.current = { vh, gap, chrome, bodyH, rows, topLimit }
    const prev = heightsRef.current
    heightsRef.current = h
    if (!prev || prev.peek !== h.peek || prev.half !== h.half || prev.full !== h.full) setHeights(h)
    if (appliedSnapRef.current !== snapRef.current) return
    const target = h[snapRef.current] ?? h.half
    if (restRef.current !== target) applyRest(target)
    else checkMore()
    publish()
  }, [applyRest, checkMore, publish])

  /** The visible height right now, also mid-animation (read back from the running transition). */
  const visibleNow = useCallback(() => {
    const sec = secRef.current
    const mo = motionRef.current
    if (!sec || !mo) return visRef.current
    const m = getComputedStyle(sec).transform
    const ty = m && m !== 'none' ? new DOMMatrixReadOnly(m).m42 : 0
    return mo.H - ty
  }, [])

  const finish = useCallback(
    (target) => {
      const mo = motionRef.current
      if (mo) clearTimeout(mo.timer)
      motionRef.current = null
      applyRest(target)
      const body = bodyRef.current
      // content scrolls only at the top snap: a folded sheet shows its body from the top
      if (body && heightsRef.current && !isTopSnap(heightsRef.current, snapRef.current)) body.scrollTop = 0
      measure()
      publish()
    },
    [applyRest, measure, publish],
  )

  /** Animate from the visible height now to `target` (transform only; instant under reduced motion). */
  const animateTo = useCallback(
    (target, boxH = 0) => {
      const sec = secRef.current
      if (!sec) return
      const from = visibleNow() ?? target
      const mo = motionRef.current
      if (mo) clearTimeout(mo.timer)
      const ms = snapDuration(reducedMotion())
      if (!ms || Math.abs(from - target) < 0.5) {
        motionRef.current = null
        finish(target)
        return
      }
      const H = Math.max(boxH, from, target, mo?.H ?? 0)
      // the sheet's entry animation would override the inline transform
      sec.style.animation = 'none'
      applyMotion(H, from, 0)
      void sec.offsetHeight
      applyMotion(H, target, ms)
      motionRef.current = { target, H, timer: setTimeout(() => finish(target), ms + 40) }
    },
    [applyMotion, finish, visibleNow],
  )

  // ------------------------------------------------------------------ measure: mount, content and viewport changes
  useLayoutEffect(() => {
    measure()
  })
  useEffect(() => {
    const els = [innerRef.current, headRef.current, footRef.current].filter(Boolean)
    // re-measure on the next frame, outside the ResizeObserver delivery (resizing the sheet from inside it would
    // leave the App's observer of the sheet with an undelivered notification)
    let raf = 0
    const later = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        measure()
      })
    }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(later) : null
    for (const el of els) ro?.observe(el)
    window.addEventListener('resize', later)
    return () => {
      ro?.disconnect()
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', later)
    }
  }, [measure, head == null, footer == null])
  useEffect(
    () => () => {
      clearTimeout(motionRef.current?.timer)
      document.documentElement.removeAttribute('data-sheet-moving')
    },
    [],
  )

  // ------------------------------------------------------------------ snap changes (tap, keyboard, App, test hook)
  useLayoutEffect(() => {
    const h = heightsRef.current
    appliedSnapRef.current = snap
    if (!h || dragRef.current?.started) return
    const target = h[snap] ?? h.half
    if (motionRef.current && Math.abs(motionRef.current.target - target) < 0.5) return
    if (restRef.current == null) {
      applyRest(target)
      publish()
      return
    }
    if (!motionRef.current && Math.abs((visRef.current ?? target) - target) < 0.5) {
      checkMore()
      publish()
      return
    }
    animateTo(target)
  }, [snap, animateTo, applyRest, checkMore, publish])

  // ------------------------------------------------------------------ dragging
  const beginDrag = useCallback(
    (d) => {
      const h = heightsRef.current
      if (!h) return false
      const v0 = visibleNow()
      const mo = motionRef.current
      if (mo) clearTimeout(mo.timer)
      motionRef.current = null
      const sec = secRef.current
      sec.style.animation = 'none'
      d.v0 = v0
      d.H = Math.max(h.full, v0, mo?.H ?? 0)
      d.started = true
      applyMotion(d.H, v0, 0)
      return true
    },
    [applyMotion, visibleNow],
  )

  const moveDrag = useCallback(
    (d, y, tms) => {
      d.samples.push({ t: tms, y })
      if (d.samples.length > 12) d.samples.shift()
      const v = dragHeight(heightsRef.current, d.v0 - (y - d.y0))
      applyMotion(d.H, v, 0)
    },
    [applyMotion],
  )

  const endDrag = useCallback(
    (d, cancelled) => {
      if (!d?.started) return
      suppressUntil.current = performance.now() + 400
      const h = heightsRef.current
      const vel = cancelled ? 0 : velocityOf(d.samples)
      const target = pickSnap({ heights: h, h: visRef.current, velocity: vel })
      const changed = canonicalSnap(h, target) !== canonicalSnap(h, snapRef.current)
      if (changed) {
        // the new snap holds from now on (the App's state follows on its next render)
        snapRef.current = target
        appliedSnapRef.current = target
      }
      animateTo(h[target], d.H)
      if (changed) setSnap(target)
    },
    [animateTo, setSnap],
  )

  // handle and head: pointer events (touch, pen and mouse)
  const onGrabDown = useCallback(
    (e) => {
      if (dockedRef.current) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (dragRef.current || !heightsRef.current) return
      const d = { id: e.pointerId, y0: e.clientY, started: false, samples: [{ t: e.timeStamp, y: e.clientY }], el: e.currentTarget }
      dragRef.current = d
      const move = (ev) => {
        if (ev.pointerId !== d.id) return
        if (!d.started) {
          if (Math.abs(ev.clientY - d.y0) < DRAG_SLOP_PX) return
          try {
            d.el.setPointerCapture(d.id)
          } catch {
            // the pointer is gone already
          }
          if (!beginDrag(d)) return
        }
        if (ev.cancelable) ev.preventDefault()
        // every finger position since the last frame counts for the velocity (moves are coalesced per frame)
        const all = typeof ev.getCoalescedEvents === 'function' ? ev.getCoalescedEvents() : []
        for (const c of all.slice(0, -1)) d.samples.push({ t: c.timeStamp, y: c.clientY })
        moveDrag(d, ev.clientY, ev.timeStamp)
      }
      const up = (ev) => {
        if (ev.pointerId !== d.id) return
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        dragRef.current = null
        // the release counts for the velocity: a finger that stopped before lifting is not a flick
        if (d.started) d.samples.push({ t: ev.timeStamp, y: ev.clientY })
        endDrag(d, ev.type === 'pointercancel')
      }
      window.addEventListener('pointermove', move, { passive: false })
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    },
    [beginDrag, moveDrag, endDrag],
  )

  // body: touch events, so a drag can take over from native scrolling (iOS has no pan-up / pan-down). The gesture
  // follows its first finger only (by identifier): a second finger neither ends nor restarts it, and a gesture whose
  // finger is gone (no touchend came) is ended by the next touch, so the sheet can never stay stuck mid-drag.
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return undefined
    let bt = null
    const find = (list, id) => {
      for (let i = 0; i < (list?.length ?? 0); i++) if (list[i].identifier === id) return list[i]
      return null
    }
    const finish = (e, cancelled) => {
      const b = bt
      bt = null
      if (b?.mode !== 'sheet') return
      if (dragRef.current === b.d) dragRef.current = null
      const tch = find(e?.changedTouches, b.id)
      if (tch && !cancelled) b.d.samples.push({ t: e.timeStamp, y: tch.clientY })
      endDrag(b.d, cancelled)
    }
    const start = (e) => {
      if (dockedRef.current) return
      if (bt) {
        // another finger while the first is down: ignored (the first finger keeps the gesture)
        if (find(e.touches, bt.id)) return
        // the first finger is gone without a touchend: end its gesture where it is
        finish(null, true)
      }
      const d0 = dragRef.current
      if (d0?.id === 'touch') {
        // safety net: a body drag left over with no live touch
        dragRef.current = null
        endDrag(d0, true)
      } else if (d0) return
      if (e.touches.length !== 1) return
      const t0 = e.touches[0]
      bt = { id: t0.identifier, y0: t0.clientY, t0: e.timeStamp, mode: null, d: null }
    }
    const move = (e) => {
      if (!bt) return
      const tch = find(e.touches, bt.id)
      if (!tch) return
      const y = tch.clientY
      if (bt.mode === null) {
        const dy = y - bt.y0
        if (Math.abs(dy) < 3) return
        const h = heightsRef.current
        const top = h ? isTopSnap(h, snapRef.current) : true
        // down at the top of the content folds the sheet; up expands it until it is at its top snap; else scroll
        if (h && !dragRef.current && ((dy > 0 && body.scrollTop <= 0) || (dy < 0 && !top))) {
          const d = { id: 'touch', y0: bt.y0, started: false, samples: [{ t: bt.t0, y: bt.y0 }] }
          if (!e.cancelable || !beginDrag(d)) {
            bt.mode = 'scroll'
            return
          }
          dragRef.current = d
          bt.d = d
          bt.mode = 'sheet'
        } else bt.mode = 'scroll'
      }
      if (bt.mode === 'sheet') {
        if (e.cancelable) e.preventDefault()
        moveDrag(bt.d, y, e.timeStamp)
      }
    }
    const end = (e) => {
      if (!bt) return
      // only the gesture's own finger ends it (a second finger lifting does not); touchcancel ends it anyway
      if (e.type !== 'touchcancel' && !find(e.changedTouches, bt.id)) return
      finish(e, e.type === 'touchcancel')
    }
    body.addEventListener('touchstart', start, { passive: true })
    body.addEventListener('touchmove', move, { passive: false })
    body.addEventListener('touchend', end)
    body.addEventListener('touchcancel', end)
    const onScroll = () => checkMore()
    body.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      body.removeEventListener('touchstart', start)
      body.removeEventListener('touchmove', move)
      body.removeEventListener('touchend', end)
      body.removeEventListener('touchcancel', end)
      body.removeEventListener('scroll', onScroll)
      if (bt?.mode === 'sheet' && dragRef.current === bt.d) dragRef.current = null
      bt = null
    }
  }, [beginDrag, moveDrag, endDrag, checkMore])

  // ------------------------------------------------------------------ handle tap, keyboard
  const onGripClick = () => {
    if (performance.now() < suppressUntil.current) return
    const h = heightsRef.current
    if (!h) return
    const next = tapNext(h, snapRef.current)
    if (canonicalSnap(h, next) !== canonicalSnap(h, snapRef.current)) setSnap(next)
  }

  const onKeyDown = (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || dockedRef.current) return
    // Escape in a text field that has text is the field's own (a search box clears it): the sheet stays
    const field = editableOf(e.target)
    if (field && fieldHasText(field)) return
    const h = heightsRef.current
    if (!h) return
    const low = distinctSnaps(h)[0].snap
    if (canonicalSnap(h, snapRef.current) === low) return
    e.stopPropagation()
    setSnap('peek')
    gripRef.current?.focus({ preventScroll: true })
  }
  // Escape also folds when nothing has focus (after a tap on the map or a drag of the handle, focus is on <body>);
  // a focused control elsewhere keeps Escape for itself
  const onKeyDownRef = useRef(onKeyDown)
  onKeyDownRef.current = onKeyDown
  useEffect(() => {
    const onDocKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const ae = document.activeElement
      if (ae && ae !== document.body && ae !== document.documentElement) return
      onKeyDownRef.current(e)
    }
    document.addEventListener('keydown', onDocKey)
    return () => document.removeEventListener('keydown', onDocKey)
  }, [])

  // search: typing (or focusing the field) in a folded sheet brings it up to full, where the results show
  const expandForTyping = (e) => {
    if (!expandOnType || !editableOf(e.target)) return
    const h = heightsRef.current
    if (!h || isTopSnap(h, snapRef.current)) return
    setSnap('full')
  }

  // a drag that started on a button inside the head does not also press it
  const onClickCapture = (e) => {
    if (performance.now() < suppressUntil.current) {
      e.stopPropagation()
      e.preventDefault()
    }
  }

  const canon = heights ? canonicalSnap(heights, snap) : snap
  // a sheet too short to fold has one snap: its handle does nothing, so it is not offered to assistive tech or Tab
  const single = Boolean(heights) && distinctSnaps(heights).length === 1
  const action = heights ? handleAction(heights, snap) : 'fold'
  const gripLabel = t(action === 'expand' ? 'sheet.expand' : 'sheet.fold', lang)
  const foot = footer ? (
    // a drag that starts on the footer moves the sheet too (a press without movement is a tap on its button)
    <div ref={footRef} className="sheet-footer" onPointerDown={onGrabDown}>
      {footer}
    </div>
  ) : null

  return (
    <section
      ref={setSecRef}
      className={`sheet sheet-snap${docked ? ' sheet-docked' : ''} ${className}`}
      aria-label={label}
      data-snap={canon}
      onKeyDown={onKeyDown}
      onClickCapture={onClickCapture}
      onFocus={expandOnType ? expandForTyping : undefined}
      onInput={expandOnType ? expandForTyping : undefined}
    >
      {docked ? null : (
      <button
        ref={gripRef}
        type="button"
        className="sheet-grip"
        // the state matches the label: "Expand panel" = collapsed (more to show), "Fold panel" = expanded
        aria-expanded={single ? undefined : action === 'fold'}
        aria-controls={single ? undefined : bodyId}
        aria-label={single ? undefined : gripLabel}
        aria-hidden={single || undefined}
        tabIndex={single ? -1 : undefined}
        title={single ? undefined : gripLabel}
        onPointerDown={onGrabDown}
        // (a one-snap handle never takes focus on a mouse press either: it is hidden from assistive tech)
        onMouseDown={single ? (e) => e.preventDefault() : undefined}
        onClick={onGripClick}
      >
        <span className="sheet-handle" aria-hidden="true" />
      </button>
      )}
      {head ? (
        <div ref={headRef} className="sheet-head" onPointerDown={onGrabDown}>
          {head}
        </div>
      ) : null}
      {bodyAfterFooter ? foot : null}
      <div ref={bodyRef} id={bodyId} className={`sheet-body${more === 'fade' ? ' has-more' : ''}`}>
        <div ref={innerRef} className="sheet-body-inner">
          {children}
        </div>
      </div>
      {more === 'cue' ? <div className="sheet-more-cue" aria-hidden="true" /> : null}
      {bodyAfterFooter ? null : foot}
    </section>
  )
})
