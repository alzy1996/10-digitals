/**
 * Level builders: turn one venue level into merged, vertex-coloured geometry ("architect's model"
 * look) plus the lists of signs, pins, labels and pick targets that live on it.
 *
 * Retail: floor slab (with the atrium void cut out), walkable area patches, every unit extruded as a
 * block with thick walls and dark wall-top strips (real geometry), a category-coloured storefront
 * with glass and a sign box above each door, lighter roofs (separate mesh so floor view can fade
 * them), fountain, atrium glass rail, food-court tables, palms, lift glass shafts, stairs, kiosks,
 * entrance gates and yellow QR plates on posts.
 *
 * Parking: dark asphalt, drive aisles with dashed centre lines, hatched ramps, zone colour decals
 * (30 % opacity, separate transparent mesh), pillars with zone colour bands and labels, bays (returned
 * as data for one InstancedMesh per level) and bay codes.
 */
import { CATEGORY_COLORS, PIN_COLORS, amenityGroup } from './palette.js'
import {
  MeshBuilder,
  circlePolygon,
  distToSegment,
  ensureCCW,
  labelPoint,
  orientedRect,
  pointInPolygon,
  polygonArea,
  polygonBounds,
  polygonCentroid,
  triangulate,
  wallShade,
} from './geometry.js'
import { iconForAmenity, zonePinId } from './icons.js'

export const WALL_H = 3.5
export const ANCHOR_H = 4.4
export const SERVICE_H = 3.2
const PARK_SERVICE_H = 3.0
const T = 0.2 // wall thickness == wall-top strip width (PLAN 19.2: 0.2 m)
const RISE = 0.14 // wall top above the roof
const SLAB = 0.5 // slab thickness
const PLINTH = 0.32

/** @typedef {[number, number]} XY */

// ---------------------------------------------------------------------------------------------
// small 2D helpers
// ---------------------------------------------------------------------------------------------

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
const add = (a, b) => [a[0] + b[0], a[1] + b[1]]
const mul = (a, s) => [a[0] * s, a[1] * s]
const len = (a) => Math.hypot(a[0], a[1])
const norm = (a) => {
  const l = len(a) || 1
  return [a[0] / l, a[1] / l]
}

/** Sutherland-Hodgman clip of `subject` by a convex `clip` polygon (both any winding). */
export function clipConvex(subject, clip) {
  const c = ensureCCW(clip)
  let out = subject.map((p) => [p[0], p[1]])
  for (let i = 0; i < c.length && out.length; i++) {
    const a = c[i]
    const b = c[(i + 1) % c.length]
    const inside = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= -1e-9
    const inter = (p, q) => {
      const x1 = a[0]
      const y1 = a[1]
      const x2 = b[0]
      const y2 = b[1]
      const x3 = p[0]
      const y3 = p[1]
      const x4 = q[0]
      const y4 = q[1]
      const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
      if (Math.abs(den) < 1e-12) return [q[0], q[1]]
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
      return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)]
    }
    const input = out
    out = []
    for (let j = 0; j < input.length; j++) {
      const p = input[j]
      const q = input[(j + 1) % input.length]
      const pin = inside(p)
      const qin = inside(q)
      if (pin) out.push(p)
      if (pin !== qin) out.push(inter(p, q))
    }
  }
  return out
}

function isConvex(poly) {
  const p = ensureCCW(poly)
  for (let i = 0; i < p.length; i++) {
    const a = p[i]
    const b = p[(i + 1) % p.length]
    const c = p[(i + 2) % p.length]
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) < -1e-9) return false
  }
  return true
}

/** Keep the part of a convex polygon where n . p <= c. */
function clipHalfPlane(poly, n, c) {
  const out = []
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const dp = n[0] * p[0] + n[1] * p[1] - c
    const dq = n[0] * q[0] + n[1] * q[1] - c
    if (dp <= 0) out.push(p)
    if (dp < 0 !== dq < 0 && Math.abs(dp - dq) > 1e-12) {
      const t = dp / (dp - dq)
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
    }
  }
  return out
}

function headingVec(deg) {
  const a = (deg * Math.PI) / 180
  return [Math.sin(a), Math.cos(a)]
}

/** rotY (three.js) so a vertical face looks along data direction d. */
function faceRotY(d) {
  return Math.atan2(d[0], -d[1])
}

// ---------------------------------------------------------------------------------------------
// shared pieces
// ---------------------------------------------------------------------------------------------

/**
 * Walls of one unit, with storefronts at its openings.
 * @param {object} B builders { opaque, glass }
 * @param {XY[]} poly CCW
 * @param {object} style
 * @param {Array<{a:XY,b:XY,id:string}>} openings
 * @param {(sign:object)=>void} onSign
 */
function buildUnitWalls(B, poly, style, openings, onSign) {
  const { H, wallKey, catKey, signText, signScale } = style
  const top = H + RISE
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const p0 = poly[i]
    const p1 = poly[(i + 1) % n]
    const d = sub(p1, p0)
    const L = len(d)
    if (L < 1e-6) continue
    const u = mul(d, 1 / L)
    const nOut = [u[1], -u[0]]
    const nIn = [-u[1], u[0]]
    const P = (t) => add(p0, mul(u, t))
    const box = (t0, t1, h0, h1, side, topKey = 'strip') => {
      if (t1 - t0 < 1e-4 || h1 - h0 < 1e-4) return
      const fp = [P(t0), P(t1), add(P(t1), mul(nIn, T)), add(P(t0), mul(nIn, T))]
      B.opaque.prism(fp, h0, h1, topKey, side, { ao: h0 < 0.01 })
    }
    // a solid wall, lined inside with the shop's lit back-wall colour (storm: warm and lighter, so the storefront glass
    // reads as a lit shop; classic: the wall's own colour, unchanged)
    const wall = (t0, t1) => {
      box(t0, t1, 0, top, wallKey)
      if (style.litKey && t1 - t0 > 1e-3) B.opaque.vquad(add(P(t0), mul(nIn, T + 0.003)), add(P(t1), mul(nIn, T + 0.003)), 0, top, style.litKey, nIn, { ao: true })
    }
    // openings on this edge
    const ops = []
    for (const o of openings) {
      const da = distToSegment(o.a, p0, p1)
      const db = distToSegment(o.b, p0, p1)
      if (da > 0.06 || db > 0.06) continue
      const ta = (o.a[0] - p0[0]) * u[0] + (o.a[1] - p0[1]) * u[1]
      const tb = (o.b[0] - p0[0]) * u[0] + (o.b[1] - p0[1]) * u[1]
      const d0 = Math.max(0, Math.min(ta, tb))
      const d1 = Math.min(L, Math.max(ta, tb))
      const half = Math.max((d1 - d0) / 2 + 1.0, 2.0)
      const mid = (d0 + d1) / 2
      const f0 = Math.max(0.12, mid - half)
      const f1 = Math.min(L - 0.12, mid + half)
      ops.push({ d0, d1, f0: Math.min(f0, d0), f1: Math.max(f1, d1), o })
    }
    ops.sort((a, b) => a.f0 - b.f0)
    let t = 0
    for (const op of ops) {
      const f0 = Math.max(op.f0, t)
      wall(t, f0)
      // storefront: plinth + glass + category header, open door
      const doorH = Math.min(style.doorH, H - 0.5)
      for (const [s0, s1] of [
        [f0, op.d0],
        [op.d1, op.f1],
      ]) {
        if (s1 - s0 < 0.05) continue
        box(s0, s1, 0, PLINTH, 'strip', 'strip')
        box(s0, s1, doorH, top, catKey)
        // glass pane in the middle of the wall thickness
        const g0 = add(P(s0), mul(nIn, T * 0.5))
        const g1 = add(P(s1), mul(nIn, T * 0.5))
        B.glass.vquad(g0, g1, PLINTH, doorH, 'glass', nOut, { unlit: true })
        // mullions at both ends
        box(s0, Math.min(s1, s0 + 0.18), PLINTH, doorH, catKey, catKey)
        box(Math.max(s0, s1 - 0.18), s1, PLINTH, doorH, catKey, catKey)
      }
      box(op.d0, op.d1, doorH, top, catKey)
      // threshold mat in the doorway
      B.opaque.flat([P(op.d0), P(op.d1), add(P(op.d1), mul(nIn, T)), add(P(op.d0), mul(nIn, T))], 0.02, 'strip')
      // sign box above the door, protruding into the corridor
      const s0 = f0 + 0.08
      const s1 = op.f1 - 0.08
      const sb = style.signBottom
      const st = style.signTop
      const depth = 0.38
      const fp = [P(s0), P(s1), add(P(s1), mul(nOut, depth)), add(P(s0), mul(nOut, depth))]
      B.opaque.prism(fp, sb, st, style.signDark, style.signDark, { ao: false })
      // exact-colour front face (unlit look: signs read as illuminated)
      const fa = add(P(s0), mul(nOut, depth + 0.004))
      const fb = add(P(s1), mul(nOut, depth + 0.004))
      B.opaque.vquad(fa, fb, sb, st, catKey, nOut, { unlit: true })
      // thin light frame line at the bottom of the sign
      B.opaque.vquad(add(fa, mul(nOut, 0.002)), add(fb, mul(nOut, 0.002)), sb, sb + 0.06, 'hex:#FFFFFF', nOut, { unlit: true })
      if (signText) {
        const c = add(mul(add(P(s0), P(s1)), 0.5), mul(nOut, depth + 0.03))
        onSign({
          x: c[0],
          y: c[1],
          h: (sb + st) / 2 + 0.03,
          rotY: faceRotY(nOut),
          width: s1 - s0 - 0.3,
          height: st - sb,
          text: signText,
          size: (st - sb) * 0.42 * (signScale ?? 1),
        })
      }
      t = op.f1
    }
    wall(t, L)
  }
}

/** Roof + interior floor of a unit. */
function buildUnitRoof(B, poly, style) {
  B.roofs.flat(poly, style.H, style.roofKey)
  B.opaque.flat(poly, 0.015, style.floorKey)
}

/** Fountain landmark (G). */
function buildFountain(B, c, r) {
  const outer = circlePolygon(c[0], c[1], r, 36)
  const inner = circlePolygon(c[0], c[1], r - 0.35, 36)
  // rim: outer wall, inner wall, top ring
  for (let i = 0; i < 36; i++) {
    const a0 = outer[i]
    const a1 = outer[(i + 1) % 36]
    const nrm = norm(sub(mul(add(a0, a1), 0.5), c))
    B.opaque.vquad(a0, a1, 0, 0.55, 'stoneDark', nrm, { ao: true })
    const b0 = inner[i]
    const b1 = inner[(i + 1) % 36]
    B.opaque.vquad(b1, b0, 0.3, 0.55, 'stoneDark', mul(nrm, -1), {})
  }
  B.opaque.flat(outer, 0.55, 'stone', { holes: [inner] })
  B.opaque.flat(inner, 0.38, 'water')
  // tiers
  B.opaque.cylinder(c[0], c[1], 0.38, 0.38, 1.5, 16, 'stone', 'stoneDark')
  B.opaque.cylinder(c[0], c[1], 1.25, 1.05, 1.2, 24, 'stone', 'stone')
  B.opaque.flat(circlePolygon(c[0], c[1], 1.02, 24), 1.205, 'waterLight')
  B.opaque.cylinder(c[0], c[1], 0.62, 1.5, 1.62, 16, 'stone', 'stone')
  B.opaque.cone(c[0], c[1], 0.3, 1.62, 2.5, 12, 'waterLight', 0.95)
}

/** Glass rail around a void polygon. */
function buildRail(B, poly, railH) {
  const p = ensureCCW(poly)
  const n = p.length
  for (let i = 0; i < n; i++) {
    const a = p[i]
    const b = p[(i + 1) % n]
    const d = sub(b, a)
    const L = len(d)
    if (L < 1e-6) continue
    const u = mul(d, 1 / L)
    // void interior is on the left of a CCW edge; the rail stands just outside, on the slab
    const nIn = [-u[1], u[0]]
    const nOut = [u[1], -u[0]]
    const a2 = add(a, mul(nOut, 0.12))
    const b2 = add(b, mul(nOut, 0.12))
    B.glass.vquad(a2, b2, 0.08, railH - 0.06, 'glass', nIn, { unlit: true })
    // handrail
    const fp = [add(a, mul(nOut, 0.04)), add(b, mul(nOut, 0.04)), add(b, mul(nOut, 0.2)), add(a, mul(nOut, 0.2))]
    B.opaque.prism(fp, railH - 0.06, railH + 0.04, 'metal', 'metal', { ao: false })
    // base kerb
    B.opaque.prism(fp, 0, 0.1, 'metal', 'metal', { ao: false })
    // posts
    const posts = Math.max(1, Math.round(L / 2.5))
    for (let k = 0; k <= posts; k++) {
      const q = add(a2, mul(u, (L * k) / posts))
      B.opaque.box(q[0], q[1], 0.08, 0.08, 0, 0.08, railH - 0.06, 'metal', 'metal', { ao: false })
    }
  }
  // void lip: slab edge faces into the void
  for (let i = 0; i < n; i++) {
    const a = p[i]
    const b = p[(i + 1) % n]
    const d = sub(b, a)
    const L = len(d)
    if (L < 1e-6) continue
    const u = mul(d, 1 / L)
    B.opaque.vquad(a, b, -SLAB, 0, 'slabSide', [-u[1], u[0]], {})
  }
}

/** Low-poly palm in a planter. */
function buildPalm(B, x, y, scale = 1) {
  const s = scale
  B.opaque.box(x, y, 1.3 * s, 1.3 * s, 0, 0, 0.55, 'planter', 'stoneDark')
  B.opaque.flat(orientedRect(x, y, 1.05 * s, 1.05 * s, 0), 0.56, 'trunk')
  B.opaque.cylinder(x, y, 0.16 * s, 0.55, 3.4 * s, 8, 'trunk', 'trunk')
  const topH = 3.4 * s
  for (let k = 0; k < 7; k++) {
    const ang = (k / 7) * Math.PI * 2 + 0.3
    const dir = [Math.cos(ang), Math.sin(ang)]
    const side = [-dir[1], dir[0]]
    const tip = add([x, y], mul(dir, 1.9 * s))
    const mid = add([x, y], mul(dir, 1.0 * s))
    const w = 0.42 * s
    const key = k % 2 ? 'leaf' : 'leafDark'
    const a = B.opaque.v(x, y, topH + 0.15, key, 1)
    const b = B.opaque.v(mid[0] + side[0] * w, mid[1] + side[1] * w, topH + 0.25, key, 0.95)
    const c = B.opaque.v(tip[0], tip[1], topH - 0.75 * s, key, 0.85)
    const d = B.opaque.v(mid[0] - side[0] * w, mid[1] - side[1] * w, topH + 0.25, key, 0.95)
    B.opaque.triN(a, b, c, 0, 1, 0)
    B.opaque.triN(a, c, d, 0, 1, 0)
  }
}

/**
 * QR plate. Mounted on a pillar: a white plate with a dark frame and QR square on the pillar face. Free-standing:
 * a flat QR tile on the floor (dark frame, white face, three finder squares), facing the way the plate faces.
 * A thin post with an edge-on plate read as a stray glyph on the walkway from the map cameras; a floor tile reads
 * as a marker from any angle (the scan sheet adds a tappable pin on top, overlay.js).
 */
function buildPlate(B, anchor, mounted) {
  const f = headingVec(anchor.facingDeg ?? 0)
  const [x, y] = anchor.point
  if (!mounted) {
    const ang = anchor.facingDeg ?? 0
    const T = 1.1
    const Q = B.plates
    Q.flat(orientedRect(x, y, T, T, ang), 0.03, 'qrDark')
    Q.flat(orientedRect(x, y, T - 0.16, T - 0.16, ang), 0.034, 'qr', { shade: 1 })
    // finder squares in three corners (dark ring, white ring, dark centre) and a few modules
    const side = [f[1], -f[0]]
    const at = (s, t) => [x + side[0] * s + f[0] * t, y + side[1] * s + f[1] * t]
    const q = (T - 0.16) / 2 - 0.16
    for (const [s0, t0] of [
      [-q, q],
      [q, q],
      [-q, -q],
    ]) {
      const c = at(s0, t0)
      Q.flat(orientedRect(c[0], c[1], 0.3, 0.3, ang), 0.038, 'qrDark')
      Q.flat(orientedRect(c[0], c[1], 0.18, 0.18, ang), 0.04, 'qr', { shade: 1 })
      Q.flat(orientedRect(c[0], c[1], 0.1, 0.1, ang), 0.042, 'qrDark')
    }
    for (const [s0, t0] of [
      [0.12, -0.12],
      [0.24, -0.02],
      [0.06, 0.1],
      [0.26, -0.26],
      [-0.02, -0.28],
    ]) {
      const c = at(s0, t0)
      Q.flat(orientedRect(c[0], c[1], 0.09, 0.09, ang), 0.038, 'qrDark')
    }
    return
  }
  const side = [f[1], -f[0]]
  const cx = x
  const cy = y
  // dark body = the frame; white face inset by 4 cm; dark QR square with a white centre
  B.opaque.box(cx, cy, 0.62, 0.06, anchor.facingDeg ?? 0, 1.2, 1.68, 'qrDark', 'qrDark', { ao: false })
  const face = add([cx, cy], mul(f, 0.032))
  B.opaque.vquad(add(face, mul(side, -0.27)), add(face, mul(side, 0.27)), 1.24, 1.64, 'qr', f, { unlit: true })
  const f2 = add(face, mul(f, 0.002))
  B.opaque.vquad(add(f2, mul(side, -0.16)), add(f2, mul(side, 0.16)), 1.28, 1.6, 'qrDark', f, { unlit: true })
  const f3 = add(face, mul(f, 0.004))
  B.opaque.vquad(add(f3, mul(side, -0.1)), add(f3, mul(side, 0.1)), 1.34, 1.54, 'qr', f, { unlit: true })
}

/** Lift shaft on one level: glass box, metal frame, door, sign. */
function buildLiftShaft(B, conn, H, onSign, isParking) {
  const shaft = ensureCCW(conn.shaft)
  const top = H + 0.4
  B.glass.prism(shaft, 0.02, top, 'glass', 'glass', { ao: false })
  B.opaque.flat(shaft, 0.02, 'escPit')
  for (const p of shaft) B.opaque.box(p[0], p[1], 0.22, 0.22, 0, 0, top + 0.12, 'metal', 'metal', { ao: false })
  for (let i = 0; i < shaft.length; i++) {
    const a = shaft[i]
    const b = shaft[(i + 1) % shaft.length]
    const d = sub(b, a)
    const L = len(d)
    const u = mul(d, 1 / L)
    const nIn = [-u[1], u[0]]
    B.opaque.prism([a, b, add(b, mul(nIn, 0.2)), add(a, mul(nIn, 0.2))], top, top + 0.12, 'metal', 'metal', { ao: false })
  }
  // door on the facing side
  const f = headingVec(conn.doorFacingDeg ?? 180)
  const c = polygonCentroid(shaft)
  const b = polygonBounds(shaft)
  const halfDepth = Math.abs(f[0]) > Math.abs(f[1]) ? (b.maxX - b.minX) / 2 : (b.maxY - b.minY) / 2
  const halfWidth = Math.abs(f[0]) > Math.abs(f[1]) ? (b.maxY - b.minY) / 2 : (b.maxX - b.minX) / 2
  const side = [f[1], -f[0]]
  const faceC = add(c, mul(f, halfDepth + 0.02))
  const dw = Math.min(1.8, halfWidth * 1.2)
  B.opaque.vquad(add(faceC, mul(side, -dw / 2 - 0.15)), add(faceC, mul(side, dw / 2 + 0.15)), 0, 2.55, 'metal', f, { unlit: false })
  B.opaque.vquad(add(faceC, add(mul(side, -dw / 2), mul(f, 0.01))), add(faceC, add(mul(side, dw / 2), mul(f, 0.01))), 0, 2.4, 'door', f, { unlit: true })
  // sign box over the door
  const s0 = add(faceC, mul(side, -halfWidth + 0.2))
  const s1 = add(faceC, mul(side, halfWidth - 0.2))
  const sb = Math.min(2.75, H - 0.6)
  const st = sb + 0.8
  B.opaque.prism([s0, s1, add(s1, mul(f, 0.3)), add(s0, mul(f, 0.3))], sb, st, 'hex:#1F2937', 'hex:#1F2937', { ao: false })
  B.opaque.vquad(add(s0, mul(f, 0.305)), add(s1, mul(f, 0.305)), sb, st, 'hex:' + PIN_COLORS.connector, f, { unlit: true })
  const sc = add(mul(add(s0, s1), 0.5), mul(f, 0.33))
  onSign({
    x: sc[0],
    y: sc[1],
    h: (sb + st) / 2,
    rotY: faceRotY(f),
    width: len(sub(s1, s0)) - 0.3,
    height: st - sb,
    text: conn.name,
    size: 0.34,
  })
  return { centroid: c, top }
}

/** Stair core on one level: a stepped block rising away from the door. */
function buildStairs(B, conn, H) {
  const shaft = ensureCCW(conn.shaft)
  const f = headingVec(conn.doorFacingDeg ?? 180)
  const dir = mul(f, -1) // climbing direction
  let smin = Infinity
  let smax = -Infinity
  for (const p of shaft) {
    const s = p[0] * dir[0] + p[1] * dir[1]
    smin = Math.min(smin, s)
    smax = Math.max(smax, s)
  }
  const N = 10
  for (let k = 0; k < N; k++) {
    const a = smin + ((smax - smin) * k) / N
    const b = smin + ((smax - smin) * (k + 1)) / N
    let part = clipHalfPlane(shaft, dir, b)
    part = clipHalfPlane(part, mul(dir, -1), -a)
    if (part.length < 3) continue
    B.opaque.prism(part, 0, ((k + 1) * H) / N, k % 2 ? 'stairStep' : 'stairStep2', 'wall', { ao: true })
  }
  // side walls along the climb
  const b = polygonBounds(shaft)
  const c = polygonCentroid(shaft)
  const halfW = Math.abs(dir[0]) > Math.abs(dir[1]) ? (b.maxY - b.minY) / 2 : (b.maxX - b.minX) / 2
  const sideV = [dir[1], -dir[0]]
  for (const sgn of [-1, 1]) {
    const q = add(c, mul(sideV, sgn * (halfW - 0.1)))
    const rect = orientedRect(q[0], q[1], 0.2, smax - smin, Math.atan2(dir[0], dir[1]) * (180 / Math.PI))
    B.opaque.prism(rect, 0, H + 0.6, 'strip', 'wall', { ao: true })
  }
  return { centroid: c }
}

/** Entrance gate on the building edge closest to an entrance anchor. */
function buildEntrance(B, anchor, level, areas, onSign) {
  const outline = ensureCCW(level.outline)
  const pt = anchor.point
  // closest outline edge
  let best = null
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % outline.length]
    const d = distToSegment(pt, a, b)
    if (!best || d < best.d) best = { d, a, b }
  }
  if (!best) return
  const u = norm(sub(best.b, best.a))
  const nOut = [u[1], -u[0]]
  // walkable area touching that edge near the anchor: its span along the edge
  let t0 = null
  let t1 = null
  for (const ar of areas) {
    if (!ar.walkable) continue
    if (!pointInPolygon(pt, ar.polygon) && distToPolygon(pt, ar.polygon) > 1.5) continue
    for (const v of ar.polygon) {
      if (distToSegment(v, best.a, best.b) > 0.05) continue
      const t = (v[0] - best.a[0]) * u[0] + (v[1] - best.a[1]) * u[1]
      t0 = t0 == null ? t : Math.min(t0, t)
      t1 = t1 == null ? t : Math.max(t1, t)
    }
  }
  const tp = (pt[0] - best.a[0]) * u[0] + (pt[1] - best.a[1]) * u[1]
  if (t0 == null || t1 == null || t1 - t0 < 1) {
    t0 = tp - 3
    t1 = tp + 3
  }
  const P = (t) => add(best.a, mul(u, t))
  const H = 4.2
  for (const t of [t0, t1]) {
    const c = P(t)
    B.opaque.box(c[0], c[1], 0.6, 0.6, 0, 0, H + 0.4, 'exit', 'exit', { ao: true })
  }
  const lintel = [P(t0), P(t1), add(P(t1), mul(nOut, -0.5)), add(P(t0), mul(nOut, -0.5))]
  B.opaque.prism(lintel, H - 0.6, H + 0.4, 'exit', 'exit', { ao: false })
  // glass doors (sliding panels) and a mat inside
  B.glass.vquad(P(t0 + 0.3), P(t1 - 0.3), 0, H - 0.6, 'glass', nOut, { unlit: true })
  B.opaque.flat([P(t0 + 0.3), P(t1 - 0.3), add(P(t1 - 0.3), mul(nOut, -2.2)), add(P(t0 + 0.3), mul(nOut, -2.2))], 0.022, 'exitMat')
  // sign on the inner face of the lintel (faces into the mall) and on the outer face
  for (const dirSign of [-1, 1]) {
    const nrm = mul(nOut, dirSign)
    const base = dirSign < 0 ? add(mul(add(P(t0), P(t1)), 0.5), mul(nOut, -0.53)) : add(mul(add(P(t0), P(t1)), 0.5), mul(nOut, 0.03))
    onSign({
      x: base[0],
      y: base[1],
      h: H - 0.1,
      rotY: faceRotY(nrm),
      width: t1 - t0 - 1,
      height: 1.0,
      text: anchor.label,
      size: 0.4,
    })
  }
  return { center: P((t0 + t1) / 2), nOut }
}

function distToPolygon(p, poly) {
  let d = Infinity
  for (let i = 0; i < poly.length; i++) d = Math.min(d, distToSegment(p, poly[i], poly[(i + 1) % poly.length]))
  return d
}

// ---------------------------------------------------------------------------------------------
// level builders
// ---------------------------------------------------------------------------------------------

/**
 * @typedef {object} LevelBuild
 * @property {string} levelId
 * @property {MeshBuilder} opaque
 * @property {MeshBuilder} roofs
 * @property {MeshBuilder} glass
 * @property {MeshBuilder} decals
 * @property {MeshBuilder} ghost
 * @property {object[]} signs
 * @property {object[]} floorTexts
 * @property {object[]} bayTexts
 * @property {object[]} pins
 * @property {object[]} labels
 * @property {object[]} pickables
 * @property {object[]} bays
 * @property {Array<{polygon: XY[], type: string, id: string}>} pickPolygons
 * @property {{minX:number,minY:number,maxX:number,maxY:number}} bounds
 */

function newBuild(registry, level) {
  return {
    levelId: level.id,
    opaque: new MeshBuilder(registry),
    roofs: new MeshBuilder(registry),
    glass: new MeshBuilder(registry),
    decals: new MeshBuilder(registry),
    ghost: new MeshBuilder(registry),
    // free-standing QR floor tiles: their own mesh, hidden in the Walk view
    plates: new MeshBuilder(registry),
    signs: [],
    floorTexts: [],
    bayTexts: [],
    pins: [],
    labels: [],
    pickables: [],
    bays: [],
    pickPolygons: [],
    bounds: polygonBounds(level.outline),
  }
}

function levelData(index, levelId) {
  const v = index.venue
  const on = (arr) => (Array.isArray(arr) ? arr.filter((x) => x.levelId === levelId) : [])
  return {
    units: on(v.units),
    openings: on(v.openings),
    amenities: on(v.amenities),
    anchors: on(v.anchors),
    landmarks: on(v.landmarks),
    areas: on(v.areas),
    zones: on(v.parking?.zones),
    bays: on(v.parking?.bays),
    pillars: on(v.parking?.pillars),
    edges: (v.graph?.edges ?? []).filter((e) => {
      const a = index.nodeById.get(e.from)
      const b = index.nodeById.get(e.to)
      return a && b && a.levelId === levelId && b.levelId === levelId
    }),
    connectors: (v.connectors ?? []).filter((c) => (c.stops ?? []).some((s) => s.levelId === levelId)),
  }
}

/** Ghost outline (shown faintly for the level above/below in floor view). */
function buildGhost(build, level, units) {
  build.ghost.strip(ensureCCW(level.outline), 0.45, 0.02, 'ghost', true)
  for (const u of units) build.ghost.strip(ensureCCW(u.polygon), 0.25, 0.02, 'ghost', true)
}

function slab(build, level, holes, topKey) {
  const outline = ensureCCW(level.outline)
  build.opaque.flat(outline, 0, topKey, { holes })
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % outline.length]
    const u = norm(sub(b, a))
    build.opaque.vquad(a, b, -SLAB, 0, 'slabSide', [u[1], -u[0]], {})
  }
  build.opaque.strip(outline, 0.3, 0.004, 'slabEdge', true)
}

/**
 * Build a retail level.
 * @param {object} index VenueIndex
 * @param {object} level
 * @param {import('./palette.js').ColorRegistry} registry
 * @returns {LevelBuild}
 */
export function buildRetailLevel(index, level, registry) {
  const build = newBuild(registry, level)
  const D = levelData(index, level.id)
  const voids = D.areas.filter((a) => a.kind === 'void').map((a) => a.polygon)
  const atrium = D.landmarks.find((l) => l.kind === 'atrium' && Array.isArray(l.polygon))
  if (atrium && !voids.length) voids.push(atrium.polygon)
  slab(build, level, voids, 'slab')
  const outlinePoly = ensureCCW(level.outline)

  // walkable patches
  const areaKey = { corridor: 'walkway', passage: 'walkway', gallery: 'walkway', court: 'court', seating: 'seating', lobby: 'lobby' }
  for (const ar of D.areas) {
    if (ar.kind === 'outdoor') {
      // plaza outside the building: its own thin slab + kerb
      const p = ensureCCW(ar.polygon)
      build.opaque.flat(p, -0.03, 'paving')
      for (let i = 0; i < p.length; i++) {
        const a = p[i]
        const b = p[(i + 1) % p.length]
        const u = norm(sub(b, a))
        const onOutline = distToPolygon(mul(add(a, b), 0.5), outlinePoly) < 0.05
        if (onOutline) continue
        build.opaque.vquad(a, b, -SLAB, -0.03, 'slabSide', [u[1], -u[0]], {})
        build.opaque.strip([a, b], 0.35, 0.0, 'stoneDark')
      }
      continue
    }
    if (ar.kind === 'escalator') {
      build.opaque.flat(ensureCCW(ar.polygon), 0.008, 'escPit')
      continue
    }
    const key = areaKey[ar.kind]
    if (key) {
      const holes = voids.filter((v) => v.every((pt) => pointInPolygon(pt, ar.polygon) || distToPolygon(pt, ar.polygon) < 1e-6))
      build.opaque.flat(ensureCCW(ar.polygon), 0.008, key, { holes })
    }
  }

  // units
  const openingsByUnit = new Map()
  for (const o of D.openings) {
    if (!openingsByUnit.has(o.unitId)) openingsByUnit.set(o.unitId, [])
    openingsByUnit.get(o.unitId).push(o)
  }
  const amenityByUnit = new Map()
  for (const a of D.amenities) if (a.unitId) amenityByUnit.set(a.unitId, a)
  const unitHeight = new Map()

  for (const unit of D.units) {
    const poly = ensureCCW(unit.polygon)
    const occ = unit.occupantId ? index.occupantById.get(unit.occupantId) : null
    const amen = amenityByUnit.get(unit.id)
    let style
    if (occ) {
      const cat = CATEGORY_COLORS[occ.category] ?? CATEGORY_COLORS.services
      const big = unit.kind === 'anchor'
      const H = big ? ANCHOR_H : WALL_H
      style = {
        H,
        wallKey: 'side:' + cat,
        catKey: 'sign:' + cat,
        signDark: 'dark:' + cat,
        roofKey: 'roof:' + cat,
        floorKey: 'floor:' + cat,
        litKey: 'lit:' + cat,
        doorH: big ? 3.0 : 2.6,
        signBottom: big ? 3.15 : 2.72,
        signTop: big ? H + 0.55 : H + 0.36,
        signText: occ.sign ?? occ.name,
        signScale: 1,
      }
    } else if (amen) {
      const col = PIN_COLORS[amenityGroup(amen.category)]
      style = {
        H: WALL_H,
        wallKey: 'side:' + col,
        catKey: 'sign:' + col,
        signDark: 'dark:' + col,
        roofKey: 'roof:' + col,
        floorKey: 'floor:' + col,
        litKey: 'lit:' + col,
        doorH: 2.5,
        signBottom: 2.72,
        signTop: WALL_H + 0.3,
        signText: amen.name,
        signScale: 0.82,
      }
    } else {
      style = {
        H: SERVICE_H,
        wallKey: 'wall',
        catKey: 'wall',
        signDark: 'wall',
        roofKey: 'roofService',
        floorKey: 'serviceFloor',
        doorH: 2.4,
        signBottom: 2.5,
        signTop: 3.0,
        signText: null,
      }
    }
    unitHeight.set(unit.id, style.H)
    buildUnitRoof(build, poly, style)
    const refId = occ?.id ?? amen?.id ?? null
    buildUnitWalls(build, poly, style, openingsByUnit.get(unit.id) ?? [], (s) => build.signs.push({ ...s, refId }))

    if (occ) {
      const lp = labelPoint(poly)
      const area = Math.abs(polygonArea(poly))
      const score = occ.landmarkScore ?? 0
      build.labels.push({
        id: 'lbl-' + unit.id,
        type: 'occupant',
        pickType: 'occupant',
        pickId: occ.id,
        refOccupantId: occ.id,
        levelId: level.id,
        x: lp[0],
        y: lp[1],
        h: style.H + 0.9,
        text: occ.name,
        priority: score + Math.min(0.9, area / 1200),
        px: score >= 3 ? 15 : 14,
      })
      build.pickables.push({ type: 'occupant', id: occ.id, levelId: level.id, x: lp[0], y: lp[1], h: style.H + 0.9 })
      build.pickPolygons.push({ polygon: poly, type: 'occupant', id: occ.id, h: style.H })
    } else if (amen) {
      build.pickPolygons.push({ polygon: poly, type: 'amenity', id: amen.id, h: style.H })
    }
  }

  // landmarks
  for (const lm of D.landmarks) {
    if (lm.kind === 'fountain') buildFountain(build, lm.point, lm.radius ?? 3)
    if (lm.kind === 'atrium') buildRail(build, lm.polygon ?? voids[0], lm.railHeightM ?? 1.1)
    build.labels.push({
      id: 'lbl-' + lm.id,
      type: 'landmark',
      pickType: 'landmark',
      pickId: lm.id,
      levelId: level.id,
      x: lm.point[0],
      y: lm.point[1],
      h: lm.kind === 'fountain' ? 3.2 : 1.5,
      text: lm.name,
      priority: (lm.landmarkScore ?? 3) + 0.5,
      px: 15,
    })
  }

  // food court tables, kept clear of walking edges
  const edgeSegs = D.edges.map((e) => [index.nodeById.get(e.from).point, index.nodeById.get(e.to).point])
  const clearOfEdges = (p, r) => edgeSegs.every(([a, b]) => distToSegment(p, a, b) > r)
  for (const ar of D.areas.filter((a) => a.kind === 'seating')) {
    const bb = polygonBounds(ar.polygon)
    for (let x = bb.minX + 2.2; x <= bb.maxX - 2.0; x += 3.6) {
      for (let y = bb.minY + 2.2; y <= bb.maxY - 2.0; y += 3.4) {
        const p = [x, y]
        if (!pointInPolygon(p, ar.polygon) || distToPolygon(p, ar.polygon) < 1.6 || !clearOfEdges(p, 1.9)) continue
        build.opaque.cylinder(x, y, 0.07, 0, 0.72, 6, 'metal', 'metal')
        build.opaque.cylinder(x, y, 0.6, 0.72, 0.78, 14, 'wood', 'wood')
        for (const [dx, dy] of [
          [1.0, 0],
          [-1.0, 0],
          [0, 1.0],
          [0, -1.0],
        ]) {
          build.opaque.box(x + dx, y + dy, 0.46, 0.46, 0, 0, 0.46, 'seat', 'seat', { ao: true })
        }
      }
    }
  }

  // palms: court corners and the outdoor plaza, kept clear of edges and obstacles
  const obstacles = D.areas.filter((a) => !a.walkable).map((a) => a.polygon)
  for (const ar of D.areas.filter((a) => a.kind === 'court' || a.kind === 'outdoor')) {
    const bb = polygonBounds(ar.polygon)
    const inset = 2.2
    const cands = [
      [bb.minX + inset, bb.minY + inset],
      [bb.maxX - inset, bb.minY + inset],
      [bb.minX + inset, bb.maxY - inset],
      [bb.maxX - inset, bb.maxY - inset],
    ]
    for (const p of cands) {
      if (!pointInPolygon(p, ar.polygon) || !clearOfEdges(p, 2.0)) continue
      if (obstacles.some((o) => pointInPolygon(p, o) || distToPolygon(p, o) < 1.5)) continue
      if (voids.some((o) => pointInPolygon(p, o) || distToPolygon(p, o) < 1.5)) continue
      buildPalm(build, p[0], p[1], ar.kind === 'outdoor' ? 1.15 : 0.9)
    }
  }

  // amenities: pins (+ kiosks for free-standing ones)
  for (const am of D.amenities) {
    const icon = iconForAmenity(am.category)
    const inUnit = am.unitId && unitHeight.has(am.unitId)
    const [x, y] = am.point
    if (!inUnit) {
      if (am.category === 'atm') {
        build.opaque.box(x, y + 0.2, 1.0, 0.7, 0, 0, 1.9, 'door', 'metal', { ao: true })
        build.opaque.box(x, y - 0.17, 0.7, 0.05, 0, 1.1, 1.55, 'hex:#7AB0FF', 'hex:#1F2937', { ao: false })
      } else if (am.category === 'info_desk') {
        build.opaque.box(x, y, 2.6, 1.0, 0, 0, 1.05, 'stone', 'hex:#475569', { ao: true })
        build.opaque.box(x, y, 2.8, 1.15, 0, 1.05, 1.12, 'wood', 'wood', { ao: false })
      } else if (am.category === 'taxi_pickup') {
        build.opaque.box(x, y, 0.14, 0.14, 0, 0, 2.6, 'post', 'post', { ao: true })
        build.opaque.box(x, y, 1.0, 0.12, 0, 2.2, 2.9, 'hex:#F5B700', 'hex:#0B0F14', { ao: false })
      }
    }
    build.pins.push({
      id: am.id,
      type: 'amenity',
      icon,
      x,
      y,
      h: inUnit ? unitHeight.get(am.unitId) + 0.7 : 3.1,
      priority: 6,
      stack: false,
    })
    build.labels.push({
      id: 'lbl-' + am.id,
      type: 'amenity',
      pickType: 'amenity',
      pickId: am.id,
      levelId: level.id,
      x,
      y,
      h: inUnit ? unitHeight.get(am.unitId) + 0.7 : 3.1,
      text: am.name,
      priority: 0.4,
      px: 13,
      offsetPx: 11,
      modes: 'flat',
    })
    build.pickables.push({ type: 'amenity', id: am.id, levelId: level.id, x, y, h: inUnit ? unitHeight.get(am.unitId) + 0.7 : 3.1 })
  }

  buildConnectorsOnLevel(build, index, level, D, WALL_H)
  buildAnchors(build, level, D, [])
  buildGhost(build, level, D.units)
  build.levelBadge = levelBadge(index, level)
  return build
}

/**
 * Short level code as printed on the lift buttons ("B1", "G", "1"), in both languages, like the screens
 * (ui/model.levelButtonLabel): the Arabic codes «أ» / «١» are a near-identical pair of strokes and «ب١» can read like
 * «با». Else the level's shortName.
 */
function levelCode(index, level) {
  let code = level.shortName?.en ?? level.id
  for (const conn of index.venue.connectors ?? []) {
    const stop = conn.type === 'lift' ? (conn.stops ?? []).find((st) => st.levelId === level.id) : null
    if (stop?.buttonLabel?.en) {
      code = stop.buttonLabel.en
      break
    }
  }
  return { en: code, ar: code }
}

function levelBadge(index, level) {
  const b = polygonBounds(level.outline)
  return {
    id: 'lbl-level-' + level.id,
    type: 'level',
    levelId: level.id,
    x: b.minX + 18,
    y: b.minY - 3,
    h: 0,
    text: { en: level.name.en, ar: level.name.ar },
    shortText: levelCode(index, level),
    priority: 50,
    px: 15,
    modes: 'stack',
  }
}

function buildConnectorsOnLevel(build, index, level, D, H) {
  for (const conn of D.connectors) {
    const stop = conn.stops.find((s) => s.levelId === level.id)
    if (!stop) continue
    if (conn.type === 'lift' && Array.isArray(conn.shaft)) {
      const r = buildLiftShaft(build, conn, level.kind === 'parking' ? 3.2 : H, (s) => build.signs.push({ ...s, refId: conn.id }), level.kind === 'parking')
      build.pins.push({ id: conn.id, type: 'connector', icon: 'lift', x: r.centroid[0], y: r.centroid[1], h: r.top + 1.0, priority: 8, stack: true })
      build.labels.push({
        id: `lbl-${conn.id}-${level.id}`,
        type: 'connector',
        pickType: 'connector',
        pickId: conn.id,
        levelId: level.id,
        x: r.centroid[0],
        y: r.centroid[1],
        h: r.top + 1.0,
        text: conn.name,
        priority: 0.8,
        px: 13,
        offsetPx: 11,
        modes: 'flat',
      })
      build.pickables.push({ type: 'connector', id: conn.id, levelId: level.id, x: stop.point[0], y: stop.point[1], h: 1.5 })
    } else if (conn.type === 'stairs' && Array.isArray(conn.shaft)) {
      const r = buildStairs(build, conn, level.kind === 'parking' ? 3.2 : H)
      build.pins.push({ id: conn.id, type: 'connector', icon: 'stairs', x: r.centroid[0], y: r.centroid[1], h: H + 1.4, priority: 6.5, stack: false })
      build.pickables.push({ type: 'connector', id: conn.id, levelId: level.id, x: stop.point[0], y: stop.point[1], h: 1.5 })
    } else if (conn.type === 'escalator') {
      build.pins.push({
        id: conn.id,
        type: 'connector',
        icon: 'escalator',
        x: stop.point[0],
        y: stop.point[1],
        h: 2.6,
        priority: 7,
        stack: false,
      })
      build.pickables.push({ type: 'connector', id: conn.id, levelId: level.id, x: stop.point[0], y: stop.point[1], h: 1.2 })
    }
  }
}

function buildAnchors(build, level, D, pillars) {
  for (const an of D.anchors) {
    let mounted = false
    if (an.kind === 'parking_pillar') {
      mounted = pillars.some((p) => Math.hypot(p.center[0] - an.point[0], p.center[1] - an.point[1]) < (p.size ?? 0.6) + 0.5)
    }
    buildPlate(build, an, mounted)
    build.pickables.push({ type: 'anchor', id: an.id, levelId: level.id, x: an.point[0], y: an.point[1], h: mounted ? 1.45 : 0.05 })
    // a tappable QR pin, shown only while a scan sheet asks for a plate (overlay scanKinds); entrances have their own
    if (an.kind !== 'entrance') build.pins.push({ id: an.id, type: 'anchor', icon: 'qr', x: an.point[0], y: an.point[1], h: mounted ? 1.7 : 0.3, priority: 4, stack: false, scan: true, kind: an.kind })
    if (an.kind === 'entrance') {
      const gate = buildEntrance(build, an, level, D.areas, (s) => build.signs.push({ ...s, refId: an.id }))
      if (gate) {
        build.pins.push({ id: an.id, type: 'anchor', icon: 'entrance', x: gate.center[0] + gate.nOut[0] * 2.5, y: gate.center[1] + gate.nOut[1] * 2.5, h: 5.2, priority: 9, stack: true })
      }
    }
  }
}

/**
 * Build a parking level.
 * @param {object} index
 * @param {object} level
 * @param {import('./palette.js').ColorRegistry} registry
 * @returns {LevelBuild}
 */
export function buildParkingLevel(index, level, registry) {
  const build = newBuild(registry, level)
  const D = levelData(index, level.id)
  slab(build, level, [], 'asphalt')

  for (const ar of D.areas) {
    const p = ensureCCW(ar.polygon)
    const bb = polygonBounds(p)
    if (ar.kind === 'aisle') {
      build.opaque.flat(p, 0.008, 'aisle')
      // dashed centre line along the long axis
      const horizontal = bb.maxX - bb.minX >= bb.maxY - bb.minY
      const L0 = horizontal ? bb.minX : bb.minY
      const L1 = horizontal ? bb.maxX : bb.maxY
      const mid = horizontal ? (bb.minY + bb.maxY) / 2 : (bb.minX + bb.maxX) / 2
      for (let s = L0 + 1.5; s + 2 <= L1 - 1; s += 4) {
        const a = horizontal ? [s, mid] : [mid, s]
        const b = horizontal ? [s + 2, mid] : [mid, s + 2]
        if (!pointInPolygon(a, p) || !pointInPolygon(b, p)) continue
        build.opaque.strip([a, b], 0.16, 0.02, 'aisleLine')
      }
    } else if (ar.kind === 'lobby') {
      build.opaque.flat(p, 0.012, 'lobbyPark')
      build.opaque.strip(p, 0.15, 0.022, 'aisleLine', true)
    } else if (ar.kind === 'ramp') {
      build.opaque.flat(p, 0.008, 'hatchDark')
      if (isConvex(p)) {
        const span = bb.maxX - bb.minX + bb.maxY - bb.minY
        for (let s = -span; s < span; s += 1.6) {
          const stripe = [
            [bb.minX + s, bb.minY],
            [bb.minX + s + 0.6, bb.minY],
            [bb.minX + s + 0.6 + span, bb.minY + span],
            [bb.minX + s + span, bb.minY + span],
          ]
          const part = clipConvex(stripe, p)
          if (part.length >= 3 && Math.abs(polygonArea(part)) > 0.01) build.opaque.flat(part, 0.02, 'hatch')
        }
      }
    }
  }

  // back-of-house blocks
  for (const unit of D.units) {
    const poly = ensureCCW(unit.polygon)
    buildUnitRoof(build, poly, { H: PARK_SERVICE_H, roofKey: 'concreteTop', floorKey: 'concrete' })
    buildUnitWalls(build, poly, { H: PARK_SERVICE_H, wallKey: 'concrete', catKey: 'concrete', signDark: 'concrete', doorH: 2.4, signBottom: 2.4, signTop: 2.8, signText: null }, [], () => {})
  }

  // zones: decal + painted name in the biggest aisle stretch inside the zone
  const aisles = D.areas.filter((a) => a.kind === 'aisle')
  for (const z of D.zones) {
    const zp = ensureCCW(z.polygon)
    build.decals.flat(zp, 0.07, 'hex:' + z.color)
    let best = null
    for (const a of aisles) {
      const part = clipConvex(a.polygon, zp)
      if (part.length < 3) continue
      const area = Math.abs(polygonArea(part))
      if (!best || area > best.area) best = { part, area }
    }
    const target = best ? best.part : zp
    const bb = polygonBounds(target)
    const horizontal = bb.maxX - bb.minX >= bb.maxY - bb.minY
    const c = polygonCentroid(target)
    const runLen = horizontal ? bb.maxX - bb.minX : bb.maxY - bb.minY
    const across = horizontal ? bb.maxY - bb.minY : bb.maxX - bb.minX
    // the zone as a sign: its pictogram pin and name (readable at any zoom, unlike the floor paint)
    build.pins.push({ id: z.id, type: 'zone', icon: zonePinId(z.id), x: c[0], y: c[1], h: 3.4, priority: 5, stack: false })
    build.labels.push({
      id: 'lbl-' + z.id,
      type: 'zone',
      levelId: level.id,
      x: c[0],
      y: c[1],
      h: 3.4,
      text: z.label,
      priority: 1.5,
      px: 14,
      offsetPx: 11,
      modes: 'flat',
    })
    build.floorTexts.push({
      x: c[0],
      y: c[1],
      h: 0.09,
      flat: true,
      rotY: horizontal ? 0 : Math.PI / 2,
      width: Math.min(runLen - 2, 26),
      height: Math.min(across * 0.85, 5),
      text: z.label,
      size: Math.min(across * 0.3, 1.8),
      opacity: 0.92,
      hideSideways: true,
    })
  }

  // pillars with zone bands + labels
  const zoneById = new Map(D.zones.map((z) => [z.id, z]))
  for (const pl of D.pillars) {
    const z = zoneById.get(pl.zoneId)
    const s = pl.size ?? 0.6
    const [x, y] = pl.center
    build.opaque.box(x, y, s, s, 0, 0, 2.0, 'pillar', 'pillar', { ao: true })
    build.opaque.box(x, y, s + 0.04, s + 0.04, 0, 2.0, 2.8, 'hex:' + (z?.color ?? '#475569'), 'hex:' + (z?.color ?? '#475569'), { ao: false, unlit: true })
    build.opaque.box(x, y, s, s, 0, 2.8, 3.6, 'concreteTop', 'pillar', { ao: false })
    if (z) {
      const word = (str) => String(str).split('·')[0].trim()
      const f = headingVec(pl.facingDeg ?? 180)
      for (const dir of [f, mul(f, -1)]) {
        const c = add([x, y], mul(dir, s / 2 + 0.03))
        build.signs.push({
          x: c[0],
          y: c[1],
          h: 2.4,
          rotY: faceRotY(dir),
          width: s * 0.95,
          height: 0.75,
          text: { en: word(z.label.en).toUpperCase(), ar: word(z.label.ar) },
          size: 0.2,
        })
      }
    }
  }

  // bays (instanced later) + codes
  for (const b of D.bays) {
    const z = zoneById.get(b.zoneId)
    build.bays.push({ ...b, zoneColor: z?.color ?? '#475569' })
    const f = headingVec(b.angleDeg ?? 0)
    const mouth = add(b.center, mul(f, -((b.l ?? 5) / 2 - 1.0)))
    build.bayTexts.push({
      x: mouth[0],
      y: mouth[1],
      h: 0.09,
      flat: true,
      rotY: (-(b.angleDeg ?? 0) * Math.PI) / 180,
      width: (b.w ?? 2.5) - 0.3,
      height: 1,
      text: { en: b.code, ar: b.code },
      size: 0.5,
      langs: 'en',
    })
    build.pickables.push({ type: 'bay', id: b.id, levelId: level.id, x: b.center[0], y: b.center[1], h: 0.2, nearOnly: true })
  }

  buildConnectorsOnLevel(build, index, level, D, 3.2)
  buildAnchors(build, level, D, D.pillars)
  buildGhost(build, level, D.units)
  build.levelBadge = levelBadge(index, level)
  return build
}

/**
 * Escalator geometry spanning two levels. Built with rise fractions so the ramp follows the
 * current stack layout (see geometry.setRise). Returns `{ deck, panels, arrows }`: the opaque deck, steps, truss and
 * handrail; the balustrade side panels (glass in storm, opaque in classic: engine buildConnectors); the arrows painted
 * on the steps (map views only).
 * @param {object} conn
 * @param {import('./palette.js').ColorRegistry} registry
 * @param {{elevLow:number, elevHigh:number, lowStop:object, highStop:object}} info
 */
export function buildEscalator(conn, registry, info) {
  const B = new MeshBuilder(registry, { rise: true })
  const pl = info.lowStop.point
  const ph = info.highStop.point
  const d = sub(ph, pl)
  const L = len(d)
  const u = mul(d, 1 / L)
  const side = [-u[1], u[0]]
  const w = conn.widthM ?? 1.4
  const hw = w / 2
  const landing = Math.min(1.4, L * 0.15)
  const frac = (s) => Math.max(0, Math.min(1, (s - landing) / (L - 2 * landing)))
  const P = (s, o) => add(add(pl, mul(u, s)), mul(side, o))
  const goingUp = conn.direction !== 'down' // travel from low to high
  const N = Math.max(8, Math.round(L / 0.5))
  // deck (striped)
  for (let k = 0; k < N; k++) {
    const s0 = (L * k) / N
    const s1 = (L * (k + 1)) / N
    const key = k % 2 ? 'escDeck' : 'escDeck2'
    const a = P(s0, -hw)
    const b = P(s0, hw)
    const c = P(s1, hw)
    const e = P(s1, -hw)
    const ia = B.v(a[0], a[1], 0.06, key, 1, frac(s0))
    const ib = B.v(b[0], b[1], 0.06, key, 1, frac(s0))
    const ic = B.v(c[0], c[1], 0.06, key, 1, frac(s1))
    const ie = B.v(e[0], e[1], 0.06, key, 1, frac(s1))
    B.triN(ia, ib, ic, 0, 1, 0)
    B.triN(ia, ic, ie, 0, 1, 0)
  }
  // chevrons in the direction of travel, painted on the steps for the map views (their own builder: the Walk view, which
  // rides the moving steps, does not draw them)
  const A = new MeshBuilder(registry, { rise: true })
  const nCh = Math.max(3, Math.floor((L - 2 * landing) / 2.2))
  for (let k = 0; k < nCh; k++) {
    const sc = landing + ((L - 2 * landing) * (k + 0.5)) / nCh
    const dir = goingUp ? 1 : -1
    const tipS = sc + dir * 0.35
    const backS = sc - dir * 0.35
    const arm = hw * 0.62
    const th = 0.16
    for (const sgn of [-1, 1]) {
      const p1 = P(tipS, 0)
      const p2 = P(backS, sgn * arm)
      const p3 = P(backS - dir * th, sgn * arm)
      const p4 = P(tipS - dir * th, 0)
      const ids = [p1, p2, p3, p4].map((p, i) => {
        const s = i === 0 || i === 3 ? (i === 0 ? tipS : tipS - dir * th) : i === 1 ? backS : backS - dir * th
        return A.v(p[0], p[1], 0.075, 'escChev', 1, frac(s))
      })
      A.triN(ids[0], ids[1], ids[2], 0, 1, 0)
      A.triN(ids[0], ids[2], ids[3], 0, 1, 0)
    }
  }
  // balustrades (follow the profile): an opaque truss skirt under the deck, then the side panels up to the handrail in
  // their own builder (storm draws them with the storefront glass, classic opaque as in v0.1; both faces, each culled)
  const G = new MeshBuilder(registry, { rise: true })
  const quad = (M, a, b, h0, h1, key, s0, s1, f0, f1, n) => {
    const q = [M.v(a[0], a[1], h0, key, s0, f0), M.v(b[0], b[1], h0, key, s0, f1), M.v(b[0], b[1], h1, key, s1, f1), M.v(a[0], a[1], h1, key, s1, f0)]
    M.triN(q[0], q[1], q[2], n[0], 0, -n[1])
    M.triN(q[0], q[2], q[3], n[0], 0, -n[1])
  }
  for (const sgn of [-1, 1]) {
    const o = sgn * (hw + 0.08)
    const nOut = mul(side, sgn)
    for (let k = 0; k < N; k++) {
      const s0 = (L * k) / N
      const s1 = (L * (k + 1)) / N
      const a = P(s0, o)
      const b = P(s1, o)
      const f0 = frac(s0)
      const f1 = frac(s1)
      const sh = wallShade(nOut[0], nOut[1])
      quad(B, a, b, -0.7, 0.06, 'escSide', sh * 0.85, sh * 0.917, f0, f1, nOut)
      quad(G, a, b, 0.06, 1.0, 'escPanel', sh * 0.917, sh, f0, f1, nOut)
      quad(G, a, b, 0.06, 1.0, 'escPanel', sh * 0.9, sh * 0.9, f0, f1, mul(nOut, -1))
      // handrail top
      const a2 = P(s0, o + sgn * 0.12)
      const b2 = P(s1, o + sgn * 0.12)
      const a3 = P(s0, o - sgn * 0.06)
      const b3 = P(s1, o - sgn * 0.06)
      const t = [B.v(a3[0], a3[1], 1.0, 'strip', 1, f0), B.v(b3[0], b3[1], 1.0, 'strip', 1, f1), B.v(b2[0], b2[1], 1.0, 'strip', 1, f1), B.v(a2[0], a2[1], 1.0, 'strip', 1, f0)]
      B.triN(t[0], t[1], t[2], 0, 1, 0)
      B.triN(t[0], t[2], t[3], 0, 1, 0)
    }
  }
  // underside
  for (let k = 0; k < N; k++) {
    const s0 = (L * k) / N
    const s1 = (L * (k + 1)) / N
    const a = P(s0, -hw - 0.08)
    const b = P(s0, hw + 0.08)
    const c = P(s1, hw + 0.08)
    const e = P(s1, -hw - 0.08)
    const ids = [B.v(a[0], a[1], -0.7, 'escSide', 0.7, frac(s0)), B.v(b[0], b[1], -0.7, 'escSide', 0.7, frac(s0)), B.v(c[0], c[1], -0.7, 'escSide', 0.7, frac(s1)), B.v(e[0], e[1], -0.7, 'escSide', 0.7, frac(s1))]
    B.triN(ids[0], ids[1], ids[2], 0, -1, 0)
    B.triN(ids[0], ids[2], ids[3], 0, -1, 0)
  }
  return { deck: B, panels: G, arrows: A }
}

/**
 * Lift glass column joining all its stops (stack view only). Rise geometry: fraction 0 at the lowest
 * stop, 1 at the highest.
 */
export function buildLiftColumn(conn, registry) {
  const B = new MeshBuilder(registry, { rise: true })
  const shaft = ensureCCW(conn.shaft)
  const c = polygonCentroid(shaft)
  const small = shaft.map((p) => add(c, mul(sub(p, c), 0.7)))
  for (let i = 0; i < small.length; i++) {
    const a = small[i]
    const b = small[(i + 1) % small.length]
    const u = norm(sub(b, a))
    const nOut = [u[1], -u[0]]
    const ids = [B.v(a[0], a[1], 0, 'glass', 1, 0), B.v(b[0], b[1], 0, 'glass', 1, 0), B.v(b[0], b[1], 3.6, 'glass', 1, 1), B.v(a[0], a[1], 3.6, 'glass', 1, 1)]
    B.triN(ids[0], ids[1], ids[2], nOut[0], 0, -nOut[1])
    B.triN(ids[0], ids[2], ids[3], nOut[0], 0, -nOut[1])
  }
  return B
}

export { triangulate }
