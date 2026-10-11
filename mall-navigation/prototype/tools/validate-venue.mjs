#!/usr/bin/env node
/**
 * Dallni venue validator (schema dallni.venue/0.1, see CONTRACT.md section 2).
 *
 * Usage:  node tools/validate-venue.mjs public/venues/demo-muscat/venue.json
 * Prints a report and exits with code 1 when any error is found.
 *
 * Also exported for tests and for the generator:
 *   validateVenue(venueJson, { fontsDir }) -> { errors, warnings, info, summary }
 *   geom  (small 2D geometry kit shared with tools/generate-demo-venue.mjs)
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url))
export const DEFAULT_FONTS_DIR = resolve(TOOLS_DIR, '../src/assets/fonts')

export const SCHEMA = 'dallni.venue/0.1'
export const NODE_KINDS = ['corridor', 'door', 'connector', 'anchor', 'amenity', 'bay', 'entrance', 'parking_aisle']
export const EDGE_KINDS = ['walk', 'parking_walk', 'escalator', 'lift', 'stairs']
export const WALK_EDGE_KINDS = ['walk', 'parking_walk']
export const CATEGORIES = ['fashion', 'food', 'cafe', 'electronics', 'beauty', 'kids', 'grocery', 'entertainment', 'home', 'health', 'services']
export const AMENITY_CATEGORIES = [
  'musalla_men', 'musalla_women', 'wudu_men', 'wudu_women',
  'restroom_men', 'restroom_women', 'restroom_accessible', 'restroom_family',
  'baby_change_men', 'baby_change_women', 'baby_change_family',
  'accessible_parking', 'atm', 'pharmacy', 'first_aid', 'info_desk', 'valet', 'taxi_pickup',
]
export const UNIT_KINDS = ['shop', 'anchor', 'food', 'amenity', 'service']
/** Walkable area kinds (people may stand / walk there). */
export const WALKABLE_AREA_KINDS = ['corridor', 'court', 'passage', 'gallery', 'seating', 'lobby', 'aisle', 'outdoor']
/** Obstacles drawn on top of a walkable area (not part of the floor tiling). */
export const OVERLAY_AREA_KINDS = ['void', 'fountain', 'escalator']
/** Areas outside the building outline (not part of the floor tiling). */
export const OUTSIDE_AREA_KINDS = ['outdoor']

// ---------------------------------------------------------------------------
// Geometry kit
// ---------------------------------------------------------------------------
const EPS = 1e-9

function round2(v) {
  return Math.round(v * 100) / 100
}
function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}
function signedArea(poly) {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % poly.length]
    s += x1 * y2 - x2 * y1
  }
  return s / 2
}
function bbox(poly) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of poly) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}
function pointInPolygon(p, poly) {
  const [px, py] = p
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
function projectToSegment(p, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  let t = len2 < EPS ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const point = [a[0] + t * dx, a[1] + t * dy]
  return { point, t, d: dist(p, point) }
}
function distToSegment(p, a, b) {
  return projectToSegment(p, a, b).d
}
function distToBoundary(p, poly) {
  let best = Infinity
  for (let i = 0; i < poly.length; i++) {
    const d = distToSegment(p, poly[i], poly[(i + 1) % poly.length])
    if (d < best) best = d
  }
  return best
}
function insideOrOn(p, poly, tol = 0.05) {
  return pointInPolygon(p, poly) || distToBoundary(p, poly) <= tol
}
function strictlyInside(p, poly, tol = 0.05) {
  return pointInPolygon(p, poly) && distToBoundary(p, poly) > tol
}
function isConvex(poly) {
  let sign = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const c = poly[(i + 2) % poly.length]
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if (Math.abs(cross) < EPS) continue
    const s = Math.sign(cross)
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}
function ensureCCW(poly) {
  return signedArea(poly) < 0 ? [...poly].reverse() : poly
}
/** Sutherland-Hodgman: clip `subject` by a CONVEX polygon. */
function clipByConvex(subject, clip) {
  const c = ensureCCW(clip)
  let output = subject
  for (let i = 0; i < c.length && output.length; i++) {
    const A = c[i]
    const B = c[(i + 1) % c.length]
    const inside = (p) => (B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]) >= -EPS
    const intersect = (P, Q) => {
      const a1 = B[1] - A[1], b1 = A[0] - B[0], c1 = a1 * A[0] + b1 * A[1]
      const a2 = Q[1] - P[1], b2 = P[0] - Q[0], c2 = a2 * P[0] + b2 * P[1]
      const det = a1 * b2 - a2 * b1
      if (Math.abs(det) < EPS) return Q
      return [(b2 * c1 - b1 * c2) / det, (a1 * c2 - a2 * c1) / det]
    }
    const input = output
    output = []
    for (let j = 0; j < input.length; j++) {
      const cur = input[j]
      const prev = input[(j + input.length - 1) % input.length]
      if (inside(cur)) {
        if (!inside(prev)) output.push(intersect(prev, cur))
        output.push(cur)
      } else if (inside(prev)) {
        output.push(intersect(prev, cur))
      }
    }
  }
  return output
}
function bboxOverlap(a, b) {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)
  const h = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY)
  return w > 0 && h > 0 ? { w, h } : null
}
/** Area (m²) shared by two simple polygons. Exact when one is convex, grid-sampled otherwise. */
function overlapArea(p1, p2) {
  const b1 = bbox(p1)
  const b2 = bbox(p2)
  const o = bboxOverlap(b1, b2)
  if (!o) return 0
  if (isConvex(p2)) return Math.abs(signedArea(clipByConvex(ensureCCW(p1), p2)))
  if (isConvex(p1)) return Math.abs(signedArea(clipByConvex(ensureCCW(p2), p1)))
  const step = 0.25
  const x0 = Math.max(b1.minX, b2.minX)
  const y0 = Math.max(b1.minY, b2.minY)
  let n = 0
  for (let x = x0 + step / 2; x < x0 + o.w; x += step) {
    for (let y = y0 + step / 2; y < y0 + o.h; y += step) {
      if (pointInPolygon([x, y], p1) && pointInPolygon([x, y], p2)) n++
    }
  }
  return n * step * step
}
function samplesAlong(a, b, step = 0.25) {
  const len = dist(a, b)
  const n = Math.max(1, Math.ceil(len / step))
  const out = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
  }
  return out
}
function rectPoly(x0, y0, x1, y1) {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
}

export const geom = {
  round2, dist, signedArea, bbox, pointInPolygon, projectToSegment, distToSegment, distToBoundary,
  insideOrOn, strictlyInside, isConvex, ensureCCW, clipByConvex, overlapArea, samplesAlong, rectPoly,
}

/**
 * Floor-plan context for clearance tests: which places on a level are walkable, which block walking.
 * @param {object} venue
 * @param {string} levelId
 */
export function buildLevelPlan(venue, levelId) {
  const areas = (venue.areas ?? []).filter((a) => a.levelId === levelId)
  const walkable = areas.filter((a) => a.walkable === true).map((a) => a.polygon)
  const blockers = [
    ...areas.filter((a) => a.walkable !== true).map((a) => a.polygon),
    ...(venue.units ?? []).filter((u) => u.levelId === levelId).map((u) => u.polygon),
  ]
  return { walkable, blockers, hasAreas: areas.length > 0 }
}

/** True when every sample of the segment a-b is on a walkable area and outside every blocker. */
export function segmentIsClear(plan, a, b, step = 0.25) {
  for (const p of samplesAlong(a, b, step)) {
    if (!plan.walkable.some((poly) => insideOrOn(p, poly, 0.05))) return false
    if (plan.blockers.some((poly) => strictlyInside(p, poly, 0.05))) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Font coverage (WOFF 1.0 cmap reader, formats 4 and 12)
// ---------------------------------------------------------------------------
export function readWoffCodepoints(path) {
  const buf = readFileSync(path)
  if (buf.toString('latin1', 0, 4) !== 'wOFF') throw new Error(`${path} is not a WOFF 1.0 file`)
  const numTables = buf.readUInt16BE(12)
  let cmap = null
  for (let i = 0; i < numTables; i++) {
    const off = 44 + i * 20
    const tag = buf.toString('latin1', off, off + 4)
    if (tag !== 'cmap') continue
    const offset = buf.readUInt32BE(off + 4)
    const compLength = buf.readUInt32BE(off + 8)
    const origLength = buf.readUInt32BE(off + 12)
    const raw = buf.subarray(offset, offset + compLength)
    cmap = compLength < origLength ? inflateSync(raw) : Buffer.from(raw)
  }
  if (!cmap) throw new Error(`${path} has no cmap table`)
  const set = new Set()
  const numSub = cmap.readUInt16BE(2)
  for (let i = 0; i < numSub; i++) {
    const platformID = cmap.readUInt16BE(4 + i * 8)
    const encodingID = cmap.readUInt16BE(6 + i * 8)
    const subOff = cmap.readUInt32BE(8 + i * 8)
    const unicode = platformID === 0 || (platformID === 3 && (encodingID === 1 || encodingID === 10))
    if (!unicode) continue
    const format = cmap.readUInt16BE(subOff)
    if (format === 4) {
      const segX2 = cmap.readUInt16BE(subOff + 6)
      const ends = subOff + 14
      const starts = ends + segX2 + 2
      const deltas = starts + segX2
      const rangeOffsets = deltas + segX2
      for (let s = 0; s < segX2 / 2; s++) {
        const end = cmap.readUInt16BE(ends + s * 2)
        const start = cmap.readUInt16BE(starts + s * 2)
        const delta = cmap.readInt16BE(deltas + s * 2)
        const ro = cmap.readUInt16BE(rangeOffsets + s * 2)
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let glyph
          if (ro === 0) glyph = (c + delta) & 0xffff
          else {
            const gOff = rangeOffsets + s * 2 + ro + (c - start) * 2
            glyph = cmap.readUInt16BE(gOff)
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff
          }
          if (glyph !== 0) set.add(c)
        }
      }
    } else if (format === 12) {
      const nGroups = cmap.readUInt32BE(subOff + 12)
      for (let g = 0; g < nGroups; g++) {
        const base = subOff + 16 + g * 12
        const start = cmap.readUInt32BE(base)
        const end = cmap.readUInt32BE(base + 4)
        const startGlyph = cmap.readUInt32BE(base + 8)
        for (let c = start; c <= end; c++) if (startGlyph + (c - start) !== 0) set.add(c)
      }
    }
  }
  return set
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
const LATIN_LETTER = /[A-Za-zÀ-ɏ]/
const ARABIC_LETTER = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/
const ASCII_DIGIT = /[0-9]/
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/

const YMD = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const DAYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri']

/** Interval list ([{ open: "HH:MM", close: "HH:MM" }], v0.5 hours; a close at or before the open runs past midnight). */
function badIntervals(v) {
  return !Array.isArray(v) || v.some((iv) => !iv || !HHMM.test(iv.open ?? '') || !HHMM.test(iv.close ?? ''))
}

function isBilingual(v) {
  return v && typeof v === 'object' && !Array.isArray(v) && 'en' in v && 'ar' in v
}

/**
 * @param {object} venue parsed venue.json
 * @param {{ fontsDir?: string|null }} [options] fontsDir=null skips the glyph coverage check
 */
export function validateVenue(venue, options = {}) {
  const errors = []
  const warnings = []
  const info = []
  const err = (m) => errors.push(m)
  const warn = (m) => warnings.push(m)

  if (!venue || typeof venue !== 'object') {
    err('venue is not an object')
    return { errors, warnings, info, summary: null }
  }

  // ---- 1. schema keys ------------------------------------------------------
  if (venue.schema !== SCHEMA) err(`schema must be "${SCHEMA}" (got ${JSON.stringify(venue.schema)})`)
  for (const k of ['meta', 'levels', 'units', 'openings', 'occupants', 'amenities', 'connectors', 'anchors', 'landmarks', 'parking', 'graph']) {
    if (!(k in venue)) err(`missing top-level key "${k}"`)
  }
  const meta = venue.meta ?? {}
  for (const k of ['id', 'name', 'disclaimer', 'version', 'units', 'timezone', 'defaultStartAnchorId', 'bounds']) {
    if (!(k in meta)) err(`meta.${k} missing`)
  }
  if (meta.units !== undefined && meta.units !== 'meters') err('meta.units must be "meters"')
  const b = meta.bounds
  if (b && !(b.maxX > b.minX && b.maxY > b.minY)) err('meta.bounds is empty or inverted')
  // v0.5 hours (optional): mall weekly hours and dated specials (Ramadan, Eid)
  if (meta.hours !== undefined) {
    const h = meta.hours ?? {}
    for (const d of DAYS) if (badIntervals(h.weekly?.[d])) err(`meta.hours.weekly.${d} must be a list of { open, close } "HH:MM"`)
    for (const [i, sp] of (Array.isArray(h.specials) ? h.specials : []).entries()) {
      const w = `meta.hours special ${sp?.id ?? i}`
      if (!sp?.id || !['ramadan', 'eid'].includes(sp.kind)) err(`${w}: needs an id and kind "ramadan" | "eid"`)
      if (!isBilingual(sp?.name)) err(`${w}: name must be { en, ar }`)
      if (!YMD.test(sp?.from ?? '') || !YMD.test(sp?.to ?? '') || sp.to < sp.from) err(`${w}: from / to must be "YYYY-MM-DD", from <= to`)
      if (badIntervals(sp?.mall)) err(`${w}: mall must be a list of { open, close } "HH:MM"`)
      if (!['mall', 'own'].includes(sp?.shops)) err(`${w}: shops must be "mall" | "own"`)
    }
  }

  const arr = (v) => (Array.isArray(v) ? v : [])
  const levels = arr(venue.levels)
  const units = arr(venue.units)
  const openings = arr(venue.openings)
  const occupants = arr(venue.occupants)
  const amenities = arr(venue.amenities)
  const connectors = arr(venue.connectors)
  const anchors = arr(venue.anchors)
  const landmarks = arr(venue.landmarks)
  const zones = arr(venue.parking?.zones)
  const bays = arr(venue.parking?.bays)
  const pillars = arr(venue.parking?.pillars)
  const areas = arr(venue.areas)
  const nodes = arr(venue.graph?.nodes)
  const edges = arr(venue.graph?.edges)
  if (!venue.parking || !Array.isArray(venue.parking.zones) || !Array.isArray(venue.parking.bays)) err('parking.zones and parking.bays must be arrays')
  if (!venue.graph || !Array.isArray(venue.graph.nodes) || !Array.isArray(venue.graph.edges)) err('graph.nodes and graph.edges must be arrays')

  // ---- 2. unique ids -------------------------------------------------------
  const index = (list, label) => {
    const m = new Map()
    list.forEach((item, i) => {
      if (!item || typeof item.id !== 'string' || !item.id) {
        err(`${label}[${i}] has no id`)
        return
      }
      if (m.has(item.id)) err(`duplicate ${label} id "${item.id}"`)
      m.set(item.id, item)
    })
    return m
  }
  const levelById = index(levels, 'levels')
  const unitById = index(units, 'units')
  const openingById = index(openings, 'openings')
  const occupantById = index(occupants, 'occupants')
  const amenityById = index(amenities, 'amenities')
  const connectorById = index(connectors, 'connectors')
  const anchorById = index(anchors, 'anchors')
  const landmarkById = index(landmarks, 'landmarks')
  const zoneById = index(zones, 'parking.zones')
  const bayById = index(bays, 'parking.bays')
  index(pillars, 'parking.pillars')
  index(areas, 'areas')
  const nodeById = index(nodes, 'graph.nodes')
  const edgeById = index(edges, 'graph.edges')
  // ids must also be unique across entity collections (search results and picks mix them)
  const globalIds = new Map()
  for (const [label, list] of [['unit', units], ['occupant', occupants], ['amenity', amenities], ['connector', connectors], ['anchor', anchors], ['landmark', landmarks], ['zone', zones], ['bay', bays]]) {
    for (const it of list) {
      if (!it?.id) continue
      if (globalIds.has(it.id) && globalIds.get(it.id) !== label) err(`id "${it.id}" is used by both a ${globalIds.get(it.id)} and a ${label}`)
      globalIds.set(it.id, label)
    }
  }
  const uniqueField = (list, field, label) => {
    const seen = new Map()
    for (const it of list) {
      const v = it?.[field]
      if (v === undefined) continue
      if (seen.has(v)) err(`duplicate ${label} ${field} "${v}" (${seen.get(v)} and ${it.id})`)
      seen.set(v, it.id)
    }
  }
  uniqueField(anchors, 'code', 'anchor')
  uniqueField(bays, 'code', 'bay')
  uniqueField(levels, 'ordinal', 'level')

  const levelOk = (levelId, where) => {
    if (!levelById.has(levelId)) {
      err(`${where}: unknown levelId "${levelId}"`)
      return false
    }
    return true
  }

  // ---- 3/4. levels + polygons ------------------------------------------------
  const checkPolygon = (poly, where) => {
    if (!Array.isArray(poly) || poly.length < 3) {
      err(`${where}: polygon needs at least 3 points`)
      return false
    }
    for (const p of poly) {
      if (!Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
        err(`${where}: polygon point ${JSON.stringify(p)} is not [x, y]`)
        return false
      }
    }
    const f = poly[0]
    const l = poly[poly.length - 1]
    if (f[0] === l[0] && f[1] === l[1]) err(`${where}: first point is repeated at the end`)
    const a = signedArea(poly)
    if (Math.abs(a) < 0.01) err(`${where}: polygon has zero area`)
    else if (a < 0) err(`${where}: polygon is clockwise (contract requires counter-clockwise)`)
    return true
  }
  const checkPoint = (p, where) => {
    if (!Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
      err(`${where}: point ${JSON.stringify(p)} is not [x, y]`)
      return false
    }
    return true
  }

  levels.forEach((lv, i) => {
    const w = `levels[${i}] ${lv.id}`
    if (!Number.isFinite(lv.ordinal)) err(`${w}: ordinal missing`)
    if (!Number.isFinite(lv.elevation)) err(`${w}: elevation missing`)
    if (!['retail', 'parking'].includes(lv.kind)) err(`${w}: kind must be retail|parking`)
    checkPolygon(lv.outline, `${w}.outline`)
  })
  const levelsByOrdinal = [...levels].sort((a, c) => a.ordinal - c.ordinal)
  for (let i = 1; i < levelsByOrdinal.length; i++) {
    const gap = levelsByOrdinal[i].elevation - levelsByOrdinal[i - 1].elevation
    if (!(gap > 0)) err(`level ${levelsByOrdinal[i].id}: elevation must increase with ordinal`)
  }

  // ---- units / openings / occupants --------------------------------------------
  units.forEach((u, i) => {
    const w = `unit ${u.id ?? i}`
    levelOk(u.levelId, w)
    checkPolygon(u.polygon, w)
    if (!UNIT_KINDS.includes(u.kind)) warn(`${w}: unknown unit kind "${u.kind}"`)
    if (u.occupantId != null) {
      const occ = occupantById.get(u.occupantId)
      if (!occ) err(`${w}: occupantId "${u.occupantId}" does not resolve`)
      else if (!arr(occ.unitIds).includes(u.id)) err(`${w}: occupant ${occ.id} does not list this unit in unitIds`)
    }
  })

  openings.forEach((o, i) => {
    const w = `opening ${o.id ?? i}`
    const u = unitById.get(o.unitId)
    if (!u) {
      err(`${w}: unitId "${o.unitId}" does not resolve`)
      return
    }
    if (o.levelId !== u.levelId) err(`${w}: levelId ${o.levelId} differs from its unit (${u.levelId})`)
    if (!checkPoint(o.a, `${w}.a`) || !checkPoint(o.b, `${w}.b`)) return
    if (Array.isArray(u.polygon) && u.polygon.length >= 3) {
      if (distToBoundary(o.a, u.polygon) > 0.05 || distToBoundary(o.b, u.polygon) > 0.05) err(`${w}: a/b are not on the unit outline`)
    }
    const n = nodeById.get(o.nodeId)
    if (!n) err(`${w}: nodeId "${o.nodeId}" does not resolve`)
    else {
      if (n.levelId !== o.levelId) err(`${w}: node ${n.id} is on level ${n.levelId}`)
      if (distToSegment(n.point, o.a, o.b) > 0.6) err(`${w}: node ${n.id} is ${distToSegment(n.point, o.a, o.b).toFixed(2)} m from the opening`)
    }
  })

  occupants.forEach((o, i) => {
    const w = `occupant ${o.id ?? i}`
    if (!CATEGORIES.includes(o.category)) err(`${w}: category "${o.category}" is not allowed`)
    if (!isBilingual(o.name)) err(`${w}: name must be { en, ar }`)
    if (!isBilingual(o.sign)) err(`${w}: sign must be { en, ar }`)
    else if (o.sign.en !== o.sign.en.toUpperCase()) warn(`${w}: sign.en should be uppercase`)
    if (!isBilingual(o.keywords) || !Array.isArray(o.keywords.en) || !Array.isArray(o.keywords.ar)) err(`${w}: keywords must be { en: [], ar: [] }`)
    if (!o.hours || !HHMM.test(o.hours.open ?? '') || !HHMM.test(o.hours.close ?? '')) err(`${w}: hours must be { open: "HH:MM", close: "HH:MM" }`)
    else if (o.hours.close !== '24:00' && o.hours.close <= o.hours.open) warn(`${w}: closes (${o.hours.close}) before it opens (${o.hours.open})`)
    if (o.ramadan !== undefined && badIntervals(o.ramadan)) err(`${w}: ramadan hours must be a list of { open, close } "HH:MM"`)
    if (!Number.isInteger(o.landmarkScore) || o.landmarkScore < 0 || o.landmarkScore > 3) err(`${w}: landmarkScore must be an integer 0-3`)
    const uIds = arr(o.unitIds)
    if (uIds.length < 1) err(`${w}: needs at least one unit`)
    const eIds = arr(o.entranceNodeIds)
    if (eIds.length < 1) err(`${w}: needs at least one entrance node`)
    const occUnits = []
    for (const uid of uIds) {
      const u = unitById.get(uid)
      if (!u) err(`${w}: unit "${uid}" does not resolve`)
      else {
        occUnits.push(u)
        if (u.occupantId !== o.id) err(`${w}: unit ${uid} has occupantId ${u.occupantId}`)
      }
    }
    for (const nid of eIds) {
      const n = nodeById.get(nid)
      if (!n) {
        err(`${w}: entrance node "${nid}" does not resolve`)
        continue
      }
      const onUnit = occUnits.some((u) => u.levelId === n.levelId && Array.isArray(u.polygon) && distToBoundary(n.point, u.polygon) <= 0.5)
      if (!onUnit) err(`${w}: entrance node ${nid} is not on the outline of any of its units`)
    }
  })

  // ---- point entities need a node on the same level ------------------------------
  const nodeNear = (nodeId, levelId, point, where, maxDist) => {
    const n = nodeById.get(nodeId)
    if (!n) {
      err(`${where}: nodeId "${nodeId}" does not resolve`)
      return null
    }
    if (n.levelId !== levelId) err(`${where}: node ${nodeId} is on level ${n.levelId}, expected ${levelId}`)
    if (point && checkPoint(point, where) && dist(n.point, point) > maxDist) warn(`${where}: node ${nodeId} is ${dist(n.point, point).toFixed(1)} m from the point`)
    return n
  }

  amenities.forEach((a, i) => {
    const w = `amenity ${a.id ?? i}`
    levelOk(a.levelId, w)
    if (!AMENITY_CATEGORIES.includes(a.category)) warn(`${w}: unknown amenity category "${a.category}"`)
    if (!isBilingual(a.name)) err(`${w}: name must be { en, ar }`)
    nodeNear(a.nodeId, a.levelId, a.point, w, 8)
    if (a.unitId != null && !unitById.has(a.unitId)) err(`${w}: unitId "${a.unitId}" does not resolve`)
  })

  anchors.forEach((a, i) => {
    const w = `anchor ${a.id ?? i}`
    levelOk(a.levelId, w)
    if (typeof a.code !== 'string' || !a.code) err(`${w}: code missing`)
    if (!Number.isFinite(a.facingDeg) || a.facingDeg < 0 || a.facingDeg >= 360) err(`${w}: facingDeg must be in [0, 360)`)
    if (!isBilingual(a.label)) err(`${w}: label must be { en, ar }`)
    nodeNear(a.nodeId, a.levelId, a.point, w, 2.5)
  })
  if (meta.defaultStartAnchorId && !anchorById.has(meta.defaultStartAnchorId)) err(`meta.defaultStartAnchorId "${meta.defaultStartAnchorId}" does not resolve`)

  landmarks.forEach((l, i) => {
    const w = `landmark ${l.id ?? i}`
    levelOk(l.levelId, w)
    checkPoint(l.point, w)
    if (!isBilingual(l.name)) err(`${w}: name must be { en, ar }`)
    if (!Number.isInteger(l.landmarkScore) || l.landmarkScore < 0 || l.landmarkScore > 3) err(`${w}: landmarkScore must be an integer 0-3`)
    if (l.polygon !== undefined) checkPolygon(l.polygon, `${w}.polygon`)
  })

  // ---- parking -------------------------------------------------------------
  zones.forEach((z, i) => {
    const w = `zone ${z.id ?? i}`
    if (levelOk(z.levelId, w) && levelById.get(z.levelId).kind !== 'parking') err(`${w}: zone on non-parking level ${z.levelId}`)
    if (!/^#[0-9A-Fa-f]{6}$/.test(z.color ?? '')) err(`${w}: color must be #RRGGBB`)
    if (!z.colorKey || !z.icon) err(`${w}: colorKey and icon are required`)
    if (!isBilingual(z.label)) err(`${w}: label must be { en, ar }`)
    checkPolygon(z.polygon, w)
  })
  bays.forEach((bay, i) => {
    const w = `bay ${bay.id ?? i}`
    levelOk(bay.levelId, w)
    if (typeof bay.code !== 'string' || !bay.code) err(`${w}: code missing`)
    if (!(bay.w > 0 && bay.l > 0)) err(`${w}: w and l must be positive`)
    if (!Number.isFinite(bay.angleDeg)) err(`${w}: angleDeg missing`)
    if (typeof bay.accessible !== 'boolean') err(`${w}: accessible must be boolean`)
    const z = zoneById.get(bay.zoneId)
    if (!z) err(`${w}: zoneId "${bay.zoneId}" does not resolve`)
    else {
      if (z.levelId !== bay.levelId) err(`${w}: zone ${z.id} is on level ${z.levelId}`)
      if (checkPoint(bay.center, w) && Array.isArray(z.polygon) && !insideOrOn(bay.center, z.polygon, 0.05)) err(`${w}: centre is outside zone ${z.id}`)
    }
    nodeNear(bay.nodeId, bay.levelId, bay.center, w, 4.5)
  })
  pillars.forEach((p, i) => {
    const w = `pillar ${p.id ?? i}`
    levelOk(p.levelId, w)
    checkPoint(p.center, w)
    if (p.zoneId != null && !zoneById.has(p.zoneId)) err(`${w}: zoneId "${p.zoneId}" does not resolve`)
  })

  // ---- connectors -----------------------------------------------------------
  const connectorEdges = new Map()
  for (const e of edges) {
    if (e?.connectorId) {
      if (!connectorEdges.has(e.connectorId)) connectorEdges.set(e.connectorId, [])
      connectorEdges.get(e.connectorId).push(e)
    }
  }
  connectors.forEach((c, i) => {
    const w = `connector ${c.id ?? i}`
    if (!['escalator', 'lift', 'stairs'].includes(c.type)) err(`${w}: type must be escalator|lift|stairs`)
    if (!isBilingual(c.name)) err(`${w}: name must be { en, ar }`)
    const stops = arr(c.stops)
    if (stops.length < 2) err(`${w}: needs at least 2 stops`)
    const stopLevels = new Set()
    stops.forEach((s, j) => {
      const sw = `${w} stop ${j}`
      if (!levelOk(s.levelId, sw)) return
      if (stopLevels.has(s.levelId)) err(`${sw}: level ${s.levelId} listed twice`)
      stopLevels.add(s.levelId)
      if (!isBilingual(s.buttonLabel)) err(`${sw}: buttonLabel must be { en, ar }`)
      const n = nodeNear(s.nodeId, s.levelId, s.point, sw, 2)
      if (n && n.kind !== 'connector') warn(`${sw}: node ${n.id} kind is ${n.kind}, expected connector`)
    })
    if (c.type === 'escalator') {
      if (c.stepFree !== false) err(`${w}: escalators must be stepFree false`)
      if (!['up', 'down'].includes(c.direction)) err(`${w}: escalator direction must be up|down`)
      if (stops.length === 2 && levelById.has(stops[0].levelId) && levelById.has(stops[1].levelId)) {
        const rises = levelById.get(stops[1].levelId).ordinal > levelById.get(stops[0].levelId).ordinal
        if ((c.direction === 'up') !== rises) err(`${w}: stops are not ordered in travel direction (${c.direction})`)
      }
    }
    if (c.type === 'lift' && c.stepFree !== true) err(`${w}: lifts must be stepFree true`)
    if (c.type === 'stairs' && c.stepFree !== false) err(`${w}: stairs must be stepFree false`)
    if (c.type === 'lift' && stops.length >= 2) {
      const p0 = stops[0].point
      for (const s of stops) if (Array.isArray(s.point) && Array.isArray(p0) && dist(s.point, p0) > 0.5) warn(`${w}: stop on ${s.levelId} is not vertically aligned with the first stop`)
    }
    const ces = connectorEdges.get(c.id) ?? []
    if (!ces.length) err(`${w}: no graph edge carries this connectorId`)
    // every consecutive stop pair (in ordinal order) must be linked
    const stopNodeIds = new Set(stops.map((s) => s.nodeId))
    const sorted = [...stops].filter((s) => levelById.has(s.levelId)).sort((s1, s2) => levelById.get(s1.levelId).ordinal - levelById.get(s2.levelId).ordinal)
    const linked = (a, z) => ces.some((e) => (e.from === a && e.to === z) || (e.from === z && e.to === a))
    if (c.type === 'lift') {
      // a lift car can go from any stop to any other stop in one ride
      for (let i = 0; i < sorted.length; i++) {
        for (let k = i + 1; k < sorted.length; k++) {
          if (!linked(sorted[i].nodeId, sorted[k].nodeId)) err(`${w}: no lift edge between ${sorted[i].levelId} and ${sorted[k].levelId}`)
        }
      }
    } else {
      for (let k = 1; k < sorted.length; k++) {
        if (!linked(sorted[k - 1].nodeId, sorted[k].nodeId)) err(`${w}: stops on ${sorted[k - 1].levelId} and ${sorted[k].levelId} are not linked`)
      }
    }
    for (const e of ces) {
      if (!stopNodeIds.has(e.from) || !stopNodeIds.has(e.to)) err(`${w}: edge ${e.id} links a node that is not one of its stops`)
    }
  })

  // ---- graph ----------------------------------------------------------------
  nodes.forEach((n, i) => {
    const w = `node ${n.id ?? i}`
    levelOk(n.levelId, w)
    checkPoint(n.point, w)
    if (!NODE_KINDS.includes(n.kind)) err(`${w}: kind "${n.kind}" is not allowed`)
    if (!('refId' in n)) err(`${w}: refId missing (use null)`)
  })
  edges.forEach((e, i) => {
    const w = `edge ${e.id ?? i}`
    if (!EDGE_KINDS.includes(e.kind)) err(`${w}: kind "${e.kind}" is not allowed`)
    const a = nodeById.get(e.from)
    const z = nodeById.get(e.to)
    if (!a) err(`${w}: from "${e.from}" does not resolve`)
    if (!z) err(`${w}: to "${e.to}" does not resolve`)
    if (e.from === e.to) err(`${w}: self loop`)
    for (const k of ['lengthM', 'oneWay', 'stepFree', 'connectorId']) if (!(k in e)) err(`${w}: ${k} missing`)
    if (!Number.isFinite(e.lengthM) || e.lengthM < 0) err(`${w}: lengthM must be a number >= 0`)
    if (!a || !z) return
    if (WALK_EDGE_KINDS.includes(e.kind)) {
      if (a.levelId !== z.levelId) err(`${w}: ${e.kind} edge crosses levels`)
      const d = dist(a.point, z.point)
      if (Math.abs(d - e.lengthM) > 0.5) err(`${w}: lengthM ${e.lengthM} but nodes are ${d.toFixed(2)} m apart`)
      if (e.connectorId != null) err(`${w}: ${e.kind} edge must have connectorId null`)
    } else {
      if (a.levelId === z.levelId) err(`${w}: ${e.kind} edge must link two levels`)
      const c = connectorById.get(e.connectorId)
      if (!c) err(`${w}: connectorId "${e.connectorId}" does not resolve`)
      else if (c.type !== e.kind) err(`${w}: kind ${e.kind} but connector ${c.id} is a ${c.type}`)
      if (e.kind === 'escalator') {
        if (e.oneWay !== true) err(`${w}: escalator edges must be oneWay`)
        if (e.stepFree !== false) err(`${w}: escalator edges must be stepFree false`)
        const h = dist(a.point, z.point)
        if (Math.abs(h - e.lengthM) > 0.5) err(`${w}: escalator lengthM ${e.lengthM} but horizontal travel is ${h.toFixed(2)} m`)
        if (c && c.stops?.length === 2 && (e.from !== c.stops[0].nodeId || e.to !== c.stops[1].nodeId)) err(`${w}: escalator edge does not run from stop 0 to stop 1`)
      }
      if (e.kind === 'lift') {
        if (e.oneWay !== false) err(`${w}: lift edges must be two-way`)
        if (e.stepFree !== true) err(`${w}: lift edges must be stepFree`)
        if (e.lengthM !== 0) err(`${w}: lift edges must have lengthM 0`)
      }
      if (e.kind === 'stairs' && e.stepFree !== false) err(`${w}: stairs edges must be stepFree false`)
    }
  })

  // ---- floor tiling + walkable geometry (only when the optional `areas` layer exists) ----
  const tilingByLevel = new Map()
  areas.forEach((a, i) => {
    const w = `area ${a.id ?? i}`
    levelOk(a.levelId, w)
    checkPolygon(a.polygon, w)
    if (typeof a.walkable !== 'boolean') err(`${w}: walkable must be boolean`)
    if (a.walkable && !WALKABLE_AREA_KINDS.includes(a.kind)) warn(`${w}: walkable area kind "${a.kind}" is unknown`)
  })
  const coverage = {}
  if (areas.length) {
    for (const lv of levels) {
      const pieces = [
        ...units.filter((u) => u.levelId === lv.id).map((u) => ({ id: u.id, poly: u.polygon })),
        ...areas.filter((a) => a.levelId === lv.id && !OVERLAY_AREA_KINDS.includes(a.kind) && !OUTSIDE_AREA_KINDS.includes(a.kind)).map((a) => ({ id: a.id, poly: a.polygon })),
      ].filter((p) => Array.isArray(p.poly) && p.poly.length >= 3)
      tilingByLevel.set(lv.id, pieces)
      let overlapCount = 0
      for (let i = 0; i < pieces.length; i++) {
        for (let j = i + 1; j < pieces.length; j++) {
          const o = overlapArea(pieces[i].poly, pieces[j].poly)
          if (o > 0.05) {
            overlapCount++
            err(`level ${lv.id}: ${pieces[i].id} overlaps ${pieces[j].id} by ${o.toFixed(2)} m²`)
          }
        }
        if (Array.isArray(lv.outline) && pieces[i].poly.some((p) => !insideOrOn(p, lv.outline, 0.05))) err(`level ${lv.id}: ${pieces[i].id} sticks out of the level outline`)
      }
      const outlineArea = Array.isArray(lv.outline) ? Math.abs(signedArea(lv.outline)) : 0
      const covered = pieces.reduce((s, p) => s + Math.abs(signedArea(p.poly)), 0)
      coverage[lv.id] = outlineArea ? covered / outlineArea : 0
      if (!overlapCount && Math.abs(covered - outlineArea) > 0.5) warn(`level ${lv.id}: units + areas cover ${covered.toFixed(1)} of ${outlineArea.toFixed(1)} m² (gaps would render as open floor)`)
    }
    // obstacles inside walkable areas must sit inside some walkable area
    for (const a of areas.filter((x) => OVERLAY_AREA_KINDS.includes(x.kind))) {
      const plan = buildLevelPlan(venue, a.levelId)
      if (Array.isArray(a.polygon) && !a.polygon.every((p) => plan.walkable.some((poly) => insideOrOn(p, poly, 0.05)))) err(`area ${a.id}: ${a.kind} obstacle is not inside a walkable area`)
    }
    // nodes must stand on walkable floor; walk edges must stay on it
    const plans = new Map(levels.map((lv) => [lv.id, buildLevelPlan(venue, lv.id)]))
    let badNodes = 0
    for (const n of nodes) {
      const plan = plans.get(n.levelId)
      if (!plan || !Array.isArray(n.point)) continue
      const onFloor = plan.walkable.some((poly) => insideOrOn(n.point, poly, 0.05))
      const blocked = plan.blockers.some((poly) => strictlyInside(n.point, poly, 0.05))
      if (!onFloor || blocked) {
        badNodes++
        if (badNodes <= 25) err(`node ${n.id} at [${n.point}] is not on walkable floor (${blocked ? 'inside a unit/obstacle' : 'outside every walkable area'})`)
      }
    }
    if (badNodes > 25) err(`... and ${badNodes - 25} more nodes off walkable floor`)
    let badEdges = 0
    for (const e of edges) {
      if (!WALK_EDGE_KINDS.includes(e.kind)) continue
      const a = nodeById.get(e.from)
      const z = nodeById.get(e.to)
      if (!a || !z || a.levelId !== z.levelId) continue
      const plan = plans.get(a.levelId)
      if (plan && !segmentIsClear(plan, a.point, z.point)) {
        badEdges++
        if (badEdges <= 25) err(`edge ${e.id} (${a.id} -> ${z.id}) leaves walkable floor or crosses a unit/obstacle`)
      }
    }
    if (badEdges > 25) err(`... and ${badEdges - 25} more edges off walkable floor`)
  } else {
    info.push('no `areas` layer: floor tiling and walk-edge clearance checks skipped')
  }

  // ---- connectivity -------------------------------------------------------------
  const startAnchor = anchorById.get(meta.defaultStartAnchorId)
  const reach = { full: 0, stepFree: 0 }
  if (startAnchor && nodeById.has(startAnchor.nodeId)) {
    const fwd = { full: new Map(), stepFree: new Map() }
    const bwd = { full: new Map(), stepFree: new Map() }
    const push = (m, a, z) => {
      if (!m.has(a)) m.set(a, [])
      m.get(a).push(z)
    }
    for (const e of edges) {
      if (!nodeById.has(e.from) || !nodeById.has(e.to)) continue
      const profiles = e.stepFree ? ['full', 'stepFree'] : ['full']
      for (const p of profiles) {
        push(fwd[p], e.from, e.to)
        push(bwd[p], e.to, e.from)
        if (!e.oneWay) {
          push(fwd[p], e.to, e.from)
          push(bwd[p], e.from, e.to)
        }
      }
    }
    const bfs = (adj, start) => {
      const seen = new Set([start])
      const q = [start]
      while (q.length) {
        const cur = q.shift()
        for (const nx of adj.get(cur) ?? []) if (!seen.has(nx)) { seen.add(nx); q.push(nx) }
      }
      return seen
    }
    const targets = []
    for (const o of occupants) for (const nid of arr(o.entranceNodeIds)) targets.push([nid, `occupant ${o.id} entrance`])
    for (const o of openings) targets.push([o.nodeId, `opening ${o.id}`])
    for (const a of amenities) targets.push([a.nodeId, `amenity ${a.id}`])
    for (const a of anchors) targets.push([a.nodeId, `anchor ${a.id}`])
    for (const bay of bays) targets.push([bay.nodeId, `bay ${bay.id}`])
    for (const c of connectors) for (const s of arr(c.stops)) targets.push([s.nodeId, `connector ${c.id} stop ${s.levelId}`])
    const start = startAnchor.nodeId
    for (const profile of ['full', 'stepFree']) {
      const out = bfs(fwd[profile], start)
      const back = bfs(bwd[profile], start)
      reach[profile] = out.size
      let missing = 0
      for (const [nid, label] of targets) {
        if (!nodeById.has(nid)) continue
        if (!out.has(nid) || !back.has(nid)) {
          missing++
          if (missing <= 20) err(`${profile === 'full' ? 'graph' : 'step-free graph'}: ${label} (${nid}) is ${!out.has(nid) ? 'not reachable from' : 'cannot get back to'} ${startAnchor.id}`)
        }
      }
      if (missing > 20) err(`${profile}: ... and ${missing - 20} more unreachable targets`)
      if (profile === 'full') {
        const orphans = nodes.filter((n) => !out.has(n.id) || !back.has(n.id))
        for (const n of orphans.slice(0, 10)) err(`graph: node ${n.id} is orphaned or a one-way dead end`)
        if (orphans.length > 10) err(`graph: ... and ${orphans.length - 10} more orphan / dead-end nodes`)
      }
    }
  } else {
    err('connectivity check skipped: default start anchor or its node is missing')
  }

  // ---- bilingual strings ---------------------------------------------------------
  let bilingualCount = 0
  const asciiDigitsInArabic = []
  const walk = (v, path) => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`))
    if (!v || typeof v !== 'object') return
    if (isBilingual(v)) {
      bilingualCount++
      const ens = Array.isArray(v.en) ? v.en : [v.en]
      const ars = Array.isArray(v.ar) ? v.ar : [v.ar]
      if (Array.isArray(v.en) !== Array.isArray(v.ar)) err(`${path}: en and ar must both be strings or both arrays`)
      for (const s of ens) {
        if (typeof s !== 'string' || !s.trim()) err(`${path}.en: empty or not a string`)
        else if (ARABIC_LETTER.test(s)) err(`${path}.en "${s}" contains Arabic letters`)
      }
      for (const s of ars) {
        if (typeof s !== 'string' || !s.trim()) err(`${path}.ar: empty or not a string`)
        else {
          if (LATIN_LETTER.test(s)) err(`${path}.ar "${s}" contains Latin letters`)
          if (!ARABIC_LETTER.test(s) && !/[٠-٩]/.test(s)) err(`${path}.ar "${s}" has no Arabic letters or digits`)
          if (ASCII_DIGIT.test(s)) asciiDigitsInArabic.push(path)
        }
      }
      return
    }
    for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k)
  }
  walk(venue, '')
  if (asciiDigitsInArabic.length) warn(`${asciiDigitsInArabic.length} Arabic strings use ASCII digits (prefer Arabic-Indic): ${asciiDigitsInArabic.slice(0, 5).join(', ')}`)

  // ---- 3D text glyph coverage --------------------------------------------------------
  // Every string the engine draws in 3D (signs, labels, painted codes) must be drawable with the two bundled
  // fonts: troika looks up anything else with its unicode-font-resolver, which falls back to a third-party CDN
  // (and never finishes offline). English text uses the Latin font; Arabic text the Arabic font, then the
  // Latin one (troika's fallback order). The engine also replaces such characters at runtime
  // (src/engine/textGuard.js); this check stops them at the door.
  const fontsDir = options.fontsDir === undefined ? DEFAULT_FONTS_DIR : options.fontsDir
  const arFont = fontsDir ? resolve(fontsDir, 'readex-arabic-600.woff') : null
  const enFont = fontsDir ? resolve(fontsDir, 'readex-latin-600.woff') : null
  if (arFont && enFont && existsSync(arFont) && existsSync(enFont)) {
    const arSet = readWoffCodepoints(arFont)
    const enSet = readWoffCodepoints(enFont)
    const drawable = (ch, lang) => /\s/.test(ch) || enSet.has(ch.codePointAt(0)) || (lang === 'ar' && arSet.has(ch.codePointAt(0)))
    const hex = (c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`
    const check = (value, where, langs = ['en', 'ar']) => {
      if (!value) return
      for (const lang of langs) {
        const strs = Array.isArray(value[lang]) ? value[lang] : [value[lang]]
        for (const str of strs) {
          if (typeof str !== 'string') continue
          const miss = [...new Set([...str].filter((ch) => !drawable(ch, lang)))]
          if (miss.length) {
            const font = lang === 'ar' ? 'readex-arabic-600.woff / readex-latin-600.woff' : 'readex-latin-600.woff'
            err(`${where}.${lang} "${str}" uses characters the 3D fonts cannot draw (${font}): ${miss.map((c) => `"${c}" ${hex(c)}`).join(', ')}`)
          }
        }
      }
    }
    for (const o of occupants) {
      check(o.name, `occupant ${o.id}: name`)
      check(o.sign, `occupant ${o.id}: sign`)
    }
    for (const lv of levels) {
      check(lv.name, `level ${lv.id}: name`)
      check(lv.shortName, `level ${lv.id}: shortName`)
    }
    for (const c of connectors) {
      check(c.name, `connector ${c.id}: name`)
      for (const st of arr(c.stops)) check(st.buttonLabel, `connector ${c.id}: buttonLabel on ${st.levelId}`)
    }
    for (const a of amenities) check(a.name, `amenity ${a.id}: name`)
    for (const lm of landmarks) check(lm.name, `landmark ${lm.id}: name`)
    for (const a of anchors) check(a.label, `anchor ${a.id}: label`)
    for (const z of zones) check(z.label, `zone ${z.id}: label`)
    for (const b of bays) check({ en: b.code }, `bay ${b.id}: code`, ['en'])
  } else if (fontsDir) {
    info.push('3D text glyph coverage check skipped (fonts not found)')
  }

  // ---- summary --------------------------------------------------------------------
  const perLevel = levelsByOrdinal.map((lv) => {
    const lvUnits = units.filter((u) => u.levelId === lv.id)
    const lvNodes = new Set(nodes.filter((n) => n.levelId === lv.id).map((n) => n.id))
    const kinds = {}
    for (const u of lvUnits) kinds[u.kind] = (kinds[u.kind] ?? 0) + 1
    const occIds = new Set(lvUnits.map((u) => u.occupantId).filter(Boolean))
    return {
      level: lv.id,
      ordinal: lv.ordinal,
      kind: lv.kind,
      units: lvUnits.length,
      unitKinds: kinds,
      occupants: occIds.size,
      amenities: amenities.filter((a) => a.levelId === lv.id).length,
      anchors: anchors.filter((a) => a.levelId === lv.id).length,
      zones: zones.filter((z) => z.levelId === lv.id).length,
      bays: bays.filter((x) => x.levelId === lv.id).length,
      accessibleBays: bays.filter((x) => x.levelId === lv.id && x.accessible).length,
      pillars: pillars.filter((x) => x.levelId === lv.id).length,
      nodes: lvNodes.size,
      edges: edges.filter((e) => WALK_EDGE_KINDS.includes(e.kind) && lvNodes.has(e.from)).length,
      coverage: coverage[lv.id] ?? null,
    }
  })
  const summary = {
    levels: levels.length,
    units: units.length,
    openings: openings.length,
    occupants: occupants.length,
    amenities: amenities.length,
    anchors: anchors.length,
    landmarks: landmarks.length,
    connectors: connectors.length,
    zones: zones.length,
    bays: bays.length,
    pillars: pillars.length,
    nodes: nodes.length,
    edges: edges.length,
    connectorEdges: edges.filter((e) => !WALK_EDGE_KINDS.includes(e.kind)).length,
    bilingualStrings: bilingualCount,
    reachableFull: reach.full,
    reachableStepFree: reach.stepFree,
    perLevel,
  }
  return { errors, warnings, info, summary }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
export function formatReport(file, result) {
  const { errors, warnings, info, summary } = result
  const lines = []
  lines.push(`Dallni venue validator · ${file}`)
  if (summary) {
    lines.push('')
    lines.push(`levels ${summary.levels} · units ${summary.units} · openings ${summary.openings} · occupants ${summary.occupants} · amenities ${summary.amenities} · anchors ${summary.anchors} · landmarks ${summary.landmarks}`)
    lines.push(`connectors ${summary.connectors} · zones ${summary.zones} · bays ${summary.bays} · pillars ${summary.pillars} · nodes ${summary.nodes} · edges ${summary.edges} (${summary.connectorEdges} connector)`)
    lines.push(`bilingual strings ${summary.bilingualStrings} · reachable from start: ${summary.reachableFull} nodes (full), ${summary.reachableStepFree} (step-free)`)
    lines.push('')
    lines.push('level  kind     units  occ  amen  anch  zones  bays (acc)  pillars  nodes  walk-edges  tiled')
    for (const r of summary.perLevel) {
      const tiled = r.coverage == null ? '   -' : `${(r.coverage * 100).toFixed(1)}%`
      lines.push(
        `${r.level.padEnd(6)} ${r.kind.padEnd(8)} ${String(r.units).padStart(5)} ${String(r.occupants).padStart(4)} ${String(r.amenities).padStart(5)} ${String(r.anchors).padStart(5)} ${String(r.zones).padStart(6)} ${String(r.bays).padStart(5)} (${String(r.accessibleBays).padStart(2)}) ${String(r.pillars).padStart(8)} ${String(r.nodes).padStart(6)} ${String(r.edges).padStart(11)}  ${tiled.padStart(6)}`,
      )
      const kinds = Object.entries(r.unitKinds).map(([k, n]) => `${k} ${n}`).join(', ')
      if (kinds) lines.push(`       units by kind: ${kinds}`)
    }
  }
  for (const m of info) lines.push(`info: ${m}`)
  if (warnings.length) {
    lines.push('')
    lines.push(`WARNINGS (${warnings.length})`)
    for (const m of warnings) lines.push(`  ! ${m}`)
  }
  if (errors.length) {
    lines.push('')
    lines.push(`ERRORS (${errors.length})`)
    for (const m of errors) lines.push(`  x ${m}`)
  }
  lines.push('')
  lines.push(errors.length ? `FAIL · ${errors.length} error(s), ${warnings.length} warning(s)` : `PASS · 0 errors, ${warnings.length} warning(s)`)
  return lines.join('\n')
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: node tools/validate-venue.mjs <path/to/venue.json>')
    process.exit(2)
  }
  let venue
  try {
    venue = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    console.error(`cannot read ${file}: ${e.message}`)
    process.exit(1)
  }
  const result = validateVenue(venue)
  console.log(formatReport(file, result))
  process.exit(result.errors.length ? 1 : 0)
}
