import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { indexVenue } from '../src/data/venue.js'
import { findRouteToTarget } from '../src/routing/route.js'
import { buildSimPlan, createSimulator, simStateAt, SIM_SPEEDS } from '../src/sim/simulator.js'

const VENUE_PATH = fileURLToPath(new URL('../public/venues/demo-muscat/venue.json', import.meta.url))
const index = indexVenue(JSON.parse(readFileSync(VENUE_PATH, 'utf8')))
const START = index.anchorById.get(index.venue.meta.defaultStartAnchorId).nodeId

// South entrance (G) -> Muttrah Kitchen (L1 food court): walk + up escalator + walk.
const escalatorRoute = findRouteToTarget(index, START, 'occ-muttrah-kitchen')
// Same trip step-free: Lift A.
const liftRoute = findRouteToTarget(index, START, 'occ-muttrah-kitchen', { stepFree: true })
// Food court (L1) -> a bay on B2, step-free (lift crosses three floors).
const carRoute = findRouteToTarget(index, index.anchorById.get('A-L1-C3').nodeId, 'bay-B2-028', { stepFree: true })
// Lift A lobby on B2 -> Qalam Books (G): Stairs 1 up two floors (two stairs edges B2 -> B1 -> G, one ride).
const stairsRoute = findRouteToTarget(index, index.anchorById.get('A-B2-LA').nodeId, 'occ-qalam-books')

/** Number of connector rides (consecutive edges of one connector are one ride). */
function rideCount(route) {
  let n = 0
  route.edges.forEach((e, i) => {
    if (!CONNECTORS_LIST.includes(e.kind)) return
    const prev = route.edges[i - 1]
    if (prev && prev.kind === e.kind && prev.connectorId === e.connectorId) return
    n++
  })
  return n
}
const CONNECTORS_LIST = ['escalator', 'lift', 'stairs']

const CONNECTORS = new Set(['escalator', 'lift', 'stairs'])

/** Walk a whole route with fixed ticks and record every state. */
function walk(route, { dt = 0.1, speed = 1 } = {}) {
  const sim = createSimulator({ route, speedMultiplier: speed, index })
  const states = [sim.getState()]
  for (let i = 0; i < 100000 && !states[states.length - 1].done; i++) states.push(sim.tick(dt))
  sim.dispose()
  return states
}

describe('test routes', () => {
  it('exist and use the connectors the tests rely on', () => {
    expect(escalatorRoute).toBeTruthy()
    expect(liftRoute).toBeTruthy()
    expect(carRoute).toBeTruthy()
    expect(escalatorRoute.edges.some((e) => e.kind === 'escalator')).toBe(true)
    expect(liftRoute.edges.some((e) => e.kind === 'lift')).toBe(true)
    expect(liftRoute.edges.some((e) => e.kind === 'escalator')).toBe(false)
    expect(carRoute.levelIds[0]).toBe('L1')
    expect(carRoute.levelIds[carRoute.levelIds.length - 1]).toBe('B2')
  })
})

describe('createSimulator: a full walk', () => {
  for (const [name, route] of [
    ['escalator route', () => escalatorRoute],
    ['lift route', () => liftRoute],
    ['car route (B2)', () => carRoute],
  ]) {
    it(`reaches done=true with distanceDoneM ~ lengthM (${name})`, () => {
      const r = route()
      const states = walk(r)
      const last = states[states.length - 1]
      expect(last.done).toBe(true)
      expect(last.distanceDoneM).toBeCloseTo(r.lengthM, 1)
      expect(last.distanceTotalM).toBeCloseTo(r.lengthM, 1)
      const end = r.points[r.points.length - 1]
      expect(last.levelId).toBe(end.levelId)
      expect(last.x).toBeCloseTo(end.x, 6)
      expect(last.y).toBeCloseTo(end.y, 6)
      expect(last.stepIndex).toBe(r.steps.length - 1)
      expect(last.onConnector).toBe(false)
      // distance never goes backwards and never overshoots
      for (let i = 1; i < states.length; i++) {
        expect(states[i].distanceDoneM).toBeGreaterThanOrEqual(states[i - 1].distanceDoneM - 1e-9)
        expect(states[i].distanceDoneM).toBeLessThanOrEqual(r.lengthM + 0.01)
      }
    })

    it(`advances stepIndex monotonically through every step (${name})`, () => {
      const r = route()
      const states = walk(r)
      expect(states[0].stepIndex).toBe(0)
      const seen = new Set()
      for (let i = 1; i < states.length; i++) {
        expect(states[i].stepIndex).toBeGreaterThanOrEqual(states[i - 1].stepIndex)
        seen.add(states[i].stepIndex)
      }
      // every step that covers some walking time is shown at least once
      for (const step of r.steps) if (step.to > step.from) expect(seen.has(step.index), `step ${step.index}`).toBe(true)
    })

    it(`changes level only when stepping off a connector ride (${name})`, () => {
      const r = route()
      const states = walk(r, { dt: 0.05 })
      let changes = 0
      for (let i = 1; i < states.length; i++) {
        if (states[i].levelId === states[i - 1].levelId) continue
        changes++
        // the previous state was riding, and the new level is where that ride ends
        expect(states[i - 1].onConnector, `level change at edge ${states[i].edgeIndex}`).toBe(true)
        expect(states[i].onConnector).toBe(false)
        expect(states[i].levelId).toBe(states[i - 1].rideToLevelId)
      }
      expect(changes).toBe(rideCount(r))
      // walking states always stand on the edge's own level; riding states on the boarding level
      for (const s of states) {
        if (s.done) continue
        if (!s.onConnector) expect(s.levelId).toBe(r.points[s.edgeIndex].levelId)
      }
    })
  }

  it('walks at 1.2 m/s and rides the escalator at 0.5 m/s', () => {
    const r = escalatorRoute
    const plan = buildSimPlan(r, { index })
    const esc = plan.segments.find((s) => s.kind === 'escalator')
    expect(esc.rideS).toBeCloseTo(esc.geomM / SIM_SPEEDS.escalatorMps, 6)
    const firstWalk = plan.segments.find((s) => s.kind === 'walk' && s.geomM > 1)
    expect(firstWalk.rideS).toBeCloseTo(firstWalk.geomM / SIM_SPEEDS.walkMps, 6)
    // halfway up the escalator the walker is between the two levels and flagged on the connector
    const mid = simStateAt(plan, esc.t0 + esc.durS / 2)
    expect(mid.onConnector).toBe(true)
    expect(mid.connectorType).toBe('escalator')
    expect(mid.elevation).toBeGreaterThan(0)
    expect(mid.elevation).toBeLessThan(5.5)
  })

  it('waits 4 s at the lift door, then rides at 4 s per floor', () => {
    const plan = buildSimPlan(carRoute, { index })
    const lift = plan.segments.find((s) => s.kind === 'lift')
    expect(lift.waitS).toBe(SIM_SPEEDS.liftWaitS)
    const floors = Math.abs(index.levelById.get(lift.a.levelId).ordinal - index.levelById.get(lift.b.levelId).ordinal)
    expect(lift.rideS).toBe(SIM_SPEEDS.liftPerFloorS * floors)
    const waiting = simStateAt(plan, lift.t0 + 1)
    expect(waiting.phase).toBe('wait')
    expect(waiting.onConnector).toBe(true)
    expect(waiting.levelId).toBe(lift.a.levelId)
    expect(waiting.elevation).toBeCloseTo(index.levelById.get(lift.a.levelId).elevation, 6)
    const riding = simStateAt(plan, lift.t0 + lift.waitS + lift.rideS * 0.75)
    expect(riding.phase).toBe('ride')
    // still "on" the boarding level until the doors open on the exit level
    expect(riding.levelId).toBe(lift.a.levelId)
    expect(riding.rideToLevelId).toBe(lift.b.levelId)
    expect(riding.rideProgress).toBeGreaterThan(0.5)
    expect(riding.rideProgress).toBeLessThan(1)
    expect(riding.elevation).toBeLessThan(index.levelById.get(lift.a.levelId).elevation)
    const off = simStateAt(plan, lift.t0 + lift.durS + 0.05)
    expect(off.onConnector).toBe(false)
    expect(off.levelId).toBe(lift.b.levelId)
  })

  it('rides stairs over two floors as one ride: B2 until stepping off on G, never B1', () => {
    expect(stairsRoute).toBeTruthy()
    const stairs = stairsRoute.edges.filter((e) => e.kind === 'stairs')
    expect(stairs.length).toBeGreaterThanOrEqual(2)
    const connectorStep = stairsRoute.steps.find((st) => st.kind === 'connector')
    expect(connectorStep.connector).toMatchObject({ type: 'stairs', toLevelId: 'G' })
    const states = walk(stairsRoute, { dt: 0.05 })
    // levels reported from the stairs step until the step after it: B2, then G (never B1)
    const levels = []
    for (const st of states) {
      if (st.stepIndex < connectorStep.index || st.stepIndex > connectorStep.index + 1) continue
      if (levels[levels.length - 1] !== st.levelId) levels.push(st.levelId)
    }
    expect(levels).toEqual(['B2', 'G'])
    expect(states.some((st) => st.levelId === 'B1')).toBe(false)
    // the elevation still passes through B1's height on the way up
    const mid = states.find((st) => st.onConnector && st.elevation > -6 && st.elevation < -5)
    expect(mid?.levelId).toBe('B2')
    expect(mid?.rideToLevelId).toBe('G')
  })

  it('waits only once for a lift that crosses several floors', () => {
    const plan = buildSimPlan(carRoute, { index })
    const lifts = plan.segments.filter((s) => s.kind === 'lift')
    expect(lifts.filter((s) => s.waitS > 0)).toHaveLength(1)
  })
})

describe('createSimulator: controls', () => {
  it('speed multiplier scales simulated time', () => {
    const one = createSimulator({ route: escalatorRoute, index })
    const four = createSimulator({ route: escalatorRoute, speedMultiplier: 4, index })
    const a = one.tick(2)
    const b = four.tick(2)
    expect(a.elapsedS).toBeCloseTo(2, 6)
    expect(b.elapsedS).toBeCloseTo(8, 6)
    expect(b.distanceDoneM).toBeCloseTo(a.distanceDoneM * 4, 3)
    one.setSpeed(2)
    expect(one.getSpeed()).toBe(2)
    expect(one.tick(1).elapsedS).toBeCloseTo(4, 6)
    one.setSpeed(-3)
    expect(one.getSpeed()).toBe(1)
    // a 4x walk finishes in a quarter of the ticks
    const n1 = walk(escalatorRoute, { dt: 0.5 }).length
    const n4 = walk(escalatorRoute, { dt: 0.5, speed: 4 }).length
    expect(n4).toBeLessThan(n1 / 3)
    one.dispose()
    four.dispose()
  })

  it('seekStep puts the walker at the start of that step and keeps the step index', () => {
    const r = escalatorRoute
    const sim = createSimulator({ route: r, index })
    for (const step of r.steps) {
      const s = sim.seekStep(step.index)
      expect(s.stepIndex).toBe(step.index)
      const p = r.points[step.from]
      expect(s.x).toBeCloseTo(p.x, 6)
      expect(s.y).toBeCloseTo(p.y, 6)
      expect(s.done).toBe(false)
      // moving on from there stays in that step (or later), never earlier
      expect(sim.tick(0.2).stepIndex).toBeGreaterThanOrEqual(step.index)
    }
    // seeking back works too
    const back = sim.seekStep(1)
    expect(back.stepIndex).toBe(1)
    expect(sim.seekStep(0).elapsedS).toBe(0)
    expect(sim.seekStep(99).stepIndex).toBe(r.steps.length - 1)
    sim.dispose()
  })

  it('seekTime jumps to a simulated time; onChange reports every update', () => {
    const sim = createSimulator({ route: escalatorRoute, index })
    const seen = []
    const off = sim.onChange((s) => seen.push(s.elapsedS))
    const s = sim.seekTime(25)
    expect(s.elapsedS).toBe(25)
    expect(s.distanceDoneM).toBeCloseTo(25 * SIM_SPEEDS.walkMps, 1)
    expect(s.levelId).toBe('G')
    sim.tick(1)
    off()
    sim.tick(1)
    expect(seen).toEqual([25, 26])
    expect(sim.seekTime(1e9).done).toBe(true)
    sim.dispose()
  })

  it('play() runs on its own clock until done; pause() stops it', async () => {
    const short = findRouteToTarget(index, START, 'am-G-taxi')
    expect(short).toBeTruthy()
    const sim = createSimulator({ route: short, speedMultiplier: 50, index })
    let last = null
    let playingWhenDone = null
    sim.onChange((s) => {
      last = s
      if (s.done && playingWhenDone === null) playingWhenDone = sim.isPlaying()
    })
    sim.play()
    expect(sim.isPlaying()).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 60))
    sim.pause()
    expect(sim.isPlaying()).toBe(false)
    const paused = last.elapsedS
    expect(paused).toBeGreaterThan(0)
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(last.elapsedS).toBe(paused)
    sim.play()
    const deadline = Date.now() + 3000
    while (!last.done && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20))
    expect(last.done).toBe(true)
    expect(sim.isPlaying()).toBe(false)
    // the update that reports done already reports "not playing" (the UI moves on to the arrival screen)
    expect(playingWhenDone).toBe(false)
    sim.dispose()
  })

  it('heading follows the walking direction', () => {
    const plan = buildSimPlan(escalatorRoute, { index })
    const seg = plan.segments.find((s) => s.kind === 'walk' && s.geomM > 5)
    const s = simStateAt(plan, seg.t0 + seg.durS * 0.8)
    const want = (Math.atan2(seg.b.x - seg.a.x, seg.b.y - seg.a.y) * 180) / Math.PI
    expect(Math.abs((((s.headingDeg - want) % 360) + 540) % 360 - 180)).toBeLessThan(0.01)
  })
})
