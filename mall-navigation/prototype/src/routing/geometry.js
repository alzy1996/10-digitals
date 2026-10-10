/**
 * Small 2D helpers for routing and instructions. Venue-local metres (x = east, y = north).
 * Angles are compass degrees: 0 = north (+y), 90 = east (+x), clockwise positive.
 * Pure JS, no DOM.
 *
 * @typedef {[number, number]} XY
 */

const RAD = 180 / Math.PI

/** Euclidean distance between two points. */
export function dist(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

/** Normalise any angle to [0, 360). */
export function normDeg(deg) {
  const d = deg % 360
  return d < 0 ? d + 360 : d
}

/**
 * Compass bearing from `a` to `b` (0 = north, 90 = east). Returns null when the points coincide.
 * @param {XY} a
 * @param {XY} b
 * @returns {number | null}
 */
export function bearing(a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return null
  return normDeg(Math.atan2(dx, dy) * RAD)
}

/**
 * Signed change of heading from `fromDeg` to `toDeg` in (-180, 180].
 * Positive = clockwise = a RIGHT turn for someone walking; negative = LEFT.
 */
export function signedDelta(fromDeg, toDeg) {
  let d = normDeg(toDeg - fromDeg)
  if (d > 180) d -= 360
  return d
}

/** Unit vector for a compass heading. */
export function headingVector(deg) {
  const r = deg / RAD
  return [Math.sin(r), Math.cos(r)]
}

/** Area-weighted centroid of a simple polygon (falls back to the vertex mean for degenerate input). */
export function centroid(polygon) {
  if (!Array.isArray(polygon) || polygon.length === 0) return null
  let a2 = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < polygon.length; i++) {
    const [x0, y0] = polygon[i]
    const [x1, y1] = polygon[(i + 1) % polygon.length]
    const cross = x0 * y1 - x1 * y0
    a2 += cross
    cx += (x0 + x1) * cross
    cy += (y0 + y1) * cross
  }
  if (Math.abs(a2) < 1e-9) {
    const n = polygon.length
    return [polygon.reduce((s, p) => s + p[0], 0) / n, polygon.reduce((s, p) => s + p[1], 0) / n]
  }
  return [cx / (3 * a2), cy / (3 * a2)]
}

/** True when `p` is inside the polygon (even-odd rule). */
export function pointInPolygon(p, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Distance from point `p` to segment `a`-`b`. */
export function distToSegment(p, a, b) {
  const vx = b[0] - a[0]
  const vy = b[1] - a[1]
  const len2 = vx * vx + vy * vy
  if (len2 < 1e-12) return dist(p, a)
  let t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy))
}

/** Distance from `p` to a polygon (0 when inside). */
export function distToPolygon(p, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return Infinity
  if (pointInPolygon(p, polygon)) return 0
  let best = Infinity
  for (let i = 0; i < polygon.length; i++) {
    best = Math.min(best, distToSegment(p, polygon[i], polygon[(i + 1) % polygon.length]))
  }
  return best
}

/** Nearest point on a polygon's boundary to `p` (or `p` itself when inside). */
export function nearestPointOnPolygon(p, polygon) {
  if (pointInPolygon(p, polygon)) return [p[0], p[1]]
  let best = null
  let bestD = Infinity
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const vx = b[0] - a[0]
    const vy = b[1] - a[1]
    const len2 = vx * vx + vy * vy
    let t = len2 < 1e-12 ? 0 : ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2
    t = Math.max(0, Math.min(1, t))
    const q = [a[0] + t * vx, a[1] + t * vy]
    const d = dist(p, q)
    if (d < bestD) {
      bestD = d
      best = q
    }
  }
  return best
}
