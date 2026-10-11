/**
 * Furnished shop interiors for the v0.4 real style (DESIGN-REAL.md 4): procedural props by occupant category, merged
 * into the level's opaque mesh (lit, textured by surface) and its exact mesh (screens). Seen through the storefront
 * glass in the Walk view and from above in the map views (roofs removed).
 */
import { distToSegment, pointInPolygon, polygonBounds, polygonCentroid } from './geometry.js'

/** Props per shop at most, and only this deep from its doors: the part seen through the glass (phones: geometry). */
export const MAX_PROPS = 12
const PROP_DEPTH_M = 6

/**
 * Grid spots inside a unit polygon, at least 0.9 m from its walls and 1.5 m from its doors.
 * @param {[number, number][]} poly
 * @param {{ a: [number, number], b: [number, number] }[]} openings
 * @param {number} [step] grid pitch (metres)
 * @returns {[number, number][]}
 */
export function propSpots(poly, openings, step = 1.6) {
  const b = polygonBounds(poly)
  const out = []
  const edgeD = (p) => Math.min(...poly.map((q, i) => distToSegment(p, q, poly[(i + 1) % poly.length])))
  for (let x = b.minX + 0.9; x <= b.maxX - 0.9 + 1e-9; x += step) {
    for (let y = b.minY + 0.9; y <= b.maxY - 0.9 + 1e-9; y += step) {
      const p = [x, y]
      if (!pointInPolygon(p, poly) || edgeD(p) < 0.9) continue
      if (openings.some((o) => distToSegment(p, o.a, o.b) < 1.5)) continue
      out.push(p)
    }
  }
  return out
}

const GARMENT = ['hex:#8C7B6B', 'hex:#2F3A4A', 'hex:#A8483A', 'hex:#D9C9B0', 'hex:#3E5E4E', 'hex:#6B4A7A']
const PRODUCT = ['hex:#E8574A', 'hex:#3B82F6', 'hex:#F5B700', 'hex:#22C55E', 'hex:#FFFFFF', 'hex:#A855F7']
const SKIN = 'hex:#EDE7DF'

/**
 * Furnish one shop: mannequins and clothes racks (fashion, beauty, kids), café tables and chairs (food, cafe), display
 * tables with glowing devices (electronics, entertainment), shelf units with products (grocery, health), sofas (home),
 * else one counter.
 * @param {{ props: import('./geometry.js').MeshBuilder, exact: import('./geometry.js').MeshBuilder }} B level build
 * @param {[number, number][]} poly CCW unit polygon
 * @param {{ a: [number, number], b: [number, number] }[]} openings
 * @param {string} category occupant category
 */
export function furnishUnit(B, poly, openings, category) {
  // the front of the shop (within PROP_DEPTH_M of a door), nearest first, at most MAX_PROPS
  const doorD = (p) => (openings.length ? Math.min(...openings.map((o) => distToSegment(p, o.a, o.b))) : 0)
  const spots = propSpots(poly, openings)
    .filter((p) => doorD(p) <= PROP_DEPTH_M)
    .sort((a, b) => doorD(a) - doorD(b))
    .slice(0, MAX_PROPS)
  if (!spots.length) return
  const O = B.props
  spots.forEach(([x, y], i) => {
    switch (category) {
      case 'fashion':
      case 'beauty':
      case 'kids':
        if (i % 3 === 0) {
          O.box(x, y, 0.6, 0.6, 0, 0, 0.25, 'stone', 'stone')
          O.cylinder(x, y, 0.18, 0.25, 1.35, 10, SKIN, SKIN)
          O.cylinder(x, y, 0.12, 1.4, 1.62, 10, SKIN, SKIN)
        } else {
          O.box(x, y, 1.6, 0.05, 0, 1.55, 1.6, 'metal', 'metal')
          for (let g = 0; g < 5; g++) {
            const key = GARMENT[(i + g) % GARMENT.length]
            O.box(x - 0.64 + g * 0.32, y, 0.08, 0.42, 0, 0.75, 1.5, key, key)
          }
        }
        break
      case 'food':
      case 'cafe':
        O.cylinder(x, y, 0.42, 0.72, 0.76, 16, 'stone', 'stone')
        O.cylinder(x, y, 0.05, 0, 0.72, 8, 'metal', 'metal')
        O.box(x + 0.7, y, 0.42, 0.42, 0, 0, 0.45, 'wood', 'wood')
        O.box(x - 0.7, y, 0.42, 0.42, 0, 0, 0.45, 'wood', 'wood')
        break
      case 'electronics':
      case 'entertainment':
        O.box(x, y, 1.4, 0.8, 0, 0, 0.9, 'hex:#F4F4F2', 'hex:#F4F4F2')
        for (let d = -1; d <= 1; d++) {
          const cx = x + d * 0.42
          B.exact.flat([[cx - 0.15, y - 0.1], [cx + 0.15, y - 0.1], [cx + 0.15, y + 0.1], [cx - 0.15, y + 0.1]], 0.905, 'screen')
        }
        break
      case 'grocery':
      case 'health':
        O.box(x, y, 1.4, 0.45, 0, 0, 1.8, 'wallInner', 'wallInner')
        for (let s = 0; s < 4; s++) {
          const key = PRODUCT[(i + s) % PRODUCT.length]
          O.box(x, y, 1.3, 0.5, 0, 0.3 + s * 0.42, 0.45 + s * 0.42, key, key)
        }
        break
      case 'home':
        O.box(x, y, 1.8, 0.8, 0, 0, 0.45, 'garment', 'garment')
        O.box(x, y + 0.32, 1.8, 0.16, 0, 0.45, 0.85, 'garment', 'garment')
        break
      default:
        if (i === 0) {
          const c = polygonCentroid(poly)
          if (pointInPolygon(c, poly)) O.box(c[0], c[1], 2.4, 0.7, 0, 0, 1.05, 'wood', 'wood')
        }
    }
  })
}
