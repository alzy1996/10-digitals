// Draws a nail outline with the SAME math as the shader, so the icon matches the try-on exactly.
import { SHAPE_BY_KEY } from '../../data/nails/taxonomy.js'

function halfWidthAt(y, w, Lt, sh) {
  if (y < 0 || y > Lt) return -1
  const rc = Math.min(0.62 * w, 0.4 * Lt)
  let hw = w
  if (y < rc) {
    const t = (rc - y) / rc
    hw = w * Math.sqrt(Math.max(0, 1 - t * t))
  }
  const tStart = Lt * (0.55 + (0.25 - 0.55) * Math.max(sh.point, sh.coffin * 0.6))
  if (y > tStart) {
    const t = (y - tStart) / Math.max(Lt - tStart, 1)
    hw *= 1 - sh.taper * (sh.coffin > 0.5 ? t : t * t)
  }
  const wt = hw
  let tz
  let rr
  if (sh.point > 0) {
    tz = Math.min(wt * (1 + (3.4 - 1) * sh.point), (Lt - rc) * 0.85)
    rr = wt
  } else {
    rr = sh.tipRound * wt
    tz = rr
  }
  const yT = Lt - tz
  if (y > yT && tz > 0.5) {
    const t = Math.min(1, Math.max(0, (y - yT) / tz))
    const a = 2 + (1.15 - 2) * sh.point
    const b = 0.5 + (1.3 - 0.5) * sh.point
    hw = wt - rr + rr * Math.pow(Math.max(0, 1 - Math.pow(t, a)), b)
  }
  return hw
}

export function nailOutlinePath(shapeKey, length, W = 24, H = 40) {
  const sh = SHAPE_BY_KEY[shapeKey] || SHAPE_BY_KEY.natural
  const natural = H / (1 + Math.max(length, sh.minLen) * 0.95)
  const ext = Math.max(length, sh.minLen) * natural * 0.95
  const Lt = natural + ext
  const w = W / 2 - 1
  const pts = []
  const N = 40
  for (let i = 0; i <= N; i++) {
    const y = (i / N) * Lt
    const hw = Math.max(0, halfWidthAt(y, w, Lt, sh))
    pts.push([W / 2 + hw, H - y])
  }
  for (let i = N; i >= 0; i--) {
    const y = (i / N) * Lt
    const hw = Math.max(0, halfWidthAt(y, w, Lt, sh))
    pts.push([W / 2 - hw, H - y])
  }
  return 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L') + ' Z'
}

export function ShapeIcon({ shape, length = 0.35, size = 30, color = 'currentColor', fill = 'none' }) {
  const W = 24
  const H = 40
  return (
    <svg width={size * 0.6} height={size} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path d={nailOutlinePath(shape, length, W, H)} fill={fill} stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}
