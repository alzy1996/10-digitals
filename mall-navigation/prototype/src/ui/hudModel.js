/**
 * Walk view HUD model (DESIGN-GLASS.md sections 6.5, 7.3, 7.6): what the turn card, the stat chips, the turn
 * bubble and the lift card say, where the bubble goes on screen, and what the mini-map draws.
 * Pure JS (no React, no DOM, no three.js): unit-tested in tests/hud.test.js.
 *
 * Inputs are the CONTRACT objects: VenueIndex, Route (points, edges, steps), the step index, and the App's
 * simulator state ({ active, distanceDoneM, onConnector, rideProgress, phase, ... }). The Walk view is a
 * SIMULATION inside the 3D model: nothing here is live positioning.
 */
import { formatDistance, t } from '../i18n/strings.js'
import { entityInfo, levelName, pick } from './model.js'
import { stepIconName } from './stepIcon.js'

/** Walking speed used for ETAs (CONTRACT.md section 3): the arrival time is always at 1x, never the sim speed. */
export const WALK_MPS = 1.2

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

function stepAt(route, stepIndex) {
  const steps = route?.steps ?? []
  if (!steps.length) return { steps, i: -1, step: null }
  const i = clamp(Math.round(Number(stepIndex) || 0), 0, steps.length - 1)
  return { steps, i, step: steps[i] }
}

const cumCache = new WeakMap()

/**
 * Metres along the route at each route point (sum of edge.lengthM, the simulator's own measure).
 * @param {object} route
 * @returns {number[]}
 */
export function cumulativeM(route) {
  if (!route?.points) return []
  const hit = cumCache.get(route)
  if (hit) return hit
  const cum = new Array(route.points.length).fill(0)
  for (let k = 1; k < route.points.length; k++) cum[k] = cum[k - 1] + (route.edges?.[k - 1]?.lengthM ?? 0)
  cumCache.set(route, cum)
  return cum
}

/**
 * Trip numbers for the chips and the turn card.
 * - remainM / remainS: left on the whole route (remainS at 1x walking, rides included), like the v0.1 step card;
 * - stepLeftM: metres left to where the current step ends (a connector step: to where you board, then the ride).
 * @param {object} route
 * @param {number} stepIndex
 * @param {{ active?: boolean, distanceDoneM?: number, onConnector?: boolean, rideProgress?: number }} [sim]
 */
export function tripProgress(route, stepIndex, sim) {
  const { steps, i, step } = stepAt(route, stepIndex)
  if (!step) return { doneM: 0, remainM: 0, remainS: 0, stepLeftM: 0 }
  let doneM = 0
  for (let k = 0; k < i; k++) doneM += steps[k].distanceM
  let remainS = 0
  for (let k = i; k < steps.length; k++) remainS += steps[k].etaS
  const simOn = Boolean(sim?.active) && Number.isFinite(sim?.distanceDoneM)
  if (simOn) {
    // same split as the v0.1 step card: a connector step is a walk (counts down with distance) plus a ride
    const walkS = step.kind === 'connector' ? Math.min(step.etaS, step.distanceM / WALK_MPS) : step.etaS
    const rideS = step.etaS - walkS
    const stepDone = clamp(sim.distanceDoneM - doneM, 0, step.distanceM)
    const walkFrac = step.distanceM > 0 ? stepDone / step.distanceM : 1
    const rideFrac = step.kind === 'connector' && sim.onConnector ? clamp(sim.rideProgress ?? 0, 0, 1) : 0
    remainS -= walkS * walkFrac + rideS * rideFrac
    doneM = Math.max(doneM, sim.distanceDoneM)
  }
  const cum = cumulativeM(route)
  const startM = cum[step.from] ?? 0
  const walked = simOn ? Math.max(startM, sim.distanceDoneM) : startM
  let target = step.to
  if (step.kind === 'connector' && Number.isInteger(step.connector?.boardIndex)) {
    const board = step.connector.boardIndex
    target = walked < (cum[board] ?? 0) - 0.01 ? board : (step.connector.exitIndex ?? step.to)
  }
  const stepLeftM = step.kind === 'start' ? 0 : Math.max(0, (cum[target] ?? 0) - walked)
  return { doneM, remainM: Math.max(0, (route.lengthM ?? 0) - doneM), remainS: Math.max(0, remainS), stepLeftM }
}

/** Arrival wall-clock time (epoch ms): now plus the time left at 1x walking. */
export function arrivalEpochMs(nowMs, remainS) {
  return nowMs + Math.max(0, Number.isFinite(remainS) ? remainS : 0) * 1000
}

/** Display name of the place a step names (bays read "Bay B1-43", as painted, in an LTR isolate in Arabic). */
function placeName(index, landmark, lang) {
  if (!landmark) return ''
  const info = landmark.type === 'bay' ? entityInfo(index, landmark.id) : null
  return pick(info?.name ?? landmark.name, lang)
}

/**
 * Preposition of a turn's landmark. The step object keeps only the landmark, the generated step text keeps how
 * it relates to the corner ("at" / "towards" / "after"); the condensed card must not contradict the full text.
 */
function prepOf(step) {
  const en = String(step?.text?.en ?? '')
  if (/\btowards\b/i.test(en)) return 'hud.verbTowards'
  if (/\bafter\b/i.test(en)) return 'hud.verbAfter'
  return 'hud.verbAt'
}

/**
 * The lift button to press, as printed on the panel ("B1", "G", "1") in both languages, left-to-right isolated in
 * Arabic text (model.levelButtonLabel: «ب١» can read like «با», «أ» / «١» are near-identical strokes).
 */
export function pressCode(c, lang) {
  const code = pick(c?.buttonLabel, 'en')
  return code && lang === 'ar' ? `\u2066${code}\u2069` : code
}

/**
 * The first turn after a ride, folded into the connector step's text by the routing ("…, then turn left at the top"):
 * "then turn left at the top" / "…at the bottom" (escalators), "…as you step out" (lifts, stairs); null when none.
 */
export function exitTurnText(c, lang) {
  const turn = c?.exitTurn
  if (!turn || turn === 'straight') return null
  const where = c.type === 'escalator' ? (c.direction === 'down' ? 'bottom' : 'top') : 'out'
  return t(`hud.where.${where}`, lang, { turn: t(`hud.then.${turn}`, lang) })
}

function connectorGoesUp(index, c) {
  if (c?.direction === 'up') return true
  if (c?.direction === 'down') return false
  const from = index?.levelById?.get(c?.fromLevelId)?.ordinal ?? 0
  const to = index?.levelById?.get(c?.toLevelId)?.ordinal ?? 0
  return to > from
}

/**
 * Turn card text (DESIGN-GLASS.md 7.3): a small verb line over a big name line, the step's icon and tile tone; a
 * connector step with a turn right after the ride adds it as `then` ("then turn left at the top"), under the name.
 * @returns {{ icon: string, verb: string, verbShort?: string, name: string, press: string|null, tone: 'route'|'arrive',
 *   then?: string|null }}
 */
export function turnCardContent(index, route, stepIndex, lang) {
  const { steps, i, step } = stepAt(route, stepIndex)
  if (!step) return { icon: 'turn_straight', verb: '', name: '', press: null, tone: 'route' }
  let s = step
  if (step.kind === 'start') {
    if (step.landmark) return { icon: 'start', verb: t('hud.face', lang), name: placeName(index, step.landmark, lang), press: null, tone: 'route' }
    s = steps[i + 1] ?? step
  }
  const icon = stepIconName(s)
  const level = (id) => (id ? levelName(index, id, lang) : '')
  switch (s.kind) {
    case 'turn': {
      const verb = t(`hud.turn.${s.turn ?? 'straight'}`, lang)
      if (s.landmark) return { icon, verb: t(prepOf(s), lang, { verb }), name: placeName(index, s.landmark, lang), press: null, tone: 'route' }
      return { icon, verb: level(s.levelId), name: verb, press: null, tone: 'route' }
    }
    case 'walk': {
      const verb = t('hud.turn.straight', lang)
      if (s.landmark) return { icon, verb: t('hud.verbPast', lang, { verb }), name: placeName(index, s.landmark, lang), press: null, tone: 'route' }
      return { icon, verb: level(s.levelId), name: verb, press: null, tone: 'route' }
    }
    case 'connector': {
      const c = s.connector ?? {}
      const name = level(c.toLevelId)
      const then = exitTurnText(c, lang)
      if (c.type === 'lift') {
        // (the card shows the code in a left-to-right <bdi>)
        return { icon, verb: t('hud.liftTo', lang, { name: pick(c.name, lang) }), name, press: c.buttonLabel ? pick(c.buttonLabel, 'en') : null, tone: 'route', then }
      }
      const up = connectorGoesUp(index, c)
      // verbShort: the verb without its trailing "to" (narrow phones: one line next to the SIMULATION pill)
      if (c.type === 'stairs') return { icon, verb: t('hud.stairsTo', lang), verbShort: t(up ? 'hud.stairsUp' : 'hud.stairsDown', lang), name, press: null, tone: 'route', then }
      return { icon, verb: t(up ? 'hud.escalatorUpTo' : 'hud.escalatorDownTo', lang), verbShort: t(up ? 'hud.escalatorUp' : 'hud.escalatorDown', lang), name, press: null, tone: 'route', then }
    }
    case 'arrive':
      return { icon, verb: t('hud.arriveAt', lang), name: placeName(index, s.landmark, lang), press: null, tone: 'arrive' }
    default:
      return { icon, verb: '', name: pick(s.text, lang), press: null, tone: 'route' }
  }
}

/**
 * Turn bubble text (DESIGN-GLASS.md 6.5) for the bubble anchored at the end of the current step (a 0 m "start"
 * step shows the next step's bubble). The icon is always the same arrow as the verb. A connector step says where it
 * goes ("to Level 1") until you board; on it (riding, or waiting at the lift doors once the button is pressed) the
 * turn right after the ride ("then turn left at the top"), when there is one.
 * @param {object} [sim] the App's simulator state (lift `phase: 'wait'` shows the button to press)
 * @returns {{ icon: string, title: string, sub: string|null, kind: 'turn'|'connector'|'arrive' }}
 */
export function bubbleContent(index, route, stepIndex, lang, sim) {
  let { steps, i, step } = stepAt(route, stepIndex)
  if (!step) return { icon: 'turn_straight', title: '', sub: null, kind: 'turn' }
  if (step.kind === 'start' && steps[i + 1]) {
    i += 1
    step = steps[i]
  }
  const next = steps[i + 1]
  const icon = stepIconName(step)
  const straightOn = () => {
    if (!next) return null
    if (next.kind === 'arrive' && next.distanceM < 1) return t('hud.thenArrive', lang)
    return t('hud.andStraight', lang, { distance: formatDistance(next.distanceM, lang) })
  }
  switch (step.kind) {
    case 'turn':
      return { icon, title: t(`hud.turn.${step.turn ?? 'straight'}`, lang), sub: straightOn(), kind: 'turn' }
    case 'walk':
      return { icon, title: t('hud.turn.straight', lang), sub: straightOn(), kind: 'turn' }
    case 'connector': {
      const c = step.connector ?? {}
      const on = Boolean(sim?.active && sim?.onConnector)
      const sub = (on && exitTurnText(c, lang)) || t('hud.toLevel', lang, { level: c.toLevelId ? levelName(index, c.toLevelId, lang) : '' })
      if (c.type === 'lift') {
        const waiting = on && sim?.phase === 'wait'
        return { icon, title: pick(c.name, lang), sub: waiting && c.buttonLabel ? t('hud.press', lang, { label: pressCode(c, lang) }) : sub, kind: 'connector' }
      }
      const up = connectorGoesUp(index, c)
      if (c.type === 'stairs') return { icon, title: t(up ? 'hud.stairsUp' : 'hud.stairsDown', lang), sub, kind: 'connector' }
      return { icon, title: t(up ? 'hud.escalatorUp' : 'hud.escalatorDown', lang), sub, kind: 'connector' }
    }
    case 'arrive':
      return { icon, title: placeName(index, step.landmark, lang), sub: step.side ? t(`hud.side.${step.side}`, lang) : null, kind: 'arrive' }
    default:
      return { icon, title: pick(step.text, lang), sub: null, kind: 'turn' }
  }
}

/**
 * What the App sends to `engine.setNextTurn` (CONTRACT 3b) for the current step: its end point (a connector
 * step: where you board; a 0 m start step: the next step's end), the bubble title in both languages, and the kind.
 * @returns {{ levelId: string, x: number, y: number, label: { en: string, ar: string }, kind: 'turn'|'connector'|'arrive' } | null}
 */
export function nextTurnFor(index, route, stepIndex) {
  let { steps, i, step } = stepAt(route, stepIndex)
  if (!step) return null
  if (step.kind === 'start' && steps[i + 1]) {
    i += 1
    step = steps[i]
  }
  const at = step.kind === 'connector' && Number.isInteger(step.connector?.boardIndex) ? step.connector.boardIndex : step.to
  const p = route.points[at]
  if (!p) return null
  const en = bubbleContent(index, route, i, 'en')
  const ar = bubbleContent(index, route, i, 'ar')
  return { levelId: p.levelId, x: p.x, y: p.y, label: { en: en.title, ar: ar.title }, kind: en.kind }
}

/**
 * Lift / stairs card while riding (DESIGN-GLASS.md 6.2): "Lift A → Level 1" + "Press “1”", and the turn right after
 * the ride ("Press “B1”, then turn left as you step out"; the stairs: "then turn left as you step out").
 * @returns {{ icon: 'lift'|'stairs', headline: string, body: string|null } | null}
 */
export function liftCardContent(index, step, lang) {
  const c = step?.connector
  if (!c || (c.type !== 'lift' && c.type !== 'stairs')) return null
  const level = c.toLevelId ? levelName(index, c.toLevelId, lang) : ''
  const then = exitTurnText(c, lang)
  if (c.type === 'stairs') return { icon: 'stairs', headline: t('hud.stairsRide', lang, { level }), body: then }
  const press = c.buttonLabel ? t('hud.press', lang, { label: pressCode(c, lang) }) : null
  return {
    icon: 'lift',
    headline: t('hud.liftRide', lang, { name: pick(c.name, lang), level }),
    body: press && then ? t('hud.pressThen', lang, { press, then }) : (press ?? then),
  }
}

/** Compass bearing from a to b (0 = north, clockwise). */
export function bearingDeg(ax, ay, bx, by) {
  return ((Math.atan2(bx - ax, by - ay) * 180) / Math.PI + 360) % 360
}

/**
 * Where the eye stands when no walk is playing (the engine's Walk view rule, CONTRACT 3b): the current step's
 * start, facing along the route. Used by the mini-map until the engine reports the walker / camera.
 * @returns {{ levelId: string, x: number, y: number, headingDeg: number } | null}
 */
export function standPoint(route, stepIndex) {
  const { step } = stepAt(route, stepIndex)
  if (!step) return null
  const pts = route.points
  const k = clamp(step.from, 0, pts.length - 1)
  const a = pts[k]
  let heading = 0
  for (let j = k + 1; j < pts.length; j++) {
    const b = pts[j]
    if (b.levelId !== a.levelId) break
    if (Math.hypot(b.x - a.x, b.y - a.y) > 0.3) {
      heading = bearingDeg(a.x, a.y, b.x, b.y)
      break
    }
  }
  return { levelId: a.levelId, x: a.x, y: a.y, headingDeg: heading }
}

/**
 * Metres along the route of a map point (the walker), by projection onto the route's walking edges on its level.
 * `hintM` (e.g. the simulator's distance) breaks ties where the route passes the same spot twice.
 */
export function alongRouteM(route, point, hintM = null) {
  if (!route?.points || !point) return 0
  const cum = cumulativeM(route)
  let best = null
  for (let k = 0; k < route.points.length - 1; k++) {
    const a = route.points[k]
    const b = route.points[k + 1]
    if (a.levelId !== point.levelId || b.levelId !== point.levelId) continue
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const u = len2 > 0 ? clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / len2, 0, 1) : 0
    const d = Math.hypot(a.x + dx * u - point.x, a.y + dy * u - point.y)
    const m = cum[k] + (cum[k + 1] - cum[k]) * u
    const score = d + (hintM != null ? Math.abs(m - hintM) * 0.05 : 0)
    if (!best || score < best.score) best = { score, m }
  }
  return best ? best.m : (hintM ?? 0)
}

/**
 * The route's polylines on one level, split at `doneM` metres into the walked part and the part ahead.
 * Only edges with both ends on the level are drawn (rides between levels are not).
 * @returns {{ walked: Array<Array<[number, number]>>, ahead: Array<Array<[number, number]>> }}
 */
export function levelRouteParts(route, levelId, doneM = 0) {
  const walked = []
  const ahead = []
  if (!route?.points) return { walked, ahead }
  const cum = cumulativeM(route)
  let curW = null
  let curA = null
  for (let k = 0; k < route.points.length - 1; k++) {
    const a = route.points[k]
    const b = route.points[k + 1]
    if (a.levelId !== levelId || b.levelId !== levelId) {
      curW = null
      curA = null
      continue
    }
    const m0 = cum[k]
    const m1 = cum[k + 1]
    const pa = [a.x, a.y]
    const pb = [b.x, b.y]
    if (m1 <= doneM) {
      if (!curW) walked.push((curW = [pa]))
      curW.push(pb)
      curA = null
    } else if (m0 >= doneM) {
      if (!curA) ahead.push((curA = [pa]))
      curA.push(pb)
      curW = null
    } else {
      const u = (doneM - m0) / (m1 - m0 || 1)
      const pm = [a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u]
      if (!curW) walked.push((curW = [pa]))
      curW.push(pm)
      curW = null
      ahead.push((curA = [pm, pb]))
    }
  }
  return { walked, ahead }
}

/**
 * Where the turn bubble goes this frame (DESIGN-GLASS.md 6.5).
 * - 'anchored': the 34 px icon disc centred on the anchor; the box above and toward the inline end, its
 *   bottom-start corner tucked 16 px under the disc; flips below / to the other side when it would leave the free
 *   area, then is clamped inside it (never over the top HUD, the dome or the bar). A box too wide for either side,
 *   clamped back over its own icon, moves wholly above the icon (below it when there is no room above): the icon never
 *   covers the text.
 * - 'edge': the anchor is off to the side: a 44 px pill at the left / right edge of the free area (the side the
 *   target really is, never mirrored), at the free area's middle. Not when the turn is near (`near`: under 6 m, the
 *   icon-alone state): the view starts turning into a corner before you reach it, so the point slides off the far
 *   side and an edge pill would point the wrong way; the bubble hides ('hidden') and the turn card says it. An anchor straight ahead but above / below the free
 *   area (riding an escalator up to its top, or under a toast that narrows the free area) stays 'anchored', its icon
 *   pinned to that edge of the free area, right above / below where the turn is.
 * - 'behind': more than 150° off, or behind the camera and more than 90° off: a pill at the bottom centre of the free
 *   area. A point behind the camera plane but still ahead (the eye standing on it at a lift door, the last metres of a
 *   down escalator pitched toward the floor) is right here: the icon pins to the bottom centre of the free area.
 * @param {object|null} anchor CONTRACT 3b AnchorPoint
 * @param {{ w: number, h: number }} box measured bubble box (CSS px)
 * @param {{ top: number, bottom: number, left: number, right: number }} free free area, container px
 * @param {{ rtl?: boolean, near?: boolean, gutter?: number, icon?: number, overlap?: number, pillW?: number, pillH?: number }} [opts]
 */
export function placeBubble(anchor, box, free, opts = {}) {
  const { rtl = false, near = false, gutter = 12, icon = 34, overlap = 16, pillW = 72, pillH = 44 } = opts
  const r = (v) => Math.round(v * 2) / 2
  if (!anchor || !free) return { mode: 'hidden', x: 0, y: 0 }
  const rel = Number.isFinite(anchor.relBearingDeg) ? anchor.relBearingDeg : 0
  const midY = (free.top + free.bottom) / 2
  // the eye is on (or right over) the point: its bearing means nothing, it is here
  const here = Boolean(anchor.behind) && (Math.abs(rel) <= 90 || (Number.isFinite(anchor.distanceM) && anchor.distanceM < 2))
  if (!here && (anchor.behind || Math.abs(rel) > 150)) {
    return { mode: 'behind', x: r((free.left + free.right) / 2), y: r(free.bottom - 8 - pillH / 2), side: rel >= 0 ? 'right' : 'left' }
  }
  // ahead but only above (or below) the free area: the icon is pinned to that edge of the free area, right above
  // where the turn is (an edge pill would point sideways); whether the engine counts it visible or not (a toast
  // can narrow the free area below the engine's)
  const ahead =
    here ||
    (anchor.x != null &&
      anchor.y != null &&
      anchor.x >= free.left + gutter &&
      anchor.x <= free.right - gutter &&
      (anchor.y < free.top || anchor.y > free.bottom))
  if (!ahead && (!anchor.visible || anchor.x == null || anchor.y == null)) {
    if (near) return { mode: 'hidden', x: 0, y: 0 }
    const side = rel >= 0 ? 'right' : 'left'
    const x = side === 'right' ? free.right - gutter - pillW / 2 : free.left + gutter + pillW / 2
    return { mode: 'edge', x: r(x), y: r(midY), side }
  }
  const x = here ? (free.left + free.right) / 2 : anchor.x
  const y = here ? free.bottom - 8 - icon / 2 : ahead ? clamp(anchor.y, free.top + icon / 2, free.bottom - 8 - icon / 2) : anchor.y
  const inset = icon / 2 - overlap
  const w = Math.max(0, box?.w ?? 0)
  const h = Math.max(0, box?.h ?? 0)
  // free.top is already the top HUD's bottom + 8 px (DESIGN-GLASS 6.5); keep 8 px off the dome
  const minTop = free.top
  const maxTop = free.bottom - 8 - h
  let top = y - inset - h
  let below = false
  if (top < minTop) {
    below = true
    top = y + inset
  }
  top = maxTop >= minTop ? clamp(top, minTop, maxTop) : minTop
  const minLeft = free.left + gutter
  const maxLeft = free.right - gutter - w
  let left = rtl ? x - inset - w : x + inset
  let flipped = false
  // (half a pixel of slack: a measured width like 201.4 px must not flip a box that fits)
  if (!rtl && left + w > free.right - gutter + 0.5) {
    left = x - inset - w
    flipped = true
  } else if (rtl && left < free.left + gutter - 0.5) {
    left = x + inset
    flipped = true
  }
  left = maxLeft >= minLeft ? clamp(left, minLeft, maxLeft) : minLeft
  // clamped back over its own icon (more than the designed corner tuck): the box goes wholly above the icon, or below
  if (x + icon / 2 > left + overlap + 0.5 && x - icon / 2 < left + w - overlap - 0.5) {
    const above = y - icon / 2 - 6 - h
    below = above < minTop
    top = below ? Math.min(y + icon / 2 + 6, Math.max(minTop, maxTop)) : above
  }
  // physical side of the box relative to the icon (LTR: right unless flipped; RTL: left unless flipped)
  const boxOnRight = rtl ? flipped : !flipped
  return { mode: 'anchored', x: r(x), y: r(y), boxDx: r(left - x), boxDy: r(top - y), below, flipped, side: boxOnRight ? 'right' : 'left' }
}
