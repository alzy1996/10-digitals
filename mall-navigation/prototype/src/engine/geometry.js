/**
 * Geometry helpers for the engine: 2D polygon utilities (venue-local metres, x = east, y = north)
 * and MeshBuilder, which accumulates flat-shaded, vertex-coloured triangles into one merged
 * BufferGeometry per material.
 *
 * Coordinates: data (x, y) at height h maps to three.js (x, h, -y) (CONTRACT.md §1).
 * Every vertex carries a colour key (see palette.js) and a baked shade factor; colours are resolved
 * per theme by applyTheme(), so a theme switch never rebuilds geometry.
 */
import { BufferAttribute, BufferGeometry, ShapeUtils, Vector2 } from 'three'

/** @typedef {[number, number]} XY */

// ---------------------------------------------------------------------------------------------
// 2D polygon utilities
// ---------------------------------------------------------------------------------------------

/**
 * Signed area (CCW positive).
 * @param {XY[]} poly
 */
export function polygonArea(poly) {
  let a = 0
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x0, y0] = poly[i]
    const [x1, y1] = poly[(i + 1) % n]
    a += x0 * y1 - x1 * y0
  }
  return a / 2
}

/**
 * Copy of the polygon in counter-clockwise order.
 * @param {XY[]} poly
 * @returns {XY[]}
 */
export function ensureCCW(poly) {
  const copy = poly.map((p) => [p[0], p[1]])
  return polygonArea(copy) < 0 ? copy.reverse() : copy
}

/**
 * Area-weighted centroid.
 * @param {XY[]} poly
 * @returns {XY}
 */
export function polygonCentroid(poly) {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x0, y0] = poly[i]
    const [x1, y1] = poly[(i + 1) % n]
    const f = x0 * y1 - x1 * y0
    a += f
    cx += (x0 + x1) * f
    cy += (y0 + y1) * f
  }
  if (Math.abs(a) < 1e-9) {
    const sx = poly.reduce((s, p) => s + p[0], 0) / poly.length
    const sy = poly.reduce((s, p) => s + p[1], 0) / poly.length
    return [sx, sy]
  }
  return [cx / (3 * a), cy / (3 * a)]
}

/**
 * Even-odd point-in-polygon test.
 * @param {XY} pt
 * @param {XY[]} poly
 */
export function pointInPolygon(pt, poly) {
  const [x, y] = pt
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * @param {XY[]} poly
 * @returns {{minX:number,minY:number,maxX:number,maxY:number}}
 */
export function polygonBounds(poly) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of poly) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

/**
 * Distance from point p to segment ab.
 * @param {XY} p
 * @param {XY} a
 * @param {XY} b
 */
export function distToSegment(p, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  let t = len2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const qx = a[0] + dx * t - p[0]
  const qy = a[1] + dy * t - p[1]
  return Math.hypot(qx, qy)
}

/**
 * A point well inside the polygon for a label: the centroid when it is inside and not too close to
 * an edge, otherwise the best of a grid of interior samples (largest distance to the boundary).
 * @param {XY[]} poly
 * @returns {XY}
 */
export function labelPoint(poly) {
  const edgeDist = (p) => {
    let d = Infinity
    for (let i = 0; i < poly.length; i++) d = Math.min(d, distToSegment(p, poly[i], poly[(i + 1) % poly.length]))
    return d
  }
  const c = polygonCentroid(poly)
  const b = polygonBounds(poly)
  const minSide = Math.min(b.maxX - b.minX, b.maxY - b.minY)
  if (pointInPolygon(c, poly) && edgeDist(c) > minSide * 0.3) return c
  let best = c
  let bestD = pointInPolygon(c, poly) ? edgeDist(c) : -1
  const steps = 12
  for (let i = 1; i < steps; i++) {
    for (let j = 1; j < steps; j++) {
      const p = [b.minX + ((b.maxX - b.minX) * i) / steps, b.minY + ((b.maxY - b.minY) * j) / steps]
      if (!pointInPolygon(p, poly)) continue
      const d = edgeDist(p)
      if (d > bestD) {
        bestD = d
        best = p
      }
    }
  }
  return best
}

/**
 * Triangulate a polygon with optional holes. Returns triangles as index triples into `points`.
 * @param {XY[]} contour
 * @param {XY[][]} [holes]
 * @returns {{ points: XY[], tris: number[][] }}
 */
export function triangulate(contour, holes = []) {
  const c = ensureCCW(contour)
  const hs = holes.map((h) => ensureCCW(h).reverse())
  const v2 = (p) => new Vector2(p[0], p[1])
  const tris = ShapeUtils.triangulateShape(c.map(v2), hs.map((h) => h.map(v2)))
  const points = [...c, ...hs.flat()]
  return { points, tris }
}

/**
 * Sample a regular polygon approximating a circle (CCW).
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {number} segs
 * @returns {XY[]}
 */
export function circlePolygon(cx, cy, r, segs = 24) {
  const out = []
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return out
}

/**
 * Oriented rectangle footprint (CCW). angleDeg is a compass heading of the rectangle's "length"
 * axis (0 = north), clockwise positive.
 * @param {number} cx
 * @param {number} cy
 * @param {number} w  size across the heading
 * @param {number} l  size along the heading
 * @param {number} angleDeg
 * @returns {XY[]}
 */
export function orientedRect(cx, cy, w, l, angleDeg = 0) {
  const a = (angleDeg * Math.PI) / 180
  const fx = Math.sin(a)
  const fy = Math.cos(a) // forward (heading)
  const rx = fy
  const ry = -fx // right of heading
  const hw = w / 2
  const hl = l / 2
  const P = (s, t) => [cx + rx * s + fx * t, cy + ry * s + fy * t]
  return ensureCCW([P(-hw, -hl), P(hw, -hl), P(hw, hl), P(-hw, hl)])
}

/** Baked "sun" direction in data coords for vertical faces (from the south, a little east). */
const SUN = (() => {
  const x = 0.42
  const y = -0.9
  const l = Math.hypot(x, y)
  return [x / l, y / l]
})()

/**
 * Baked shade for a vertical face with outward data-space normal (nx, ny).
 * @param {number} nx
 * @param {number} ny
 */
export function wallShade(nx, ny) {
  const l = Math.hypot(nx, ny) || 1
  const d = (nx / l) * SUN[0] + (ny / l) * SUN[1]
  return 0.74 + 0.26 * (0.5 + 0.5 * d)
}

// ---------------------------------------------------------------------------------------------
// MeshBuilder
// ---------------------------------------------------------------------------------------------

export class MeshBuilder {
  /**
   * @param {import('./palette.js').ColorRegistry} registry
   * @param {{ rise?: boolean }} [opts] rise=true stores a per-vertex rise fraction (see setRise)
   */
  constructor(registry, opts = {}) {
    this.registry = registry
    this.rise = !!opts.rise
    /** @type {number[]} */
    this.pos = []
    /** @type {number[]} */
    this.keys = []
    /** @type {number[]} */
    this.shades = []
    /** @type {number[]} */
    this.fracs = []
    /** @type {number[]} */
    this.idx = []
  }

  get vertexCount() {
    return this.keys.length
  }

  /**
   * Add a vertex (data coords) and return its index.
   * @param {number} x
   * @param {number} y
   * @param {number} h height (metres above the level / rise base)
   * @param {string} key colour key
   * @param {number} [shade]
   * @param {number} [frac] rise fraction (rise meshes only)
   */
  v(x, y, h, key, shade = 1, frac = 0) {
    this.pos.push(x, h, -y)
    this.keys.push(this.registry.id(key))
    this.shades.push(shade)
    if (this.rise) this.fracs.push(frac)
    return this.keys.length - 1
  }

  /**
   * Triangle whose winding is fixed so its normal points along (nx, ny, nz) in three.js space.
   */
  triN(a, b, c, nx, ny, nz) {
    const p = this.pos
    const ax = p[a * 3]
    const ay = p[a * 3 + 1]
    const az = p[a * 3 + 2]
    const ux = p[b * 3] - ax
    const uy = p[b * 3 + 1] - ay
    const uz = p[b * 3 + 2] - az
    const vx = p[c * 3] - ax
    const vy = p[c * 3 + 1] - ay
    const vz = p[c * 3 + 2] - az
    const cx = uy * vz - uz * vy
    const cy = uz * vx - ux * vz
    const cz = ux * vy - uy * vx
    if (cx * nx + cy * ny + cz * nz < 0) this.idx.push(a, c, b)
    else this.idx.push(a, b, c)
  }

  /**
   * Horizontal polygon at height h, facing up (or down).
   * @param {XY[]} poly
   * @param {number} h
   * @param {string} key
   * @param {{ holes?: XY[][], shade?: number, down?: boolean, frac?: number }} [opts]
   */
  flat(poly, h, key, opts = {}) {
    const { points, tris } = triangulate(poly, opts.holes ?? [])
    const base = this.vertexCount
    for (const [x, y] of points) this.v(x, y, h, key, opts.shade ?? 1, opts.frac ?? 0)
    const ny = opts.down ? -1 : 1
    for (const [a, b, c] of tris) this.triN(base + a, base + b, base + c, 0, ny, 0)
  }

  /**
   * Horizontal quad from four data points at height h (any winding), facing up.
   */
  flatQuad(p0, p1, p2, p3, h, key, shade = 1) {
    const a = this.v(p0[0], p0[1], h, key, shade)
    const b = this.v(p1[0], p1[1], h, key, shade)
    const c = this.v(p2[0], p2[1], h, key, shade)
    const d = this.v(p3[0], p3[1], h, key, shade)
    this.triN(a, b, c, 0, 1, 0)
    this.triN(a, c, d, 0, 1, 0)
  }

  /**
   * Vertical quad from data segment p0->p1 between heights h0 and h1, facing the outward data normal.
   * @param {XY} p0
   * @param {XY} p1
   * @param {number} h0
   * @param {number} h1
   * @param {string} key
   * @param {XY} outward data-space outward normal
   * @param {{ ao?: boolean, shade?: number, keyTop?: string, unlit?: boolean }} [opts] unlit = no baked shading
   */
  vquad(p0, p1, h0, h1, key, outward, opts = {}) {
    const s = opts.unlit ? (opts.shade ?? 1) : (opts.shade ?? 1) * wallShade(outward[0], outward[1])
    const sb = opts.ao && !opts.unlit ? s * 0.84 : s
    const kt = opts.keyTop ?? key
    const a = this.v(p0[0], p0[1], h0, key, sb)
    const b = this.v(p1[0], p1[1], h0, key, sb)
    const c = this.v(p1[0], p1[1], h1, kt, s)
    const d = this.v(p0[0], p0[1], h1, kt, s)
    this.triN(a, b, c, outward[0], 0, -outward[1])
    this.triN(a, c, d, outward[0], 0, -outward[1])
  }

  /**
   * Prism: footprint (any winding) extruded from h0 to h1 with a top face (and optional bottom).
   * @param {XY[]} footprint
   * @param {number} h0
   * @param {number} h1
   * @param {string} topKey
   * @param {string} sideKey
   * @param {{ ao?: boolean, bottom?: string|null, top?: boolean, sideShade?: number, unlit?: boolean }} [opts]
   */
  prism(footprint, h0, h1, topKey, sideKey, opts = {}) {
    const poly = ensureCCW(footprint)
    if (opts.top !== false) this.flat(poly, h1, topKey)
    if (opts.bottom) this.flat(poly, h0, opts.bottom, { down: true })
    for (let i = 0; i < poly.length; i++) {
      const p0 = poly[i]
      const p1 = poly[(i + 1) % poly.length]
      const dx = p1[0] - p0[0]
      const dy = p1[1] - p0[1]
      const l = Math.hypot(dx, dy)
      if (l < 1e-6) continue
      this.vquad(p0, p1, h0, h1, sideKey, [dy / l, -dx / l], { ao: opts.ao, shade: opts.sideShade, unlit: opts.unlit })
    }
  }

  /**
   * Oriented box (rectangle footprint) between heights.
   */
  box(cx, cy, w, l, angleDeg, h0, h1, topKey, sideKey, opts = {}) {
    this.prism(orientedRect(cx, cy, w, l, angleDeg), h0, h1, topKey, sideKey, opts)
  }

  /**
   * Cylinder approximated by a prism.
   */
  cylinder(cx, cy, r, h0, h1, segs, topKey, sideKey, opts = {}) {
    this.prism(circlePolygon(cx, cy, r, segs), h0, h1, topKey, sideKey, opts)
  }

  /**
   * Cone/pyramid from a circular base at h0 to an apex at h1.
   */
  cone(cx, cy, r, h0, h1, segs, key, shadeBase = 0.8) {
    const apex = this.v(cx, cy, h1, key, 1)
    const ring = []
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2
      const nx = Math.cos(a)
      const ny = Math.sin(a)
      ring.push(this.v(cx + nx * r, cy + ny * r, h0, key, shadeBase * wallShade(nx, ny)))
    }
    for (let i = 0; i < segs; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % segs]
      const am = ((i + 0.5) / segs) * Math.PI * 2
      this.triN(a, b, apex, Math.cos(am), 0.5, -Math.sin(am))
    }
  }

  /**
   * Flat strip (thick polyline) at height h. Points are data coords; width in metres.
   * @param {XY[]} pts
   * @param {number} width
   * @param {number} h
   * @param {string} key
   * @param {boolean} [closed]
   */
  strip(pts, width, h, key, closed = false) {
    const n = pts.length
    const segs = closed ? n : n - 1
    for (let i = 0; i < segs; i++) {
      const p0 = pts[i]
      const p1 = pts[(i + 1) % n]
      const dx = p1[0] - p0[0]
      const dy = p1[1] - p0[1]
      const l = Math.hypot(dx, dy)
      if (l < 1e-6) continue
      const ux = dx / l
      const uy = dy / l
      const ox = (-uy * width) / 2
      const oy = (ux * width) / 2
      // extend by half width so joins overlap cleanly
      const e = width / 2
      const a = [p0[0] - ux * e, p0[1] - uy * e]
      const b = [p1[0] + ux * e, p1[1] + uy * e]
      this.flatQuad([a[0] + ox, a[1] + oy], [b[0] + ox, b[1] + oy], [b[0] - ox, b[1] - oy], [a[0] - ox, a[1] - oy], h, key)
    }
  }

  /**
   * Build the merged BufferGeometry (position + color). Colour keys and shades are kept in userData
   * so applyTheme() can recolour it in place.
   * @param {import('./palette.js').ThemeName} theme
   * @returns {BufferGeometry}
   */
  build(theme) {
    const g = new BufferGeometry()
    const n = this.vertexCount
    const pos = new Float32Array(this.pos)
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(n * 3), 3))
    const index = n > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx)
    g.setIndex(new BufferAttribute(index, 1))
    g.userData.colorKeys = Uint16Array.from(this.keys)
    g.userData.shades = Float32Array.from(this.shades)
    g.userData.registry = this.registry
    if (this.rise) {
      g.userData.base = Float32Array.from(this.pos)
      g.userData.fracs = Float32Array.from(this.fracs)
    }
    applyTheme(g, theme)
    g.computeBoundingSphere()
    g.computeBoundingBox()
    return g
  }

  get isEmpty() {
    return this.idx.length === 0
  }
}

/**
 * Recolour a MeshBuilder geometry for a theme.
 * @param {BufferGeometry} g
 * @param {import('./palette.js').ThemeName} theme
 */
export function applyTheme(g, theme) {
  const { colorKeys, shades, registry } = g.userData
  if (!colorKeys || !registry) return
  const tab = registry.table(theme)
  const col = g.getAttribute('color')
  const arr = col.array
  for (let i = 0; i < colorKeys.length; i++) {
    const k = colorKeys[i] * 3
    const s = shades[i]
    arr[i * 3] = tab[k] * s
    arr[i * 3 + 1] = tab[k + 1] * s
    arr[i * 3 + 2] = tab[k + 2] * s
  }
  col.needsUpdate = true
}

/**
 * Update a rise geometry (built with { rise: true }) so a vertex with fraction f sits at
 * base height + f * rise.
 * @param {BufferGeometry} g
 * @param {number} rise
 */
export function setRise(g, rise) {
  const { base, fracs } = g.userData
  if (!base) return
  const pos = g.getAttribute('position')
  const arr = pos.array
  for (let i = 0; i < fracs.length; i++) arr[i * 3 + 1] = base[i * 3 + 1] + fracs[i] * rise
  pos.needsUpdate = true
  g.computeBoundingSphere()
  g.computeBoundingBox()
}
