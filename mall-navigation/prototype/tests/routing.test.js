import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { indexVenue } from '../src/data/venue.js'
import {
  findRoute,
  findRouteToTarget,
  getRoutingProfile,
  rankByTravelTime,
  resolveTarget,
  travelTimesFrom,
  edgeWeight,
  LIFT_PREFERENCE_PENALTY_S,
} from '../src/routing/route.js'
import { buildSteps, classifyTurn, sideOf } from '../src/routing/instructions.js'
import { edgeCostS, SPEEDS } from '../src/routing/costs.js'
import { bearing, distToPolygon, signedDelta } from '../src/routing/geometry.js'

const VENUE_PATH = fileURLToPath(new URL('../public/venues/demo-muscat/venue.json', import.meta.url))
const index = indexVenue(JSON.parse(readFileSync(VENUE_PATH, 'utf8')))

const START_ANCHOR = index.anchorById.get(index.venue.meta.defaultStartAnchorId)
const START = START_ANCHOR.nodeId
const foodCourt = index.landmarkById.get('lm-food-court')

/** A food-court counter on L1: category food, door on the edge of the food-court seating area. */
const FOOD_COURT_OCC = [...index.occupantById.values()].find((o) => {
  const door = index.nodeById.get(o.entranceNodeIds[0])
  return o.category === 'food' && door.levelId === 'L1' && distToPolygon(door.point, foodCourt.polygon) <= 0.5
})

const ARABIC_LETTER = /[؀-ۿ]/
/**
 * Arabic text minus stand-alone lift letter labels ("A" / "B") and bay codes, which are shown exactly as painted
 * ("B2-14") inside a left-to-right isolate: the only Latin letters / ASCII digits allowed in it.
 */
const withoutLiftLetters = (s) => s.replace(/\u2066[^\u2069]*\u2069/g, '').replace(/(^|[\s‹«(])[AB](?=$|[\s›»)،.])/g, '$1')

const connectorIds = (route) => route.edges.filter((e) => e.connectorId).map((e) => e.connectorId)
const kinds = (route) => route.edges.map((e) => e.kind)

function expectWellFormed(route, fromNodeId, toNodeId) {
  expect(route).not.toBeNull()
  expect(route.nodeIds[0]).toBe(fromNodeId)
  expect(route.nodeIds[route.nodeIds.length - 1]).toBe(toNodeId)
  expect(route.points).toHaveLength(route.nodeIds.length)
  expect(route.edges).toHaveLength(route.nodeIds.length - 1)
  route.points.forEach((p, i) => {
    const node = index.nodeById.get(route.nodeIds[i])
    expect(p).toEqual({ x: node.point[0], y: node.point[1], levelId: node.levelId, nodeId: node.id })
  })
  let len = 0
  let eta = 0
  route.edges.forEach((e, i) => {
    const a = route.nodeIds[i]
    const b = route.nodeIds[i + 1]
    // Each edge joins consecutive nodes; one-way edges only in their own direction.
    if (e.oneWay) expect([e.from, e.to]).toEqual([a, b])
    else expect([e.from, e.to].sort()).toEqual([a, b].sort())
    len += e.lengthM
    eta += edgeCostS(index, e)
  })
  expect(route.lengthM).toBeCloseTo(len, 1)
  expect(route.etaS).toBeCloseTo(eta, 0)
}

describe('fixtures', () => {
  it('uses the South entrance plate and a real L1 food-court counter', () => {
    expect(START_ANCHOR.id).toBe('A-G-ENT-S')
    expect(START_ANCHOR.kind).toBe('entrance')
    expect(FOOD_COURT_OCC).toBeTruthy()
  })
})

describe('costs', () => {
  it('follows the contract speeds', () => {
    expect(SPEEDS).toMatchObject({ walkMps: 1.2, escalatorMps: 0.5, escalatorBoardS: 5, liftWaitS: 45, liftPerFloorS: 4, stairsPerFloorS: 15 })
    const walk = index.venue.graph.edges.find((e) => e.kind === 'walk')
    expect(edgeCostS(index, walk)).toBeCloseTo(walk.lengthM / 1.2, 6)
    const esc = index.venue.graph.edges.find((e) => e.kind === 'escalator')
    expect(edgeCostS(index, esc)).toBeCloseTo(esc.lengthM / 0.5 + 5, 6)
    const liftA = index.connectorById.get('lift-a')
    const stopOn = (levelId) => liftA.stops.find((st) => st.levelId === levelId).nodeId
    const liftB2toL1 = index.venue.graph.edges.find((e) => e.connectorId === 'lift-a' && e.from === stopOn('B2') && e.to === stopOn('L1'))
    expect(edgeCostS(index, liftB2toL1)).toBe(45 + 4 * 3)
    const stairs = index.venue.graph.edges.find((e) => e.kind === 'stairs')
    expect(edgeCostS(index, stairs)).toBe(15)
  })

  it('adds the lift preference only to the default profile search weight, never to the ETA', () => {
    const lift = index.venue.graph.edges.find((e) => e.kind === 'lift')
    expect(edgeWeight(index, lift, false)).toBe(edgeCostS(index, lift) + LIFT_PREFERENCE_PENALTY_S)
    expect(edgeWeight(index, lift, true)).toBe(edgeCostS(index, lift))
  })
})

describe('findRoute', () => {
  it('goes from the South entrance up to the food court by the UP escalator, never the down one', () => {
    const to = FOOD_COURT_OCC.entranceNodeIds[0]
    const route = findRoute(index, START, to)
    expectWellFormed(route, START, to)
    expect(route.stepFree).toBe(false)
    const ids = connectorIds(route)
    expect(ids).toContain('esc-1-up')
    expect(ids).not.toContain('esc-2-down')
    const esc = route.edges.find((e) => e.connectorId === 'esc-1-up')
    const i = route.edges.indexOf(esc)
    expect(route.nodeIds[i]).toBe(esc.from) // ridden bottom -> top
    expect(route.points[i].levelId).toBe('G')
    expect(route.points[i + 1].levelId).toBe('L1')
    expect(route.levelIds).toEqual(['G', 'L1'])
  })

  it('comes back down by the DOWN escalator', () => {
    const from = FOOD_COURT_OCC.entranceNodeIds[0]
    const route = findRoute(index, from, START)
    expectWellFormed(route, from, START)
    const ids = connectorIds(route)
    expect(ids).toContain('esc-2-down')
    expect(ids).not.toContain('esc-1-up')
    expect(route.levelIds).toEqual(['L1', 'G'])
  })

  it('never rides an escalator against its direction, even when that would be shorter', () => {
    const up = index.connectorById.get('esc-1-up')
    const [bottom, top] = up.stops
    const route = findRoute(index, top.nodeId, bottom.nodeId)
    expectWellFormed(route, top.nodeId, bottom.nodeId)
    expect(connectorIds(route)).not.toContain('esc-1-up')
  })

  it('step-free: uses a lift and never escalators or stairs', () => {
    const to = FOOD_COURT_OCC.entranceNodeIds[0]
    const route = findRoute(index, START, to, { stepFree: true })
    expectWellFormed(route, START, to)
    expect(route.stepFree).toBe(true)
    expect(kinds(route)).toContain('lift')
    expect(kinds(route)).not.toContain('escalator')
    expect(kinds(route)).not.toContain('stairs')
    for (const e of route.edges) expect(e.stepFree).toBe(true)
    const back = findRoute(index, to, START, { stepFree: true })
    expect(kinds(back)).toContain('lift')
    for (const e of back.edges) expect(e.stepFree).toBe(true)
  })

  it('step-free to and from parking never uses the stair core', () => {
    for (const bay of [...index.bayById.values()].filter((_, i) => i % 15 === 0)) {
      const route = findRoute(index, START, bay.nodeId, { stepFree: true })
      expectWellFormed(route, START, bay.nodeId)
      expect(kinds(route)).not.toContain('stairs')
      expect(kinds(route)).toContain('lift')
    }
  })

  it('reaches a B2 bay through a lift', () => {
    const bay = index.bayById.get('bay-B2-028')
    expect(bay.levelId).toBe('B2')
    const route = findRouteToTarget(index, START, bay.id)
    expectWellFormed(route, START, bay.nodeId)
    expect(kinds(route)).toContain('lift')
    expect(route.levelIds[route.levelIds.length - 1]).toBe('B2')
    const liftStep = route.steps.find((s) => s.kind === 'connector')
    expect(liftStep.connector).toMatchObject({ type: 'lift', toLevelId: 'B2', direction: 'down', buttonLabel: { en: 'B2', ar: 'ب٢' } })
    expect(liftStep.text.en).toContain('Take Lift A to Parking B2. Press \u201CB2\u201D')
    expect(liftStep.text.ar).toContain('خذ المصعد أ إلى مواقف ب٢. اضغط «ب٢»')
  })

  it('reaches every occupant from the South entrance, and back, in both profiles', () => {
    for (const stepFree of [false, true]) {
      for (const occ of index.occupantById.values()) {
        const there = findRouteToTarget(index, START, occ.id, { stepFree })
        expect(there, `${occ.id} stepFree=${stepFree}`).not.toBeNull()
        expect(occ.entranceNodeIds).toContain(there.toNodeId)
        expect(there.steps[there.steps.length - 1].kind).toBe('arrive')
        const back = findRoute(index, there.toNodeId, START, { stepFree })
        expect(back, `${occ.id} back stepFree=${stepFree}`).not.toBeNull()
        if (stepFree) for (const e of [...there.edges, ...back.edges]) expect(e.stepFree).toBe(true)
      }
    }
  })

  it('reaches every amenity, anchor and bay in both profiles', () => {
    for (const stepFree of [false, true]) {
      const times = travelTimesFrom(index, START, { stepFree })
      for (const am of index.amenityById.values()) expect(times.has(am.nodeId), am.id).toBe(true)
      for (const a of index.anchorById.values()) expect(times.has(a.nodeId), a.id).toBe(true)
      for (const b of index.bayById.values()) expect(times.has(b.nodeId), b.id).toBe(true)
    }
  })

  it('returns the cheapest route (A* agrees with Dijkstra)', () => {
    const ids = [...index.nodeById.keys()]
    for (const stepFree of [false, true]) {
      for (let i = 0; i < ids.length; i += 37) {
        const times = travelTimesFrom(index, ids[i], { stepFree })
        for (let j = 5; j < ids.length; j += 29) {
          const route = findRoute(index, ids[i], ids[j], { stepFree })
          const best = times.get(ids[j])
          expect(Boolean(route)).toBe(Boolean(best))
          if (!route) continue
          const weight = route.edges.reduce((s, e) => s + edgeWeight(index, e, stepFree), 0)
          expect(weight).toBeCloseTo(best.weightS, 0)
        }
      }
    }
  })

  it('handles unknown nodes and a zero-length route', () => {
    expect(findRoute(index, 'n-nope', START)).toBeNull()
    expect(findRoute(index, START, 'n-nope')).toBeNull()
    const here = findRoute(index, START, START)
    expect(here.nodeIds).toEqual([START])
    expect(here.edges).toEqual([])
    expect(here.lengthM).toBe(0)
    expect(here.etaS).toBe(0)
    expect(here.steps.map((s) => s.kind)).toEqual(['start', 'arrive'])
  })

  it('caches one graph per profile per venue', () => {
    expect(getRoutingProfile(index, false)).toBe(getRoutingProfile(index, false))
    expect(getRoutingProfile(index, true)).toBe(getRoutingProfile(index, true))
    expect(getRoutingProfile(index, true)).not.toBe(getRoutingProfile(index, false))
    const other = indexVenue(JSON.parse(readFileSync(VENUE_PATH, 'utf8')))
    expect(getRoutingProfile(other, false)).not.toBe(getRoutingProfile(index, false))
  })

  it('resolves targets and ranks them by travel time', () => {
    expect(resolveTarget(index, 'occ-oud-house')).toMatchObject({ type: 'occupant', levelId: 'G', nodeIds: ['n-G-046'] })
    // the Arabic name shows the bay code as painted, inside a left-to-right isolate (never flipped)
    expect(resolveTarget(index, 'bay-B2-028')).toMatchObject({ type: 'bay', levelId: 'B2', name: { en: 'Bay B2-28', ar: 'الموقف \u2066B2-28\u2069' } })
    expect(resolveTarget(index, 'nothing')).toBeNull()
    const restrooms = [...index.amenityById.values()].filter((a) => a.category.startsWith('restroom')).map((a) => a.id)
    const ranked = rankByTravelTime(index, START, restrooms)
    expect(ranked).toHaveLength(restrooms.length)
    for (let i = 1; i < ranked.length; i++) expect(ranked[i].etaS).toBeGreaterThanOrEqual(ranked[i - 1].etaS)
  })
})

// ---------------------------------------------------------------------------------------------------------
// Instructions
// ---------------------------------------------------------------------------------------------------------

/** A spread of routes covering both profiles, all levels, all connector types. */
function sampleRoutes() {
  const routes = []
  for (const stepFree of [false, true]) {
    for (const occ of index.occupantById.values()) routes.push(findRouteToTarget(index, START, occ.id, { stepFree }))
    for (const am of index.amenityById.values()) routes.push(findRouteToTarget(index, START, am.id, { stepFree }))
    const bays = [...index.bayById.values()]
    for (let i = 0; i < bays.length; i += 9) {
      routes.push(findRouteToTarget(index, START, bays[i].id, { stepFree }))
      routes.push(findRoute(index, bays[i].nodeId, FOOD_COURT_OCC.entranceNodeIds[0], { stepFree }))
    }
    for (const a of index.anchorById.values()) routes.push(findRoute(index, a.nodeId, 'n-L1-040', { stepFree }))
  }
  return routes.filter(Boolean)
}
const SAMPLES = sampleRoutes()

describe('buildSteps', () => {
  it('tiles each route: start [0,0], contiguous steps, arrive at the last point', () => {
    for (const route of SAMPLES) {
      const { steps } = route
      expect(steps[0]).toMatchObject({ index: 0, kind: 'start', from: 0, to: 0, distanceM: 0, etaS: 0 })
      expect(steps[steps.length - 1]).toMatchObject({ kind: 'arrive', to: route.points.length - 1 })
      for (let i = 1; i < steps.length; i++) {
        expect(steps[i].index).toBe(i)
        expect(steps[i].from).toBe(steps[i - 1].to)
        expect(steps[i].to).toBeGreaterThanOrEqual(steps[i].from)
      }
      const d = steps.reduce((s, x) => s + x.distanceM, 0)
      const t = steps.reduce((s, x) => s + x.etaS, 0)
      expect(d).toBeCloseTo(route.lengthM, 0)
      expect(Math.abs(t - route.etaS)).toBeLessThan(0.5)
      for (const s of steps) {
        expect(['start', 'walk', 'turn', 'connector', 'arrive']).toContain(s.kind)
        expect(index.levelById.has(s.levelId)).toBe(true)
        expect(typeof s.text.en).toBe('string')
        expect(typeof s.text.ar).toBe('string')
        if (s.kind === 'turn') expect(['slight_left', 'slight_right', 'left', 'right', 'uturn']).toContain(s.turn)
        if (s.kind === 'connector') {
          expect(s.connector).toMatchObject({ toLevelId: route.points[s.to].levelId })
          expect(s.connector.buttonLabel.en).toBeTruthy()
          expect(s.connector.buttonLabel.ar).toBeTruthy()
        } else {
          expect(s.connector).toBeNull()
        }
      }
    }
  })

  it('has one connector step per ride, merged across multi-floor stairs', () => {
    for (const route of SAMPLES) {
      let rides = 0
      for (let i = 0; i < route.edges.length; i++) {
        const e = route.edges[i]
        if (!e.connectorId) continue
        const prev = route.edges[i - 1]
        if (!prev || prev.connectorId !== e.connectorId) rides++
      }
      expect(route.steps.filter((s) => s.kind === 'connector')).toHaveLength(rides)
    }
  })

  it('names a known left turn as left in both languages', () => {
    // South entrance -> Batinah Dates: walk north up the south mall, then turn LEFT (west) at the atrium court.
    const route = findRouteToTarget(index, START, 'occ-batinah-dates')
    const turn = route.steps.find((s) => s.kind === 'turn')
    const c = turn.to
    const P = route.points.map((p) => [p.x, p.y])
    const into = bearing(P[c - 1], P[c])
    const out = bearing(P[c], P[c + 1])
    expect(Math.round(into)).toBe(0) // heading north
    expect(Math.round(out)).toBe(270) // then west
    expect(signedDelta(into, out)).toBeLessThan(0) // anticlockwise = left
    expect(turn.turn).toBe('left')
    expect(turn.text.en).toMatch(/^Turn left\b/)
    expect(turn.text.ar).toMatch(/^انعطف يساراً/)
    expect(turn.text.en).not.toMatch(/right/i)
    expect(turn.text.ar).not.toMatch(/يمين/)
  })

  it('gets every clear turn side right from the walking direction', () => {
    let checked = 0
    for (const route of SAMPLES) {
      const P = route.points.map((p) => [p.x, p.y])
      for (const s of route.steps) {
        if (s.kind !== 'turn' || !['left', 'right'].includes(s.turn)) continue
        const c = s.to
        if (c < 1 || c + 1 >= P.length) continue
        const into = bearing(P[c - 1], P[c])
        const out = bearing(P[c], P[c + 1])
        if (into == null || out == null) continue
        const d = signedDelta(into, out)
        if (Math.abs(d) < 60) continue
        expect(s.turn, `${route.fromNodeId}->${route.toNodeId} step ${s.index}`).toBe(d > 0 ? 'right' : 'left')
        expect(s.text.en.toLowerCase()).toContain(s.turn)
        expect(s.text.ar).toContain(s.turn === 'left' ? 'يساراً' : 'يميناً')
        checked++
      }
    }
    expect(checked).toBeGreaterThan(50)
  })

  it('says which side the destination is on, from the walking direction', () => {
    const route = findRouteToTarget(index, START, 'occ-oud-house')
    const arrive = route.steps[route.steps.length - 1]
    const n = route.points.length
    const [a, b, c] = [route.points[n - 3], route.points[n - 2], route.points[n - 1]]
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    expect(cross).toBeGreaterThan(0) // door spur bends anticlockwise -> on the left
    expect(arrive.side).toBe('left')
    expect(arrive.text).toEqual({ en: 'Oud House is on your left', ar: 'وصلت: بيت العود على يسارك' })
    expect(arrive.landmark).toMatchObject({ id: 'occ-oud-house' })
  })

  it('writes start, escalator and lift steps in both languages', () => {
    const up = findRoute(index, START, FOOD_COURT_OCC.entranceNodeIds[0])
    expect(up.steps[0].text.en).toMatch(/^Start at the south entrance/)
    expect(up.steps[0].text.ar).toMatch(/^ابدأ عند المدخل الجنوبي/)
    const esc = up.steps.find((s) => s.kind === 'connector')
    expect(esc.connector).toMatchObject({ id: 'esc-1-up', type: 'escalator', direction: 'up', fromLevelId: 'G', toLevelId: 'L1' })
    expect(esc.text.en).toMatch(/^Take the up escalator to Level 1/)
    expect(esc.text.ar).toMatch(/^خذ السلم المتحرك صعوداً إلى المستوى الأول/)

    const down = findRoute(index, FOOD_COURT_OCC.entranceNodeIds[0], START)
    const escDown = down.steps.find((s) => s.kind === 'connector')
    expect(escDown.text.en).toMatch(/^Take the down escalator to Ground level/)
    expect(escDown.text.ar).toMatch(/^خذ السلم المتحرك نزولاً إلى المستوى الأرضي/)

    const lift = findRoute(index, START, FOOD_COURT_OCC.entranceNodeIds[0], { stepFree: true })
    const liftStep = lift.steps.find((s) => s.kind === 'connector')
    expect(liftStep.connector).toMatchObject({ type: 'lift', toLevelId: 'L1', buttonLabel: { en: '1', ar: '١' } })
    expect(liftStep.text.en).toMatch(/^Take Lift [AB] to Level 1\. Press \u201C1\u201D/)
    expect(liftStep.text.ar).toMatch(/^خذ المصعد [أب] إلى المستوى الأول\. اضغط «١»/)
  })

  it('tells you which way to turn when you step out of a lift, from the lift door direction', () => {
    const route = findRouteToTarget(index, START, 'bay-B2-028')
    const step = route.steps.find((s) => s.kind === 'connector')
    const lift = index.connectorById.get(step.connector.id)
    const exit = step.connector.exitIndex
    // Out of the door (doorFacingDeg) and then along the first proper corridor stretch.
    const P = route.points.map((p) => [p.x, p.y])
    let k = exit + 1
    while (k + 1 < P.length && Math.hypot(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]) < 3) k++
    const walkOn = bearing(P[k], P[k + 1])
    const d = signedDelta(lift.doorFacingDeg, walkOn)
    expect(Math.abs(d)).toBeGreaterThan(60)
    const side = d > 0 ? 'right' : 'left'
    expect(step.connector.exitTurn).toBe(side)
    expect(step.text.en).toContain(`, then turn ${side} as you step out`)
    expect(step.text.ar).toContain(`، ثم انعطف ${side === 'right' ? 'يميناً' : 'يساراً'} عند الخروج`)
  })

  it('splits a long straight walk with a "walk straight past" step', () => {
    const eastEntrance = index.anchorById.get('A-G-ENT-E').nodeId
    const route = findRouteToTarget(index, eastEntrance, 'bay-B1-005')
    const walk = route.steps.find((s) => s.kind === 'walk')
    expect(walk).toBeTruthy()
    expect(walk.turn).toBe('straight')
    expect(walk.landmark).toBeTruthy()
    expect(walk.text.en).toBe(`Walk straight past ${walk.landmark.name.en}`)
    expect(walk.text.ar).toBe(`تابع السير مباشرة متجاوزاً ${walk.landmark.name.ar}`)
    expect(walk.distanceM).toBeGreaterThanOrEqual(20)
    // Never "walk past" the lift or escalator you are about to take.
    const next = route.steps[walk.index + 1]
    if (next.kind === 'connector') expect(next.connector.id).not.toBe(walk.landmark.id)
  })

  it('keeps Arabic text free of Latin letters (lift letters excepted) and uses Arabic-Indic digits', () => {
    for (const route of SAMPLES) {
      for (const s of route.steps) {
        expect(withoutLiftLetters(s.text.ar), s.text.ar).not.toMatch(/[A-Za-z]/)
        expect(withoutLiftLetters(s.text.ar), s.text.ar).not.toMatch(/[0-9]/)
        expect(s.text.ar).toMatch(ARABIC_LETTER)
        expect(s.text.en, s.text.en).not.toMatch(ARABIC_LETTER)
      }
    }
  })

  it('uses landmarks within 15 m of the turn on the same level', () => {
    let named = 0
    for (const route of SAMPLES) {
      for (const s of route.steps) {
        if (s.kind !== 'turn' || !s.landmark) continue
        named++
        const corner = route.points[s.to]
        const lm = s.landmark
        let ok = false
        if (lm.type === 'occupant') {
          ok = index.occupantById.get(lm.id).entranceNodeIds.some((nid) => {
            const n = index.nodeById.get(nid)
            return n.levelId === corner.levelId && Math.hypot(n.point[0] - corner.x, n.point[1] - corner.y) <= 15
          })
        } else if (lm.type === 'landmark') {
          ok = index.landmarkById.get(lm.id).levelId === corner.levelId
        } else if (lm.type === 'connector') {
          ok = index.connectorById.get(lm.id).stops.some((st) => st.levelId === corner.levelId && Math.hypot(st.point[0] - corner.x, st.point[1] - corner.y) <= 15)
        }
        expect(ok, `${lm.id} near ${corner.nodeId}`).toBe(true)
        expect(s.text.en).toContain(lm.type === 'occupant' ? lm.name.en : '')
        expect(s.text.ar).toContain(lm.name.ar)
      }
    }
    expect(named).toBeGreaterThan(20)
  })

  it('rebuilds the same steps from the route path (deterministic)', () => {
    const route = findRouteToTarget(index, START, 'occ-majlis-cinemas')
    expect(buildSteps(index, route.nodeIds, route.edges)).toEqual(route.steps)
    expect(() => buildSteps(index, route.nodeIds, route.edges.slice(1))).toThrow()
  })

  it('classifies turn angles per the contract', () => {
    expect(classifyTurn(0)).toBe('straight')
    expect(classifyTurn(29)).toBe('straight')
    expect(classifyTurn(-45)).toBe('slight_left')
    expect(classifyTurn(45)).toBe('slight_right')
    expect(classifyTurn(-90)).toBe('left')
    expect(classifyTurn(90)).toBe('right')
    expect(classifyTurn(135)).toBe('right')
    expect(classifyTurn(150)).toBe('uturn')
    expect(classifyTurn(-170)).toBe('uturn')
    expect(sideOf(90)).toBe('right')
    expect(sideOf(-90)).toBe('left')
    expect(sideOf(10)).toBe('ahead')
    expect(sideOf(170)).toBe('behind')
  })
})

describe('parking plates: bay codes as painted in generated text (CONTRACT section 2)', () => {
  const plates = [...index.anchorById.values()].filter((a) => a.kind === 'parking_pillar')
  const LRI_CODE = /⁦B[12]-\d+⁩/

  it('every parking plate names its bay; plateLabel writes that code as painted inside an LTR isolate', async () => {
    const { plateLabel, plateBayCode } = await import('../src/routing/names.js')
    expect(plates.length).toBeGreaterThan(0)
    for (const plate of plates) {
      const code = plateBayCode(plate)
      expect(code, plate.id).toMatch(/^B[12]-\d+$/)
      const label = plateLabel(index, plate)
      expect(label.en, plate.id).toBe(plate.label.en)
      expect(label.ar, plate.id).toContain(`⁦${code}⁩`)
      expect(label.ar, plate.id).not.toMatch(/ب[١٢]-[٠-٩]/)
    }
  })

  it('the first step from a parking plate quotes the painted code, never «ب١-…»', () => {
    for (const plate of plates) {
      const r = findRouteToTarget(index, plate.nodeId, 'occ-shuwa-grill')
      expect(r, plate.id).toBeTruthy()
      expect(r.steps[0].text.ar, plate.id).toMatch(LRI_CODE)
      expect(r.steps[0].text.ar, plate.id).not.toMatch(/ب[١٢]-[٠-٩]/)
      expect(withoutLiftLetters(r.steps[0].text.ar), plate.id).not.toMatch(/[A-Za-z0-9]/)
    }
  })

  it('the scan list label and the you-are-here label agree with the floor paint', async () => {
    const { plateLabelInLevel } = await import('../src/ui/model.js')
    const plate = index.anchorById.get('A-B1-red-1')
    expect(plateLabelInLevel(index, plate, 'ar')).toContain('⁦B1-102⁩')
    expect(plateLabelInLevel(index, plate, 'ar')).not.toContain('ب١-١٠٢')
  })
})

describe('routes to a parking bay turn in at the bay mouth', () => {
  it('never walk past the bay along the aisle and double back (last turn under 100 degrees)', () => {
    let checked = 0
    for (const startId of ['A-G-ENT-S', 'A-L1-C3']) {
      const s = index.anchorById.get(startId).nodeId
      for (const bay of index.bayById.values()) {
        const r = findRouteToTarget(index, s, bay.id, { stepFree: true })
        expect(r, `${startId} -> ${bay.id}`).toBeTruthy()
        const P = r.points.map((p) => [p.x, p.y])
        const k = P.length - 1
        const hin = bearing(P[k - 2], P[k - 1])
        const hout = bearing(P[k - 1], P[k])
        if (hin == null || hout == null) continue
        expect(Math.abs(signedDelta(hin, hout)), `${startId} -> ${bay.id}`).toBeLessThanOrEqual(100)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(500)
  })
})
