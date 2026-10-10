import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { t } from '../i18n/strings.js'
import { CATEGORY_COLORS } from '../engine/tokens.js'
import { alongRouteM, levelRouteParts } from './hudModel.js'
import './hud.css'

/** Mini-map scale (DESIGN-GLASS.md 7.3). */
const PX_PER_M = 3.2
/** The you-dot sits at this fraction of the map content height (dome top to the bar's top). */
const YOU_AT = 0.62
/** Dome shape, the same as the CSS clip-path: ellipse(78% 100% at 50% 100%). */
const RX = 0.78
const GLASS = [255, 255, 255]

function hexRgb(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function mix(a, b, k) {
  const A = hexRgb(a)
  const B = hexRgb(b)
  return `rgb(${A.map((v, i) => Math.round(v * (1 - k) + B[i] * k)).join(',')})`
}
function polyPath(pts) {
  const p = new Path2D()
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)))
  p.closePath()
  return p
}

// toy world: cream corridors, pastel shops, light-blue voids; the route is the one saturated colour (ref 5)
const WALK_FILL = '#FBF8F2'
const BLOCK_FILL = '#D5DDE9'
const VOID_FILL = '#BFE3FF'
const levelArtCache = new WeakMap()

/**
 * Per-level drawing lists in venue metres (Path2D built once per venue): floor base, parking zone tints, walkable
 * areas, cores / voids, and units tinted by category (DESIGN-GLASS.md 7.3).
 */
function levelArt(index) {
  if (!index) return new Map()
  const hit = levelArtCache.get(index)
  if (hit) return hit
  const v = index.venue
  const out = new Map()
  for (const level of index.levels) out.set(level.id, { fills: [], edges: [], rails: [] })
  const add = (levelId, pts, fill) => out.get(levelId)?.fills.push({ path: polyPath(pts), fill })
  for (const level of index.levels) add(level.id, level.outline, '#E9EEF5')
  for (const z of v.parking?.zones ?? []) add(z.levelId, z.polygon, mix('#E9EEF5', z.color, 0.35))
  for (const a of v.areas ?? []) {
    if (a.kind === 'bays') continue // the zone tint shows through
    if (a.kind === 'void') {
      add(a.levelId, a.polygon, VOID_FILL)
      out.get(a.levelId)?.rails.push(polyPath(a.polygon))
      continue
    }
    add(a.levelId, a.polygon, a.walkable ? (a.kind === 'outdoor' ? '#DDE6F0' : WALK_FILL) : BLOCK_FILL)
  }
  for (const u of v.units ?? []) {
    const occ = u.occupantId ? index.occupantById.get(u.occupantId) : null
    const fill = occ && CATEGORY_COLORS[occ.category] ? mix('#FFFFFF', CATEGORY_COLORS[occ.category], 0.35) : BLOCK_FILL
    const path = polyPath(u.polygon)
    out.get(u.levelId)?.fills.push({ path, fill })
    out.get(u.levelId)?.edges.push(path)
  }
  levelArtCache.set(index, out)
  return out
}

const FLAG_POLE = new Path2D('M6.2 21.2V3.4')
const FLAG = new Path2D('M6.2 4h11.3a.7.7 0 0 1 .6 1.05L15.9 8.6l2.2 3.55a.7.7 0 0 1-.6 1.05H6.2z')
const CAR_ROOF = new Path2D('M5 11.5 6.8 6.6A1.5 1.5 0 0 1 8.2 5.6h7.6a1.5 1.5 0 0 1 1.4 1l1.8 4.9')
const CAR_BODY = new Path2D('M4 12.5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v4.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z')

function disc(ctx, x, y, r, fill) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
}

/**
 * Half-dome mini-map (DESIGN-GLASS.md 7.3, ref 5), Canvas2D from venue data (works without WebGL): the current
 * floor's units and corridors, the route on this floor (walked part grey), the connector the route leaves by, the
 * destination flag, the car, and the blue you-dot with its 60° view cone. **Heading-up**: the map turns so the view
 * direction points up (the camera heading from the engine's anchors, so looking around turns it too). The N chip rides
 * the rim line itself, half over the scene (the route ahead always runs to the top centre: it never hides it), and
 * `levelChip` (the floor you are on) sits in the dome's start corner above the bar. In Arabic the map is not mirrored. Redraws only when the walker moves (once per animation frame at most),
 * the heading, the floor, the route, the size or the language changes: idle = no redraw. devicePixelRatio aware
 * (capped at 2). The whole dome is a button: tap = Map.
 *
 * @param {{ index: object, lang: 'en'|'ar', route: object|null, levelId: string,
 *   position: { levelId: string, x: number, y: number } | null, headingDeg?: number, distanceDoneM?: number,
 *   car?: { levelId: string, x: number, y: number } | null,
 *   onAnchors?: (cb: (anchors: object) => void) => (() => void), onOpen?: Function, className?: string,
 *   levelChip?: import('react').ReactNode }} props
 *   position / headingDeg: where you stand until the engine reports the walker and the camera (hudModel.standPoint).
 */
export function MiniMapDome({ index, lang, route, levelId, position, headingDeg = 0, distanceDoneM = null, car = null, onAnchors, onOpen, className = '', levelChip = null }) {
  const domeRef = useRef(null)
  const canvasRef = useRef(null)
  const northRef = useRef(null)
  const chevRef = useRef(null)
  const size = useRef({ w: 0, h: 0, pad: 84, dpr: 1 })
  const live = useRef(null)
  const raf = useRef(0)
  const art = useMemo(() => levelArt(index), [index])
  const props = useRef(null)
  props.current = { route, levelId, position, headingDeg, distanceDoneM, car }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const { w: W, h: H, pad, dpr } = size.current
    if (!canvas || W < 2 || H < 2) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const P = props.current
    const L = live.current
    const pos = L && L.x != null ? L : P.position
    const level = (L && L.levelId) || pos?.levelId || P.levelId
    const heading = L && Number.isFinite(L.heading) ? L.heading : (P.headingDeg ?? 0)
    const contentH = Math.max(40, H - pad)
    const cx = W / 2
    const cy = contentH * YOU_AT
    const rx = RX * W
    const ry = H
    const ex = W / 2
    const ey = H
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2)
    ctx.clip()

    // ---- map in venue metres: heading-up rotation about the you-point
    const s = PX_PER_M
    const h = ((heading || 0) * Math.PI) / 180
    const cos = Math.cos(h)
    const sin = Math.sin(h)
    const px = pos?.x ?? 0
    const py = pos?.y ?? 0
    const a = s * cos
    const b = -s * sin
    const c = -s * sin
    const d = -s * cos
    const e = cx - (a * px + c * py)
    const f = cy - (b * px + d * py)
    const toScreen = (x, y) => [a * x + c * y + e, b * x + d * y + f]
    const L2 = art.get(level)
    if (L2 && pos) {
      ctx.setTransform(dpr * a, dpr * b, dpr * c, dpr * d, dpr * e, dpr * f)
      for (const it of L2.fills) {
        ctx.fillStyle = it.fill
        ctx.fill(it.path)
      }
      ctx.lineWidth = 1 / s
      ctx.strokeStyle = 'rgba(29,36,51,0.10)'
      for (const p of L2.edges) ctx.stroke(p)
      ctx.strokeStyle = 'rgba(29,36,51,0.22)'
      for (const p of L2.rails) ctx.stroke(p)

      // route on this floor: walked part grey, the rest teal with a soft glow
      if (P.route) {
        const done = alongRouteM(P.route, { levelId: level, x: px, y: py }, P.distanceDoneM)
        const parts = levelRouteParts(P.route, level, L && L.x != null ? done : (P.distanceDoneM ?? done))
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        const strokeAll = (lines, width, style) => {
          ctx.lineWidth = width / s
          ctx.strokeStyle = style
          for (const line of lines) {
            ctx.beginPath()
            line.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
            ctx.stroke()
          }
        }
        strokeAll(parts.walked, 4, 'rgba(154,166,178,0.6)')
        strokeAll(parts.ahead, 14, 'rgba(34,211,197,0.30)')
        strokeAll(parts.ahead, 5, '#1FC7B4')
      }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // ---- markers in screen space: the connector the route leaves by, the car, the destination
    if (P.route && pos) {
      for (const step of P.route.steps) {
        const cn = step.connector
        if (step.kind !== 'connector' || cn?.fromLevelId !== level || !Number.isInteger(cn.boardIndex)) continue
        const pt = P.route.points[cn.boardIndex]
        if (!pt) continue
        const [sx, sy] = toScreen(pt.x, pt.y)
        ctx.beginPath()
        ctx.arc(sx, sy, 8, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(38,217,199,0.18)'
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = '#1FC7B4'
        ctx.stroke()
      }
    }
    if (P.car && P.car.levelId === level && pos) {
      const [sx, sy] = toScreen(P.car.x, P.car.y)
      disc(ctx, sx, sy, 12, '#FFFFFF')
      disc(ctx, sx, sy, 11, '#F5B700')
      ctx.save()
      ctx.translate(sx - 7, sy - 7.5)
      ctx.scale(14 / 24, 14 / 24)
      ctx.fillStyle = '#0B0F14'
      ctx.strokeStyle = '#0B0F14'
      ctx.lineWidth = 2.6
      ctx.lineCap = 'round'
      ctx.stroke(CAR_ROOF)
      ctx.fill(CAR_BODY)
      ctx.restore()
    }
    const last = P.route?.points?.[P.route.points.length - 1]
    // a trip back to the car: the car marker is the destination (no flag on top of it)
    const toCar = Boolean(last && P.car && P.car.levelId === last.levelId && Math.hypot(P.car.x - last.x, P.car.y - last.y) < 4)
    if (last && last.levelId === level && pos && !toCar) {
      const [sx, sy] = toScreen(last.x, last.y)
      disc(ctx, sx, sy, 13, '#FFFFFF')
      disc(ctx, sx, sy, 11, '#5BE584')
      ctx.save()
      ctx.translate(sx - 6.5, sy - 7)
      ctx.scale(13 / 24, 13 / 24)
      ctx.strokeStyle = '#03200F'
      ctx.fillStyle = '#03200F'
      ctx.lineWidth = 2.8
      ctx.lineCap = 'round'
      ctx.stroke(FLAG_POLE)
      ctx.fill(FLAG)
      ctx.restore()
    }

    // ---- melt the map into the rim: a 70 px fade to the dome glass colour along the ellipse
    ctx.save()
    ctx.translate(ex, ey)
    ctx.scale(rx / ry, 1)
    const g = ctx.createRadialGradient(0, 0, Math.max(0, ry - 70), 0, 0, ry)
    g.addColorStop(0, `rgba(${GLASS},0)`)
    g.addColorStop(1, `rgba(${GLASS},0.94)`)
    ctx.fillStyle = g
    ctx.fillRect(-ry * 2, -ry * 2, ry * 4, ry * 4)
    ctx.restore()
    // ---- the bottom bar sits on the dome: the map fades into the glass above it (nothing busy behind the buttons)
    const gb = ctx.createLinearGradient(0, contentH - 12, 0, contentH + 16)
    gb.addColorStop(0, `rgba(${GLASS},0)`)
    gb.addColorStop(1, `rgba(${GLASS},0.94)`)
    ctx.fillStyle = gb
    ctx.fillRect(0, contentH - 12, W, H - contentH + 12)

    // ---- you: halo, white disc, blue dot, 60° view cone pointing up (the map is heading-up)
    if (pos) {
      const cone = ctx.createRadialGradient(cx, cy, 0, cx, cy, 54)
      cone.addColorStop(0, 'rgba(77,163,255,0.55)')
      cone.addColorStop(1, 'rgba(77,163,255,0)')
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, 54, -Math.PI / 2 - Math.PI / 6, -Math.PI / 2 + Math.PI / 6)
      ctx.closePath()
      ctx.fillStyle = cone
      ctx.fill()
      disc(ctx, cx, cy, 18, 'rgba(77,163,255,0.22)')
      ctx.shadowColor = 'rgba(0,0,0,0.45)'
      ctx.shadowBlur = 6
      disc(ctx, cx, cy, 9, '#FFFFFF')
      ctx.shadowBlur = 0
      disc(ctx, cx, cy, 6.5, '#4DA3FF')
    }
    ctx.restore()

    // ---- rim: a soft teal glow line, a crisp light edge, and bezel ticks every 5.6°
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(ex, ey, rx - 3, ry - 3, 0, Math.PI, Math.PI * 2)
    ctx.lineWidth = 6
    ctx.strokeStyle = 'rgba(94,242,220,0.25)'
    ctx.shadowColor = 'rgba(94,242,220,0.55)'
    ctx.shadowBlur = 8
    ctx.stroke()
    ctx.restore()
    ctx.beginPath()
    ctx.ellipse(ex, ey, rx - 0.75, ry - 0.75, 0, Math.PI, Math.PI * 2)
    ctx.lineWidth = 1.5
    ctx.strokeStyle = 'rgba(29,36,51,0.18)'
    ctx.stroke()
    ctx.fillStyle = 'rgba(29,36,51,0.25)'
    for (let deg = -90; deg <= 90; deg += 5.6) {
      const th = (deg * Math.PI) / 180
      const tx = ex + (rx - 7) * Math.sin(th)
      const ty = ey - (ry - 7) * Math.cos(th)
      if (tx < 4 || tx > W - 4 || ty > contentH) continue
      ctx.beginPath()
      ctx.arc(tx, ty, 1, 0, Math.PI * 2)
      ctx.fill()
    }

    // ---- N chip centred on the rim line, where north lies from the you-dot (never mirrored); pinned at the arc end
    // beyond it
    const north = northRef.current
    if (north) {
      const phi = ((-(heading || 0) % 360) + 540) % 360 - 180 // screen angle of north, clockwise from up
      const r = (phi * Math.PI) / 180
      const dx = Math.sin(r)
      const dy = -Math.cos(r)
      const ia = rx - 1
      const ib = ry - 1
      // ray (cx, cy) + t (dx, dy) against the inset ellipse
      const ox = (cx - ex) / ia
      const oy = (cy - ey) / ib
      const vx = dx / ia
      const vy = dy / ib
      const A = vx * vx + vy * vy
      const B = 2 * (ox * vx + oy * vy)
      const C = ox * ox + oy * oy - 1
      const disc2 = B * B - 4 * A * C
      let nx = cx
      let ny = 18
      let pinned = Math.abs(phi) > 80
      if (disc2 >= 0) {
        const tt = (-B + Math.sqrt(disc2)) / (2 * A)
        nx = cx + tt * dx
        ny = cy + tt * dy
      }
      const minX = 18
      const maxX = W - 18
      if (pinned || nx < minX || nx > maxX || ny > contentH - 8) {
        pinned = true
        // pinned at the arc end, far enough in that the outward chevron stays inside the dome
        nx = phi < 0 ? minX + 14 : maxX - 14
        const k = (nx - ex) / ia
        ny = ey - ib * Math.sqrt(Math.max(0, 1 - k * k))
      }
      north.style.transform = `translate3d(${(nx - 12).toFixed(1)}px, ${(ny - 12).toFixed(1)}px, 0)`
      if (pinned) north.dataset.pinned = ''
      else delete north.dataset.pinned
      if (chevRef.current) chevRef.current.style.transform = `translate(-50%, -50%) rotate(${phi.toFixed(1)}deg) translateY(-18px)`
    }
  }, [art])

  const schedule = useCallback(() => {
    if (raf.current) return
    raf.current = requestAnimationFrame(() => {
      raf.current = 0
      draw()
    })
  }, [draw])
  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current)
      raf.current = 0
    },
    [],
  )

  // size: CSS size x min(devicePixelRatio, 2); the map content ends at the bar's top (the dome's bottom padding)
  useLayoutEffect(() => {
    const el = domeRef.current
    const canvas = canvasRef.current
    if (!el || !canvas) return undefined
    const measure = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = el.clientWidth
      const h = el.clientHeight
      const pad = parseFloat(getComputedStyle(el).paddingBottom) || 84
      if (w === size.current.w && h === size.current.h && dpr === size.current.dpr && pad === size.current.pad) return
      size.current = { w, h, pad, dpr }
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      draw()
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [draw])

  // redraw when what it shows changes (never on a timer)
  useEffect(() => {
    schedule()
  }, [schedule, route, levelId, position?.levelId, position?.x, position?.y, headingDeg, distanceDoneM, car?.levelId, car?.x, car?.y, lang])

  // the engine's anchors (every rendered frame, none when idle): the walker's map position and the camera heading
  useEffect(() => {
    if (!onAnchors) return undefined
    return onAnchors((anchors) => {
      if (!anchors) return
      const w = anchors.walker
      const prev = live.current
      const next = {
        x: w ? w.mapX : null,
        y: w ? w.mapY : null,
        levelId: w ? w.levelId : null,
        heading: anchors.camera?.headingDeg,
      }
      const moved =
        !prev ||
        prev.levelId !== next.levelId ||
        (next.x == null) !== (prev.x == null) ||
        Math.abs((next.x ?? 0) - (prev.x ?? 0)) > 0.03 ||
        Math.abs((next.y ?? 0) - (prev.y ?? 0)) > 0.03 ||
        Math.abs((((next.heading ?? 0) - (prev.heading ?? 0) + 540) % 360) - 180) > 0.3
      if (!moved) return
      live.current = next
      schedule()
    })
  }, [onAnchors, schedule])

  return (
    <div className={`dome-wrap ${className}`}>
      <button
        ref={domeRef}
        type="button"
        className="dome"
        onClick={(e) => {
          // a pointer tap in the bar's strip (just above, beside or under the buttons) is a near miss, not "open the
          // map" (keyboard activation has detail 0)
          const r = domeRef.current?.getBoundingClientRect()
          if (r && e.detail > 0 && e.clientY > r.bottom - size.current.pad - 16) return
          onOpen?.()
        }}
        aria-label={t('hud.openMap', lang)}
      >
        <canvas ref={canvasRef} aria-hidden="true" />
      </button>
      <span ref={northRef} className="dome-north" role="img" aria-label={t('hud.northLabel', lang)} lang={lang}>
        {t('hud.north', lang)}
        <span ref={chevRef} className="dome-north-chev" aria-hidden="true" />
      </span>
      {levelChip ? <span className="dome-level">{levelChip}</span> : null}
    </div>
  )
}
