/**
 * Walk simulator (CONTRACT.md section 3, `src/sim/`). It moves a pretend shopper along a Route so the
 * 3D map, step card and floor prompts can be demonstrated without live positioning.
 * The UI must label it SIMULATION: it is never the user's real position.
 *
 * Two layers:
 * - Pure: `buildSimPlan(route, options)` turns a Route into a timeline of segments, and
 *   `simStateAt(plan, elapsedS)` gives the SimState at any simulated time. No DOM, no clocks.
 * - Driver: `createSimulator({ route, speedMultiplier })` keeps the simulated clock. `tick(dt)` advances it
 *   (pure and testable: no timers involved); `play()` runs `tick` from requestAnimationFrame (or a 16 ms
 *   timer outside the browser) until the walk is done or `pause()` is called.
 *
 * Motion model (simulated seconds, before the speed multiplier):
 * - walk / parking_walk: 1.2 m/s along the straight line between the two route points
 * - escalator: 0.5 m/s horizontally while the elevation interpolates from one level to the other
 * - lift: a 4 s wait at the door (the real 45 s wait compressed for the demo), then 4 s per floor
 * - stairs: 15 s per floor while position and elevation interpolate
 *
 * A ride over several floors (lift B2 -> G, stairs B2 -> G) is several connector edges but ONE ride: one lift
 * wait, and `levelId` stays on the boarding level until the ride ends, then becomes the exit level. So the
 * app never announces an intermediate floor the shopper only passes through.
 *
 * `elapsedS` is simulated time, so `simT=25` always means "25 s into the walk at 1x".
 */

export const SIM_SPEEDS = Object.freeze({
  walkMps: 1.2,
  escalatorMps: 0.5,
  liftWaitS: 4,
  liftPerFloorS: 4,
  stairsPerFloorS: 15,
})

/** Metres at the start of a walking segment over which the heading turns from the previous direction. */
const TURN_BLEND_M = 1.2

const CONNECTOR_KINDS = new Set(['escalator', 'lift', 'stairs'])

/**
 * @typedef {object} SimState
 * @property {string} levelId
 * @property {number} x                venue metres (east)
 * @property {number} y                venue metres (north)
 * @property {number} headingDeg       compass heading of travel, 0 = north, clockwise
 * @property {number} distanceDoneM    sum of edge.lengthM covered so far
 * @property {number} distanceTotalM   sum of edge.lengthM of the whole route
 * @property {number} stepIndex        index into route.steps
 * @property {boolean} onConnector     true while waiting for or riding a lift, escalator or stairs
 * @property {boolean} done
 * @property {number} elapsedS         simulated seconds since the start
 * @property {number} totalS           extra: simulated seconds for the whole walk
 * @property {number|null} elevation   extra: true-scale height in metres (null when levels are unknown)
 * @property {'escalator'|'lift'|'stairs'|null} connectorType  extra
 * @property {string|null} connectorId extra
 * @property {'walk'|'wait'|'ride'|'done'} phase  extra
 * @property {number} edgeIndex        extra: edge being travelled (edges.length when done)
 * @property {number} progress         extra: elapsedS / totalS (0..1)
 * @property {number} rideProgress     extra: 0..1 through the current connector ride, wait included (0 when walking)
 * @property {string|null} rideToLevelId extra: where the current ride ends (null when walking)
 */

function bearingDeg(ax, ay, bx, by) {
  const d = (Math.atan2(bx - ax, by - ay) * 180) / Math.PI
  return (d + 360) % 360
}

function lerpAngle(a, b, t) {
  const delta = ((b - a + 540) % 360) - 180
  return (a + delta * t + 360) % 360
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * Build the timeline for a route.
 * @param {object} route CONTRACT Route ({ points, edges, steps, lengthM })
 * @param {{ index?: object }} [options] VenueIndex, used for level elevations and lift floor counts
 */
export function buildSimPlan(route, options = {}) {
  if (!route || !Array.isArray(route.points) || route.points.length === 0) {
    throw new TypeError('buildSimPlan: expected a route with at least one point')
  }
  const points = route.points
  const edges = Array.isArray(route.edges) ? route.edges : []
  if (edges.length !== points.length - 1) throw new Error('buildSimPlan: route.edges must join consecutive points')
  const index = options.index ?? null
  const levelInfo = (levelId) => index?.levelById?.get(levelId) ?? null
  const elevationOf = (levelId) => {
    const L = levelInfo(levelId)
    return L && Number.isFinite(L.elevation) ? L.elevation : null
  }

  const segments = []
  const pointT = [0]
  let t = 0
  let d = 0
  let lastHeading = null
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i]
    const a = points[i]
    const b = points[i + 1]
    const geomM = Math.hypot(b.x - a.x, b.y - a.y)
    const lengthM = Number.isFinite(edge.lengthM) ? Math.max(0, edge.lengthM) : geomM
    const kind = CONNECTOR_KINDS.has(edge.kind) ? edge.kind : 'walk'
    const la = levelInfo(a.levelId)
    const lb = levelInfo(b.levelId)
    const floors = la && lb ? Math.max(1, Math.abs(la.ordinal - lb.ordinal)) : 1
    const connectorId = kind === 'walk' ? null : (edge.connectorId ?? null)
    const prev = segments[segments.length - 1]
    // the next edge of the same lift / stairs / escalator continues the ride (one wait, one announcement)
    const continuesRide = Boolean(prev && kind !== 'walk' && prev.kind === kind && prev.connectorId === connectorId)
    let waitS = 0
    let rideS
    if (kind === 'walk') rideS = (geomM > 0 ? geomM : lengthM) / SIM_SPEEDS.walkMps
    else if (kind === 'escalator') rideS = (geomM > 0 ? geomM : lengthM) / SIM_SPEEDS.escalatorMps
    else if (kind === 'lift') {
      waitS = continuesRide ? 0 : SIM_SPEEDS.liftWaitS
      rideS = SIM_SPEEDS.liftPerFloorS * floors
    } else rideS = SIM_SPEEDS.stairsPerFloorS * floors
    const heading = geomM > 0.05 ? bearingDeg(a.x, a.y, b.x, b.y) : null
    segments.push({
      edgeIndex: i,
      kind,
      connectorId,
      continuesRide,
      a,
      b,
      geomM,
      lengthM,
      waitS,
      rideS,
      durS: waitS + rideS,
      t0: t,
      d0: d,
      heading,
      prevHeading: lastHeading,
      elevA: elevationOf(a.levelId),
      elevB: elevationOf(b.levelId),
    })
    t += waitS + rideS
    d += lengthM
    pointT.push(t)
    if (heading != null) lastHeading = heading
  }

  // Rides: consecutive connector segments of one connector share the boarding / exit level and a clock.
  for (let i = 0; i < segments.length; i++) {
    const s0 = segments[i]
    if (s0.kind === 'walk' || s0.continuesRide) continue
    let j = i
    while (j + 1 < segments.length && segments[j + 1].continuesRide) j++
    const rideT0 = s0.t0
    const rideDur = segments[j].t0 + segments[j].durS - rideT0
    for (let k = i; k <= j; k++) {
      segments[k].rideFromLevelId = s0.a.levelId
      segments[k].rideToLevelId = segments[j].b.levelId
      segments[k].rideT0 = rideT0
      segments[k].rideDur = rideDur
    }
    i = j
  }

  // Initial heading: the first direction of travel (so the walker faces the way it will go).
  const firstHeading = segments.find((s) => s.heading != null)?.heading ?? 0
  for (const s of segments) if (s.prevHeading == null) s.prevHeading = s.heading ?? firstHeading

  const steps = Array.isArray(route.steps) ? route.steps : []
  const stepStartT = steps.map((s) => pointT[clamp(s.from | 0, 0, points.length - 1)] ?? 0)

  return {
    points,
    segments,
    pointT,
    stepStartT,
    stepCount: steps.length,
    totalS: t,
    totalM: d,
    firstHeading,
    endHeading: lastHeading ?? firstHeading,
    startElevation: elevationOf(points[0].levelId),
    endElevation: elevationOf(points[points.length - 1].levelId),
  }
}

/**
 * Index of the step being walked at time t: the last step whose start point has been passed
 * (strictly), or 0 before moving. Done -> the last step.
 */
export function stepIndexAt(plan, elapsedS) {
  if (plan.stepCount === 0) return 0
  if (elapsedS >= plan.totalS) return plan.stepCount - 1
  let k = 0
  for (let i = 0; i < plan.stepStartT.length; i++) if (plan.stepStartT[i] < elapsedS) k = i
  return k
}

/**
 * Pure state at a simulated time.
 * @param {ReturnType<typeof buildSimPlan>} plan
 * @param {number} elapsedS
 * @param {number} [minStep] lowest step index to report (set by seekStep)
 * @returns {SimState}
 */
export function simStateAt(plan, elapsedS, minStep = 0) {
  const t = clamp(Number.isFinite(elapsedS) ? elapsedS : 0, 0, plan.totalS)
  const stepIndex = Math.max(stepIndexAt(plan, t), Math.min(minStep, Math.max(0, plan.stepCount - 1)))
  const base = {
    distanceTotalM: plan.totalM,
    elapsedS: t,
    totalS: plan.totalS,
    stepIndex,
    progress: plan.totalS > 0 ? t / plan.totalS : 1,
  }
  const segs = plan.segments
  if (segs.length === 0 || t >= plan.totalS) {
    const last = plan.points[plan.points.length - 1]
    return {
      ...base,
      levelId: last.levelId,
      x: last.x,
      y: last.y,
      headingDeg: plan.endHeading,
      distanceDoneM: plan.totalM,
      onConnector: false,
      done: true,
      elevation: plan.endElevation,
      connectorType: null,
      connectorId: null,
      phase: 'done',
      edgeIndex: segs.length,
      rideProgress: 0,
      rideToLevelId: null,
    }
  }
  // Binary search for the segment that contains t (t0 <= t < t0 + durS); zero-length segments are skipped.
  let lo = 0
  let hi = segs.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (segs[mid].t0 <= t) lo = mid
    else hi = mid - 1
  }
  let s = segs[lo]
  while (s.durS <= 0 && lo < segs.length - 1) s = segs[++lo]
  const local = t - s.t0
  const isConnector = s.kind !== 'walk'
  let phase = 'walk'
  let f // motion fraction 0..1
  if (s.kind === 'lift' && local < s.waitS) {
    phase = 'wait'
    f = 0
  } else {
    phase = isConnector ? 'ride' : 'walk'
    f = s.rideS > 0 ? clamp((local - s.waitS) / s.rideS, 0, 1) : 1
  }
  const x = s.a.x + (s.b.x - s.a.x) * f
  const y = s.a.y + (s.b.y - s.a.y) * f
  // on a ride, the shopper is still "on" the boarding level until stepping off at the exit level
  const levelId = isConnector ? (s.rideFromLevelId ?? s.a.levelId) : s.a.levelId
  const rideProgress = isConnector && s.rideDur > 0 ? clamp((t - s.rideT0) / s.rideDur, 0, 1) : 0
  let headingDeg = s.heading ?? s.prevHeading
  if (s.kind === 'walk' && s.heading != null && s.prevHeading != null && s.geomM > 0) {
    const walked = f * s.geomM
    if (walked < TURN_BLEND_M) headingDeg = lerpAngle(s.prevHeading, s.heading, walked / TURN_BLEND_M)
  }
  let elevation = null
  if (s.elevA != null && s.elevB != null) elevation = s.elevA + (s.elevB - s.elevA) * f
  else if (s.elevA != null) elevation = s.elevA
  return {
    ...base,
    levelId,
    x,
    y,
    headingDeg,
    distanceDoneM: s.d0 + s.lengthM * f,
    onConnector: isConnector,
    done: false,
    elevation,
    connectorType: isConnector ? s.kind : null,
    connectorId: s.connectorId,
    phase,
    edgeIndex: s.edgeIndex,
    rideProgress,
    rideToLevelId: isConnector ? (s.rideToLevelId ?? s.b.levelId) : null,
  }
}

const raf =
  typeof globalThis.requestAnimationFrame === 'function'
    ? (cb) => globalThis.requestAnimationFrame(cb)
    : (cb) => setTimeout(() => cb(typeof performance !== 'undefined' ? performance.now() : Date.now()), 16)
const caf =
  typeof globalThis.cancelAnimationFrame === 'function'
    ? (id) => globalThis.cancelAnimationFrame(id)
    : (id) => clearTimeout(id)

/**
 * Create a simulator for a route.
 * @param {{ route: object, speedMultiplier?: number, index?: object }} options
 *   `index` (VenueIndex, optional) gives level elevations and lift floor counts.
 */
export function createSimulator({ route, speedMultiplier = 1, index = null } = {}) {
  const plan = buildSimPlan(route, { index })
  let speed = validSpeed(speedMultiplier)
  let elapsed = 0
  let minStep = 0
  let playing = false
  let disposed = false
  let frameId = null
  let lastNow = 0
  const listeners = new Set()
  let state = simStateAt(plan, 0)

  function validSpeed(m) {
    const v = Number(m)
    return Number.isFinite(v) && v > 0 ? v : 1
  }

  function emit() {
    for (const cb of listeners) {
      try {
        cb(state)
      } catch (err) {
        console.error(err)
      }
    }
  }

  function update() {
    state = simStateAt(plan, elapsed, minStep)
    if (state.stepIndex > minStep) minStep = state.stepIndex
    // a finished walk stops playing before listeners hear about it (so they see isPlaying() === false)
    if (state.done && playing) {
      playing = false
      stopLoop()
    }
    emit()
    return state
  }

  function stopLoop() {
    if (frameId != null) caf(frameId)
    frameId = null
  }

  function frame(now) {
    frameId = null
    if (!playing || disposed) return
    // up to 0.25 s per frame, so slow phones (or a software GPU) still walk at the chosen speed
    const dt = lastNow ? Math.min(0.25, Math.max(0, (now - lastNow) / 1000)) : 0
    lastNow = now
    sim.tick(dt)
    if (playing && !state.done) frameId = raf(frame)
  }

  const sim = {
    plan,

    /**
     * Advance the simulated clock by dt real seconds (times the speed multiplier).
     * @param {number} dtSeconds
     * @returns {SimState}
     */
    tick(dtSeconds) {
      if (disposed) return state
      const dt = Number.isFinite(dtSeconds) ? Math.max(0, dtSeconds) : 0
      elapsed = Math.min(plan.totalS, elapsed + dt * speed)
      return update()
    },

    /** Start (or resume) real-time playback. Playing a finished walk starts it again. */
    play() {
      if (disposed || playing) return
      if (state.done) {
        elapsed = 0
        minStep = 0
        update()
      }
      playing = true
      lastNow = 0
      frameId = raf(frame)
      emit()
    },

    pause() {
      if (!playing) return
      playing = false
      stopLoop()
      emit()
    },

    /** @param {number} mult e.g. 1, 2 or 4 */
    setSpeed(mult) {
      speed = validSpeed(mult)
    },

    getSpeed() {
      return speed
    },

    isPlaying() {
      return playing
    },

    /**
     * Jump to the start of a step (the walker stands at the step's first point).
     * @param {number} i
     */
    seekStep(i) {
      if (disposed) return state
      const k = clamp(i | 0, 0, Math.max(0, plan.stepCount - 1))
      elapsed = plan.stepStartT[k] ?? 0
      minStep = k
      return update()
    },

    /**
     * Jump to a simulated time (seconds at 1x since the start).
     * @param {number} seconds
     */
    seekTime(seconds) {
      if (disposed) return state
      elapsed = clamp(Number.isFinite(seconds) ? seconds : 0, 0, plan.totalS)
      minStep = 0
      return update()
    },

    /** @returns {SimState} */
    getState() {
      return state
    },

    /**
     * Subscribe to state changes. Returns an unsubscribe function.
     * @param {(s: SimState) => void} cb
     */
    onChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },

    dispose() {
      playing = false
      stopLoop()
      listeners.clear()
      disposed = true
    },
  }
  return sim
}
