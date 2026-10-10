/**
 * Walk-view-only geometry for one level (DESIGN-GLASS.md 5.5), built lazily the first time the Walk view shows the
 * level and disposed with the venue:
 * - a ceiling (single-sided, facing down) over the level outline, with holes where the level above opens a void (the
 *   ground floor looks up into the atrium) and, on the top floor, its own voids as a skylight onto the storm sky;
 * - bulkhead fascias from the top of every unit wall (and lift / stair shaft) up to the ceiling, so no gap shows above
 *   the storefronts (the sign boxes stay in front);
 * - light panels along the walking network (retail: 0.6 x 2.4 m every 6 m; parking: 0.15 x 1.8 m tubes every 7 m),
 *   each with a soft halo on the ceiling and a faint reflection streak on the glossy floor;
 * - parking: walls round the outline (a car park is enclosed).
 * Two meshes: `solid` (ceiling, bulkheads, panels: the opaque material) and `glow` (halos and streaks, translucent).
 */
import { MeshBuilder, distToSegment, ensureCCW, orientedRect, pointInPolygon } from './geometry.js'
import { ANCHOR_H, SERVICE_H, WALL_H } from './levels.js'

const RISE = 0.14
const CEIL_RETAIL = 4.6
const CEIL_PARKING = 3.6

/** Void polygons of a level (atrium openings). */
export function levelVoids(index, levelId) {
  const v = index.venue
  const out = (v.areas ?? []).filter((a) => a.levelId === levelId && a.kind === 'void').map((a) => a.polygon)
  if (!out.length) {
    const atrium = (v.landmarks ?? []).find((l) => l.levelId === levelId && l.kind === 'atrium' && Array.isArray(l.polygon))
    if (atrium) out.push(atrium.polygon)
  }
  return out
}

/**
 * Free run (m, up to 9) from a point along a direction before a unit wall or a void: never stand in a shop.
 * @param {object} index VenueIndex
 * @param {string} levelId
 * @param {number} x
 * @param {number} y
 * @param {[number, number]} n unit direction
 */
export function freeRun(index, levelId, x, y, n) {
  const polys = (index.venue.units ?? []).filter((u) => u.levelId === levelId).map((u) => u.polygon).concat(levelVoids(index, levelId))
  for (let d = 0.6; d <= 9; d += 0.25) if (polys.some((pg) => pointInPolygon([x + n[0] * d, y + n[1] * d], pg))) return d
  return 9
}

/**
 * Where the Walk view's arrival stands in front of a sign (DESIGN-GLASS 6.3): on the sign's normal `want` metres out;
 * when a wall or a void is closer than 6 m (a shop facing the atrium), turned 20 / 35 / 50 / 60 degrees along the
 * corridor, the first that gets 6 m (or `want`) away, else wherever it gets furthest (the plain normal on a tie). At
 * least 2 m.
 * @param {object} index VenueIndex
 * @param {string} levelId
 * @param {{ x: number, y: number, rotY: number }} sign
 * @param {number} want metres
 * @returns {{ x: number, y: number, d: number }}
 */
export function arrivalStand(index, levelId, sign, want) {
  const n = [Math.sin(sign.rotY), -Math.cos(sign.rotY)]
  let best = null
  for (const a of [0, 20, -20, 35, -35, 50, -50, 60, -60]) {
    const r = (a * Math.PI) / 180
    const dir = [n[0] * Math.cos(r) - n[1] * Math.sin(r), n[0] * Math.sin(r) + n[1] * Math.cos(r)]
    const d = Math.max(2, Math.min(want, freeRun(index, levelId, sign.x, sign.y, dir) - 0.5))
    if (!best || d > best.d + 0.01) best = { x: sign.x + dir[0] * d, y: sign.y + dir[1] * d, d }
    if (d >= Math.min(want, 6)) break
  }
  return best
}

/**
 * @param {object} index VenueIndex
 * @param {object} level
 * @param {import('./palette.js').ColorRegistry} registry
 * @param {Array<Array<[number, number]>>} holes ceiling openings (voids of the level above, or a skylight)
 * @param {{ lit?: boolean }} [flavour] lit = normals for the lit materials of the v0.3 toy style
 * @returns {{ solid: MeshBuilder, glow: MeshBuilder, ceilH: number }}
 */
export function buildInterior(index, level, registry, holes, flavour = {}) {
  const v = index.venue
  const parking = level.kind === 'parking'
  const solid = new MeshBuilder(registry, { lit: !!flavour.lit })
  const glow = new MeshBuilder(registry)
  const units = (v.units ?? []).filter((u) => u.levelId === level.id)
  const occ = (u) => (u.occupantId ? index.occupantById.get(u.occupantId) : null)
  const amenityUnits = new Set((v.amenities ?? []).filter((a) => a.unitId).map((a) => a.unitId))
  const unitH = (u) => (parking ? 3.0 : occ(u) ? (u.kind === 'anchor' ? ANCHOR_H : WALL_H) : amenityUnits.has(u.id) ? WALL_H : SERVICE_H)
  // high enough for every sign box on the level (anchor signs reach 4.95 m)
  let ceilH = parking ? CEIL_PARKING : CEIL_RETAIL
  for (const u of units) if (!parking && occ(u) && u.kind === 'anchor') ceilH = Math.max(ceilH, ANCHOR_H + 0.6)
  const outline = ensureCCW(level.outline)
  solid.flat(outline, ceilH, 'ceiling', { holes, down: true })

  const fascia = (poly, h0) => {
    const p = ensureCCW(poly)
    if (h0 >= ceilH - 0.01) return
    for (let i = 0; i < p.length; i++) {
      const a = p[i]
      const b = p[(i + 1) % p.length]
      const l = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (l > 1e-6) solid.vquad(a, b, h0, ceilH, 'bulkhead', [(b[1] - a[1]) / l, -(b[0] - a[0]) / l], { unlit: true, shade: 0.92 })
    }
  }
  for (const u of units) fascia(u.polygon, unitH(u) + RISE)
  for (const c of v.connectors ?? []) {
    if (!Array.isArray(c.shaft) || !(c.stops ?? []).some((s) => s.levelId === level.id)) continue
    const H = parking ? 3.2 : WALL_H
    fascia(c.shaft, c.type === 'lift' ? H + 0.52 : H + 0.6)
  }
  if (parking) {
    // enclosing walls, facing in
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i]
      const b = outline[(i + 1) % outline.length]
      const l = Math.hypot(b[0] - a[0], b[1] - a[1])
      solid.vquad(a, b, 0, ceilH, 'wall', [-(b[1] - a[1]) / l, (b[0] - a[0]) / l], { unlit: true, shade: 0.8, keyTop: 'wallInner' })
    }
  }

  // light panels: retail along the walking network (0.6 x 2.4 m every 6 m), parking along the drive aisles
  // (0.15 x 1.8 m tubes every 7 m)
  const nodes = index.nodeById
  const blocked = (p) => holes.some((h) => pointInPolygon(p, h)) || units.some((u) => pointInPolygon(p, u.polygon) || u.polygon.some((q, i) => distToSegment(p, q, u.polygon[(i + 1) % u.polygon.length]) < 0.6))
  const spots = []
  const run = (ax, ay, bx, by, step, inset) => {
    const L = Math.hypot(bx - ax, by - ay)
    const ang = (Math.atan2(bx - ax, by - ay) * 180) / Math.PI
    for (let s = inset; s <= L - inset + 1e-6; s += step) spots.push([ax + ((bx - ax) * s) / L, ay + ((by - ay) * s) / L, ang])
  }
  if (parking) {
    for (const ar of v.areas ?? []) {
      if (ar.levelId !== level.id || ar.kind !== 'aisle') continue
      const xs = ar.polygon.map((q) => q[0])
      const ys = ar.polygon.map((q) => q[1])
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
      if (x1 - x0 >= y1 - y0) run(x0, (y0 + y1) / 2, x1, (y0 + y1) / 2, 7, 2)
      else run((x0 + x1) / 2, y0, (x0 + x1) / 2, y1, 7, 2)
    }
  } else {
    for (const e of v.graph?.edges ?? []) {
      const A = nodes.get(e.from)
      const B = nodes.get(e.to)
      if (e.kind !== 'walk' || !A || !B || A.levelId !== level.id || B.levelId !== level.id) continue
      if (Math.hypot(B.point[0] - A.point[0], B.point[1] - A.point[1]) > 4) run(A.point[0], A.point[1], B.point[0], B.point[1], 6, 1.5)
    }
  }
  const placed = []
  const [pw, pl] = parking ? [0.15, 1.8] : [0.6, 2.4]
  const key = parking ? 'hex:#CFE6FF' : 'ceilingPanel'
  for (const [x, y, ang] of spots) {
    if (blocked([x, y]) || placed.some((q) => Math.hypot(q[0] - x, q[1] - y) < 2.2)) continue
    placed.push([x, y])
    solid.flat(orientedRect(x, y, pw, pl, ang), ceilH - 0.01, key, { down: true })
    glow.flat(orientedRect(x, y, pw + 0.8, pl + 0.8, ang), ceilH - 0.005, key, { down: true })
    glow.flat(orientedRect(x, y, pw + 0.1, pl, ang), 0.013, key)
  }
  return { solid, glow, ceilH }
}
