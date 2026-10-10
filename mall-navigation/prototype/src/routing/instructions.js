/**
 * Turn-by-turn steps for a route (CONTRACT.md section 3).
 *
 * Every step covers a stretch of the route, `points[from]` to `points[to]`; consecutive steps share their end
 * and start index, so the steps tile the whole route. The text says what to do along that stretch:
 *
 *   start      [0, 0]        "Start at the South entrance and face Nakhla Pharmacy"
 *   walk       [i, j]        a long straight stretch split for reassurance: "Walk straight past the food court"
 *   turn       [i, corner]   walk distanceM, then turn: "Turn left after Oud House"
 *   connector  [i, exit]     walk to the lift/escalator/stairs and ride it:
 *                            "Take Lift A to Parking B1. Press “B1”"
 *   arrive     [i, last]     "Oud House is on your right"
 *
 * Left/right always come from the WALKING direction (compass headings between route points, clockwise
 * positive), never from the screen or the UI language. English and Arabic use separate templates; Arabic
 * text never contains Latin letters and uses Arabic-Indic digits.
 *
 * Pure JS: no DOM, no three.js.
 */
import { toArabicDigits } from '../i18n/strings.js'

/** Arabic-Indic digits for Arabic text, except inside left-to-right isolates (painted bay codes stay "B1-43"). */
function arDigits(str) {
  return String(str ?? '')
    .split(/(\u2066[^\u2069]*\u2069)/)
    .map((part) => (part.startsWith('\u2066') ? part : toArabicDigits(part)))
    .join('')
}
import { edgeCostS, isConnectorEdge } from './costs.js'
import {
  bearing,
  dist,
  distToPolygon,
  distToSegment,
  headingVector,
  nearestPointOnPolygon,
  signedDelta,
} from './geometry.js'
import { enPhrase, entityForNode } from './names.js'

/**
 * @typedef {'straight'|'slight_left'|'slight_right'|'left'|'right'|'uturn'} TurnClass
 * @typedef {object} Step
 * @property {number} index
 * @property {'start'|'walk'|'turn'|'connector'|'arrive'} kind
 * @property {string} levelId          level the step happens on (connector: the level you board on)
 * @property {{ en: string, ar: string }} text
 * @property {number} distanceM        sum of edge.lengthM over the stretch (connector: walk + horizontal ride)
 * @property {number} etaS             travel time over the stretch at the contract speeds
 * @property {number} from             index into route.points
 * @property {number} to               index into route.points
 * @property {{ id: string, type: string, name: { en: string, ar: string } } | null} landmark
 *   turn/walk: the landmark named in the text; start: what to face; arrive: the destination itself
 * @property {{ id: string, type: string, name: { en: string, ar: string }, fromLevelId: string,
 *   toLevelId: string, direction: 'up'|'down'|null, floors: number, buttonLabel: { en: string, ar: string },
 *   boardIndex: number, exitIndex: number, exitTurn: TurnClass | null } | null} connector
 * @property {TurnClass | null} turn
 * @property {'left'|'right'|'ahead'|'behind'|null} [side]   arrive only: where the destination is
 */

export const INSTRUCTION_SETTINGS = Object.freeze({
  straightDeg: 30, // below: straight
  slightDeg: 60, // 30-60: slight
  turnDeg: 135, // 60-135: turn, above: U-turn
  bendDeg: 5, // a node where the heading changes less than this is not a bend at all
  jogM: 3, // bends closer than this (along the path) count as one manoeuvre with their net angle
  groupSpanM: 10, // ...as long as the joined bends stay within this many metres
  startAbsorbM: 8, // bends this close to the start are folded into "face X"
  endAbsorbM: 8, // the last bend this close to a lift/escalator or the destination is folded into that step
  exitFoldM: 6, // a bend this close to a connector exit becomes "then turn left at the top"
  landmarkRadiusM: 15, // contract: landmark within 15 m of the turn node
  landmarkPathM: 8, // ...and close to the walked path (so it is visible, not behind a wall)
  landmarkAfterM: 3, // this far behind the corner (and beside the path in) -> "after X"
  landmarkAtM: 8, // a point landmark this close to the corner -> "at X"
  landmarkAreaAtM: 6, // an area landmark (atrium, food court) whose edge is this close -> "at X"
  longWalkM: 50, // straight stretches at least this long get a "walk straight past X" step
  minWalkPartM: 20, // never split a stretch into parts shorter than this
  faceConeDeg: 35, // "face X": X must be within this angle of the first walking direction
  faceMinM: 3,
  faceMaxM: 60,
})

const S = INSTRUCTION_SETTINGS

/**
 * Turn class for a signed heading change (positive = clockwise = right).
 * @param {number} delta degrees in (-180, 180]
 * @returns {TurnClass}
 */
export function classifyTurn(delta) {
  const a = Math.abs(delta)
  if (a < S.straightDeg) return 'straight'
  if (a < S.slightDeg) return delta > 0 ? 'slight_right' : 'slight_left'
  if (a <= S.turnDeg) return delta > 0 ? 'right' : 'left'
  return 'uturn'
}

/**
 * Where something lies relative to a walking heading.
 * @param {number} rel signed angle from the heading to the thing
 * @returns {'ahead'|'left'|'right'|'behind'}
 */
export function sideOf(rel) {
  const a = Math.abs(rel)
  if (a <= 30) return 'ahead'
  if (a <= 150) return rel > 0 ? 'right' : 'left'
  return 'behind'
}

// ---------------------------------------------------------------------------------------------------------
// Text templates. English and Arabic are written separately, never stitched across languages.
// ---------------------------------------------------------------------------------------------------------

const TURN_EN = {
  slight_left: 'bear left',
  slight_right: 'bear right',
  left: 'turn left',
  right: 'turn right',
  uturn: 'turn around',
  straight: 'go straight',
}
const TURN_AR = {
  slight_left: 'انحرف قليلاً إلى اليسار',
  slight_right: 'انحرف قليلاً إلى اليمين',
  left: 'انعطف يساراً',
  right: 'انعطف يميناً',
  uturn: 'استدر للخلف',
  straight: 'تابع السير مباشرة',
}
const SIDE_EN = { right: 'is on your right', left: 'is on your left', ahead: 'is straight ahead', behind: 'is behind you' }
const SIDE_AR = { right: 'على يمينك', left: 'على يسارك', ahead: 'أمامك مباشرة', behind: 'خلفك' }
const PLATE_EN = {
  behind: 'with the sign behind you',
  left: 'with the sign on your left',
  right: 'with the sign on your right',
  ahead: 'and walk towards the sign',
}
const PLATE_AR = {
  behind: 'واجعل اللافتة خلفك',
  left: 'واجعل اللافتة على يسارك',
  right: 'واجعل اللافتة على يمينك',
  ahead: 'وامشِ باتجاه اللافتة',
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

function textStart(place, face, plateSide) {
  const enPlace = place ? enPhrase(place) : null
  const en = enPlace ? `Start at ${enPlace}` : 'Start here'
  const ar = place ? `ابدأ عند ${place.name.ar}` : 'ابدأ من هنا'
  if (face) return { en: `${en} and face ${enPhrase(face)}`, ar: `${ar} واتجه نحو ${face.name.ar}` }
  if (plateSide) return { en: `${en} ${PLATE_EN[plateSide]}`, ar: `${ar} ${PLATE_AR[plateSide]}` }
  return { en, ar }
}

function textTurn(turn, landmark, prep) {
  const en = cap(TURN_EN[turn])
  const ar = TURN_AR[turn]
  if (!landmark) return { en, ar }
  if (prep === 'after') return { en: `${en} after ${enPhrase(landmark)}`, ar: `${ar} بعد ${landmark.name.ar}` }
  if (prep === 'towards') return { en: `${en} towards ${enPhrase(landmark)}`, ar: `${ar} باتجاه ${landmark.name.ar}` }
  return { en: `${en} at ${enPhrase(landmark)}`, ar: `${ar} عند ${landmark.name.ar}` }
}

function textWalk(landmark) {
  if (!landmark) return { en: 'Keep walking straight', ar: 'تابع السير مباشرة' }
  return { en: `Walk straight past ${enPhrase(landmark)}`, ar: `تابع السير مباشرة متجاوزاً ${landmark.name.ar}` }
}

function textConnector(type, connName, direction, level, button, exitTurn) {
  const levelEn = level?.name?.en ?? ''
  const levelAr = level?.name?.ar ?? ''
  const upAr = direction === 'down' ? 'نزولاً' : 'صعوداً'
  let en
  let ar
  if (type === 'escalator') {
    en = direction ? `Take the ${direction} escalator to ${levelEn}` : `Take the escalator to ${levelEn}`
    ar = `خذ السلم المتحرك ${upAr} إلى ${levelAr}`
  } else if (type === 'lift') {
    const nameEn = connName?.en ?? 'the lift'
    const nameAr = connName?.ar ?? 'المصعد'
    // two sentences, typographic quotes: "Take Lift B to Parking B1. Press “B1”, then turn left as you step out."
    en = `Take ${nameEn} to ${levelEn}. Press \u201C${button.en}\u201D`
    ar = `خذ ${nameAr} إلى ${levelAr}. اضغط «${button.ar}»`
  } else {
    const nameEn = connName?.en ?? 'the stairs'
    const nameAr = connName?.ar ?? 'الدرج'
    en = `Take ${nameEn}${direction ? ` ${direction}` : ''} to ${levelEn}`
    ar = `خذ ${nameAr} ${upAr} إلى ${levelAr}`
  }
  if (exitTurn && exitTurn !== 'straight') {
    let whereEn = 'as you step out'
    let whereAr = 'عند الخروج'
    if (type === 'escalator') {
      whereEn = direction === 'down' ? 'at the bottom' : 'at the top'
      whereAr = direction === 'down' ? 'في الأسفل' : 'في الأعلى'
    }
    en += `, then ${TURN_EN[exitTurn]} ${whereEn}`
    ar += `، ثم ${TURN_AR[exitTurn]} ${whereAr}`
  }
  return { en, ar }
}

function textArrive(entity, side) {
  if (!entity) return { en: 'You have arrived', ar: 'وصلت' }
  if (!side) return { en: `You have arrived at ${enPhrase(entity)}`, ar: `وصلت إلى ${entity.name.ar}` }
  return { en: `${enPhrase(entity, true)} ${SIDE_EN[side]}`, ar: `وصلت: ${entity.name.ar} ${SIDE_AR[side]}` }
}

// ---------------------------------------------------------------------------------------------------------
// Landmark candidates per level (cached per VenueIndex)
// ---------------------------------------------------------------------------------------------------------

/** @type {WeakMap<object, Map<string, object[]>>} */
const candidateCache = new WeakMap()

/** Forget cached landmark candidates for a venue (after editing a VenueIndex in place). */
export function clearLandmarkCache(index) {
  candidateCache.delete(index)
}

function landmarkCandidates(index, levelId) {
  let perLevel = candidateCache.get(index)
  if (!perLevel) {
    perLevel = buildCandidates(index)
    candidateCache.set(index, perLevel)
  }
  return perLevel.get(levelId) ?? []
}

function buildCandidates(index) {
  /** @type {Map<string, object[]>} */
  const perLevel = new Map()
  const add = (levelId, c) => {
    if (!perLevel.has(levelId)) perLevel.set(levelId, [])
    perLevel.get(levelId).push(c)
  }
  for (const occ of index.occupantById.values()) {
    for (const nodeId of occ.entranceNodeIds ?? []) {
      const node = index.nodeById.get(nodeId)
      if (!node) continue
      add(node.levelId, { id: occ.id, type: 'occupant', name: occ.name, generic: false, score: occ.landmarkScore ?? 0, point: node.point })
    }
  }
  for (const lm of index.landmarkById.values()) {
    add(lm.levelId, {
      id: lm.id,
      type: 'landmark',
      name: lm.name,
      generic: true,
      score: lm.landmarkScore ?? 3,
      point: lm.point,
      polygon: Array.isArray(lm.polygon) && lm.polygon.length >= 3 ? lm.polygon : null,
      radius: Number.isFinite(lm.radius) ? lm.radius : 0,
    })
  }
  for (const conn of index.connectorById.values()) {
    const seen = new Set()
    for (const stop of conn.stops ?? []) {
      if (seen.has(stop.levelId)) continue
      seen.add(stop.levelId)
      const isEsc = conn.type === 'escalator'
      const name = isEsc ? { en: 'escalators', ar: 'السلالم المتحركة' } : conn.name
      const list = perLevel.get(stop.levelId) ?? []
      if (isEsc && list.some((c) => c.type === 'connector' && c.name.en === 'escalators')) continue
      add(stop.levelId, { id: conn.id, type: 'connector', name, generic: isEsc, score: 1, point: stop.point })
    }
  }
  return perLevel
}

function candDistance(c, p) {
  if (c.polygon) return distToPolygon(p, c.polygon)
  return Math.max(0, dist(p, c.point) - (c.radius ?? 0))
}

function candRefPoint(c, p) {
  if (c.polygon) return nearestPointOnPolygon(p, c.polygon)
  return c.point
}

// ---------------------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------------------

/**
 * Build the steps for a path.
 * @param {import('../data/venue.js').VenueIndex} index
 * @param {string[]} nodeIds
 * @param {object[]} edges edges[i] joins nodeIds[i] and nodeIds[i + 1]
 * @returns {Step[]}
 */
export function buildSteps(index, nodeIds, edges) {
  if (!Array.isArray(nodeIds) || nodeIds.length === 0) return []
  const nodes = nodeIds.map((id) => {
    const n = index.nodeById.get(id)
    if (!n) throw new Error(`buildSteps: unknown node "${id}"`)
    return n
  })
  if (!Array.isArray(edges) || edges.length !== nodes.length - 1) {
    throw new Error('buildSteps: expected exactly one edge between each pair of consecutive nodes')
  }
  const P = nodes.map((n) => n.point)
  const cum = [0]
  for (let i = 0; i < edges.length; i++) cum.push(cum[i] + dist(P[i], P[i + 1]))
  const startEntity = entityForNode(index, nodes[0])
  const endEntity = entityForNode(index, nodes[nodes.length - 1])
  // Never name the start or the destination as a turn landmark. (The connector you just stepped off is
  // excluded per run below; the one you are walking to is a good landmark: "Turn left towards Lift A".)
  const excluded = new Set([startEntity?.id, endEntity?.id].filter(Boolean))
  const ctx = { index, nodes, P, cum, edges, startEntity, endEntity, excluded, justLeftId: null, nextRideId: null }

  const legs = splitLegs(edges, nodes.length)
  /** @type {Step[]} */
  const steps = []

  const stretch = (from, to) => {
    let d = 0
    let t = 0
    for (let i = from; i < to; i++) {
      d += Number.isFinite(edges[i].lengthM) ? edges[i].lengthM : 0
      t += edgeCostS(index, edges[i])
    }
    return { distanceM: Math.round(d * 100) / 100, etaS: Math.round(t * 10) / 10 }
  }
  const push = (step) => {
    const { distanceM, etaS } = stretch(step.from, step.to)
    steps.push({
      index: steps.length,
      kind: step.kind,
      levelId: step.levelId,
      text: { en: step.text.en, ar: arDigits(step.text.ar) },
      distanceM,
      etaS,
      from: step.from,
      to: step.to,
      landmark: step.landmark ? { id: step.landmark.id, type: step.landmark.type, name: step.landmark.name } : null,
      connector: step.connector ?? null,
      turn: step.turn ?? null,
      ...(step.kind === 'arrive' ? { side: step.side ?? null } : {}),
    })
  }
  // Insert "walk straight" steps on long stretches; returns the index the next step starts from.
  const pushWalkSplits = (from, to, runA, runB) => {
    let next = from
    for (const split of splitLongWalk(ctx, from, to, runA, runB)) {
      push({ kind: 'walk', levelId: nodes[split.index].levelId, text: textWalk(split.landmark), from: split.from, to: split.index, landmark: split.landmark, turn: 'straight' })
      next = split.index
    }
    return next
  }

  // Analyse every walking run first (the start step needs the first run's heading).
  let incoming = null
  const runs = []
  for (let li = 0; li < legs.length; li++) {
    const leg = legs[li]
    if (leg.type === 'run') {
      runs.push(analyzeRun(ctx, leg.a, leg.b, incoming, li === 0, li === legs.length - 1))
    } else {
      incoming = exitHeading(ctx, leg)
    }
  }

  // Start step.
  const first = runs[0]
  let face = null
  let plateSide = null
  if (first.startHeading != null) {
    face = findFaceLandmark(ctx, first.startOrigin, first.startHeading, nodes[0].levelId)
    if (!face && startEntity?.type === 'anchor') {
      const anchor = index.anchorById.get(startEntity.id)
      let toPlate = anchor?.point ? bearing(P[0], anchor.point) : null
      if (toPlate == null && Number.isFinite(anchor?.facingDeg)) toPlate = (anchor.facingDeg + 180) % 360
      if (toPlate != null) plateSide = sideOf(signedDelta(first.startHeading, toPlate))
    }
  }
  push({ kind: 'start', levelId: nodes[0].levelId, text: textStart(startEntity, face, plateSide), from: 0, to: 0, landmark: face, turn: null })

  // Remaining steps, leg by leg.
  let cursor = 0
  let runIdx = 0
  let lastConnectorStep = null
  for (let li = 0; li < legs.length; li++) {
    const leg = legs[li]
    if (leg.type === 'run') {
      const info = runs[runIdx++]
      ctx.justLeftId = li > 0 ? legs[li - 1].connectorId : null
      ctx.nextRideId = li + 1 < legs.length ? legs[li + 1].connectorId : null
      if (info.exitTurn && lastConnectorStep) {
        lastConnectorStep.connector.exitTurn = info.exitTurn
        const c = lastConnectorStep.connector
        const level = index.levelById.get(c.toLevelId)
        const text = textConnector(c.type, c.name, c.direction, level, c.buttonLabel, info.exitTurn)
        lastConnectorStep.text = { en: text.en, ar: arDigits(text.ar) }
      }
      for (const m of info.maneuvers) {
        cursor = pushWalkSplits(cursor, m.corner, leg.a, leg.b)
        const prevLandmarkId = steps[steps.length - 1]?.landmark?.id ?? null
        const lm = findTurnLandmark(ctx, m.corner, leg.a, leg.b, m.inHeading, m.outHeading, prevLandmarkId)
        push({
          kind: 'turn',
          levelId: nodes[m.corner].levelId,
          text: textTurn(m.turn, lm?.landmark ?? null, lm?.prep),
          from: cursor,
          to: m.corner,
          landmark: lm?.landmark ?? null,
          turn: m.turn,
        })
        cursor = m.corner
      }
      if (li === legs.length - 1) {
        cursor = pushWalkSplits(cursor, leg.b, leg.a, leg.b)
        push({
          kind: 'arrive',
          levelId: nodes[leg.b].levelId,
          text: textArrive(endEntity, info.side),
          from: cursor,
          to: leg.b,
          landmark: endEntity,
          turn: null,
          side: info.side,
        })
        cursor = leg.b
      } else {
        // Walking part before the next connector (the connector step itself covers the last stretch).
        cursor = pushWalkSplits(cursor, leg.b, leg.a, leg.b)
      }
    } else {
      const conn = index.connectorById.get(leg.connectorId) ?? null
      const fromLevelId = nodes[leg.a].levelId
      const toLevelId = nodes[leg.b].levelId
      const ordFrom = index.levelById.get(fromLevelId)?.ordinal ?? 0
      const ordTo = index.levelById.get(toLevelId)?.ordinal ?? 0
      const direction = ordTo > ordFrom ? 'up' : ordTo < ordFrom ? 'down' : (conn?.direction === 'up' || conn?.direction === 'down' ? conn.direction : null)
      const type = conn?.type ?? edges[leg.a].kind
      const exitStop = conn?.stops?.find((s) => s.nodeId === nodeIds[leg.b])
      const level = index.levelById.get(toLevelId)
      const buttonLabel = exitStop?.buttonLabel ?? level?.shortName ?? { en: toLevelId, ar: toLevelId }
      const connector = {
        id: conn?.id ?? leg.connectorId ?? edges[leg.a].id,
        type,
        name: conn?.name ?? null,
        fromLevelId,
        toLevelId,
        direction,
        floors: Math.abs(ordTo - ordFrom),
        buttonLabel,
        boardIndex: leg.a,
        exitIndex: leg.b,
        exitTurn: null,
      }
      push({
        kind: 'connector',
        levelId: fromLevelId,
        text: textConnector(type, conn?.name ?? null, direction, level, buttonLabel, null),
        from: cursor,
        to: leg.b,
        landmark: null,
        connector,
        turn: null,
      })
      lastConnectorStep = steps[steps.length - 1]
      cursor = leg.b
    }
  }
  return steps
}

/**
 * Split the path into walking runs and connector rides: run, ride, run, ride, ..., run.
 * Runs may be empty (a === b). Consecutive edges of the same connector (stairs B2 -> B1 -> G) form one ride.
 */
function splitLegs(edges, nodeCount) {
  const legs = []
  let runStart = 0
  let i = 0
  while (i < edges.length) {
    if (isConnectorEdge(edges[i])) {
      legs.push({ type: 'run', a: runStart, b: i })
      const cid = edges[i].connectorId ?? null
      let j = i + 1
      while (j < edges.length && isConnectorEdge(edges[j]) && (edges[j].connectorId ?? null) === cid && cid !== null) j++
      legs.push({ type: 'ride', a: i, b: j, connectorId: cid })
      i = j
      runStart = j
    } else {
      i++
    }
  }
  legs.push({ type: 'run', a: runStart, b: nodeCount - 1 })
  return legs
}

/** Heading of someone stepping off a connector, or null when the data cannot tell. */
function exitHeading(ctx, ride) {
  const conn = ctx.index.connectorById.get(ride.connectorId)
  const type = conn?.type ?? ctx.edges[ride.a].kind
  if (type === 'escalator') return bearing(ctx.P[ride.a], ctx.P[ride.b])
  if (Number.isFinite(conn?.doorFacingDeg)) return conn.doorFacingDeg
  return null
}

/**
 * Find the manoeuvres inside one walking run [a, b].
 * @returns {{ maneuvers: { corner: number, first: number, last: number, turn: TurnClass, inHeading: number }[],
 *   exitTurn: TurnClass | null, startHeading: number | null, startOrigin: [number, number] | null,
 *   side: 'left'|'right'|'ahead'|'behind'|null }}
 */
function analyzeRun(ctx, a, b, incoming, isFirst, isLast) {
  const { P, cum } = ctx
  // Segment headings with zero-length segments inheriting a neighbour's heading.
  const h = []
  for (let k = a; k < b; k++) h.push(bearing(P[k], P[k + 1]))
  for (let i = 1; i < h.length; i++) if (h[i] == null) h[i] = h[i - 1]
  for (let i = h.length - 2; i >= 0; i--) if (h[i] == null) h[i] = h[i + 1]
  const hOut = (k) => (k >= a && k < b ? h[k - a] : null)
  const hIn = (k) => (k === a ? incoming : hOut(k - 1))
  const delta = (k) => {
    const i = hIn(k)
    const o = hOut(k)
    return i == null || o == null ? 0 : signedDelta(i, o)
  }

  // Bend nodes (heading changes by at least bendDeg), grouped when consecutive bends are closer than jogM
  // along the path: a dog-leg nets out to "straight", two quick lefts net out to a U-turn.
  const bends = []
  if (incoming != null && b > a && Math.abs(delta(a)) >= S.bendDeg) bends.push(a)
  for (let k = a + 1; k < b; k++) if (Math.abs(delta(k)) >= S.bendDeg) bends.push(k)
  const groups = []
  let g = null
  for (const k of bends) {
    if (g && cum[k] - cum[g.last] < S.jogM && cum[k] - cum[g.first] <= S.groupSpanM) {
      g.last = k
    } else {
      g = { first: k, last: k }
      groups.push(g)
    }
  }
  const evaluated = []
  for (const grp of groups) {
    const inHeading = hIn(grp.first)
    const outHeading = hOut(grp.last)
    if (inHeading == null || outHeading == null) continue
    const net = signedDelta(inHeading, outHeading)
    const turn = classifyTurn(net)
    if (turn === 'straight') continue
    let corner = grp.first
    for (let k = grp.first; k <= grp.last; k++) if (Math.abs(delta(k)) > Math.abs(delta(corner))) corner = k
    evaluated.push({ ...grp, corner, turn, net, inHeading, outHeading })
  }

  let list = evaluated
  // The last bend right before a connector or the destination belongs to that step
  // ("Take the up escalator", "Oud House is on your left").
  const lastBend = list[list.length - 1]
  const endBend = lastBend && cum[b] - cum[lastBend.corner] < S.endAbsorbM ? lastBend : null
  if (endBend) list = list.slice(0, -1)

  // A bend right at a connector exit becomes "..., then turn left at the top".
  let exitTurn = null
  if (incoming != null && list.length && cum[list[0].corner] - cum[a] < S.exitFoldM) {
    exitTurn = list[0].turn
    list = list.slice(1)
  }

  // Bends right after the start are folded into "face X".
  let startHeading = null
  let startOrigin = null
  if (isFirst) {
    const absorbed = list.filter((m) => cum[m.corner] - cum[a] < S.startAbsorbM)
    list = list.filter((m) => !absorbed.includes(m))
    const lastAbs = absorbed[absorbed.length - 1]
    startOrigin = P[lastAbs ? lastAbs.last : a]
    startHeading = lastAbs ? hOut(lastAbs.last) : b > a ? hOut(a) : null
  }

  // Where the destination is, seen from the walking direction just before the final bend.
  let side = null
  if (isLast) {
    const approach = endBend ? endBend.inHeading : b > a ? hOut(b - 1) : incoming
    const entity = ctx.endEntity
    let target = null
    if (entity?.bayAngleDeg != null) target = entity.bayAngleDeg
    else if (endBend) target = bearing(P[endBend.corner], P[b])
    else if (entity?.targetPoint) target = bearing(P[b], entity.targetPoint)
    if (approach != null && target != null) side = sideOf(signedDelta(approach, target))
    else if (approach != null && entity && target == null) side = 'ahead'
  }

  return { maneuvers: list, exitTurn, startHeading, startOrigin, side }
}

/** Indices of route points within `rangeM` metres (along the path) of index k, inside run [a, b]. */
function localSegments(ctx, k, a, b, rangeM = 20) {
  const { cum } = ctx
  let lo = k
  while (lo > a && cum[k] - cum[lo - 1] <= rangeM) lo--
  let hi = k
  while (hi < b && cum[hi + 1] - cum[k] <= rangeM) hi++
  return [lo, hi]
}

function distToPath(ctx, p, lo, hi) {
  if (hi <= lo) return dist(p, ctx.P[lo])
  let best = Infinity
  for (let i = lo; i < hi; i++) best = Math.min(best, distToSegment(p, ctx.P[i], ctx.P[i + 1]))
  return best
}

/**
 * Best landmark for a bend: highest landmarkScore occupant / landmark (lifts and stairs as a fallback,
 * score 1) within 15 m of the corner on the same level, in a position people can use:
 *   'after'   - beside the path you walked in on, before the corner  -> "Turn left after Oud House"
 *   'at'      - right at the corner (8 m, or 6 m from an area's edge) -> "Turn left at the atrium"
 *   'towards' - beside the path you walk out on, ahead of you         -> "Turn left towards the food court"
 * Ranking: not the landmark the previous step just named > higher landmarkScore > after/at/towards > nearer.
 * @param {number} k corner index
 * @param {number} a run start index
 * @param {number} b run end index
 * @param {number | null} inHeading heading walking into the corner
 * @param {number | null} outHeading heading walking out of the corner
 * @param {string | null} avoidId
 */
function findTurnLandmark(ctx, k, a, b, inHeading, outHeading, avoidId = null) {
  const p = ctx.P[k]
  const [lo, hi] = localSegments(ctx, k, a, b)
  const vIn = inHeading != null ? headingVector(inHeading) : null
  const vOut = outHeading != null ? headingVector(outHeading) : null
  const PREP_RANK = { after: 3, at: 2, towards: 1 }
  let best = null
  for (const c of landmarkCandidates(ctx.index, ctx.nodes[k].levelId)) {
    if (ctx.excluded.has(c.id) || c.id === ctx.justLeftId) continue
    const d = candDistance(c, p)
    if (d > S.landmarkRadiusM) continue
    const ref = candRefPoint(c, p)
    const rx = ref[0] - p[0]
    const ry = ref[1] - p[1]
    let prep = null
    if (vIn && rx * vIn[0] + ry * vIn[1] < -S.landmarkAfterM && distToPath(ctx, ref, lo, k) <= S.landmarkPathM) prep = 'after'
    else if (d <= (c.polygon ? S.landmarkAreaAtM : S.landmarkAtM)) prep = 'at'
    else if (vOut && rx * vOut[0] + ry * vOut[1] > S.landmarkAfterM && distToPath(ctx, ref, k, hi) <= S.landmarkPathM) prep = 'towards'
    if (!prep) continue
    const cand = { c, d, prep, fresh: c.id !== avoidId ? 1 : 0 }
    if (!best || compareLandmarks(cand, best, PREP_RANK) > 0) best = cand
  }
  return best ? { landmark: best.c, prep: best.prep } : null
}

function compareLandmarks(x, y, prepRank) {
  if (x.fresh !== y.fresh) return x.fresh - y.fresh
  if (x.c.score !== y.c.score) return x.c.score - y.c.score
  if (prepRank[x.prep] !== prepRank[y.prep]) return prepRank[x.prep] - prepRank[y.prep]
  return y.d - x.d
}

/**
 * A landmark next to a point on a straight stretch ("walk straight past X"). Never the lift or escalator this
 * stretch leads to (you do not walk past what you are about to take).
 */
function findPassingLandmark(ctx, k, a, b) {
  const p = ctx.P[k]
  const [lo, hi] = localSegments(ctx, k, a, b)
  let best = null
  for (const c of landmarkCandidates(ctx.index, ctx.nodes[k].levelId)) {
    if (ctx.excluded.has(c.id) || c.id === ctx.justLeftId || c.id === ctx.nextRideId) continue
    const d = candDistance(c, p)
    if (d > S.landmarkRadiusM) continue
    if (distToPath(ctx, candRefPoint(c, p), lo, hi) > S.landmarkPathM) continue
    if (!best || c.score > best.c.score || (c.score === best.c.score && d < best.d)) best = { c, d }
  }
  return best ? best.c : null
}

/** Something recognisable roughly ahead of the start, so people know which way to face. */
function findFaceLandmark(ctx, origin, heading, levelId) {
  let best = null
  for (const c of landmarkCandidates(ctx.index, levelId)) {
    if (ctx.startEntity && c.id === ctx.startEntity.id) continue
    const d = candDistance(c, origin)
    if (d < S.faceMinM || d > S.faceMaxM) continue
    const ref = candRefPoint(c, origin)
    const b = bearing(origin, ref)
    if (b == null) continue
    const rel = Math.abs(signedDelta(heading, b))
    if (rel > S.faceConeDeg) continue
    // Big shared landmarks (fountain, atrium, food court) beat a shop of the same score.
    const rank = c.score * 100 + (c.type === 'landmark' ? 20 : 0) - rel - d * 0.5
    if (!best || rank > best.rank) best = { c, rank }
  }
  return best ? best.c : null
}

/**
 * Split a long straight walking stretch [from, to] at an intermediate node next to a landmark (nearest the
 * middle), so people get a "walk straight past X" check on the way. No landmark, no split.
 * Returns the walk steps to insert, in order.
 */
function splitLongWalk(ctx, from, to, a, b) {
  const out = []
  const recurse = (lo, hi) => {
    const total = ctx.cum[hi] - ctx.cum[lo]
    if (total < S.longWalkM) return
    const mid = ctx.cum[lo] + total / 2
    let pick = null
    for (let k = lo + 1; k < hi; k++) {
      if (ctx.cum[k] - ctx.cum[lo] < S.minWalkPartM || ctx.cum[hi] - ctx.cum[k] < S.minWalkPartM) continue
      const lm = findPassingLandmark(ctx, k, a, b)
      if (!lm) continue
      const score = Math.abs(ctx.cum[k] - mid)
      if (!pick || score < pick.score) pick = { k, lm, score }
    }
    if (!pick) return
    recurse(lo, pick.k)
    out.push({ from: 0, index: pick.k, landmark: pick.lm })
    recurse(pick.k, hi)
  }
  recurse(from, to)
  // Chain the parts so the walk steps tile [from, last split].
  let prev = from
  for (const part of out) {
    part.from = prev
    prev = part.index
  }
  return out
}
