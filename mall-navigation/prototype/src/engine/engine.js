/**
 * Dallni 3D map engine (CONTRACT.md §3 "src/engine/"). Plain three.js r186 + troika-three-text,
 * no React. One renderer and one canvas for the whole app (singleton `engine`); screens attach it
 * with mount()/unmount() and send commands.
 *
 * Render-on-demand: a frame is drawn only when the controls move (incl. damping), a camera flight
 * or follow animation runs, text finishes typesetting, or requestRender() is called. Idle = 0 frames.
 *
 * Art direction: PLAN.md §19.2 "architect's model" - unlit, vertex-coloured, flat-shaded geometry,
 * real wall-top strips, no realtime shadows, no bloom.
 */
import { DoubleSide, Group, MOUSE, MathUtils, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, TOUCH, Vector3, WebGLRenderer } from 'three'
// OrbitControls set up exactly like three's MapControls (one-finger pan, two-finger pinch-zoom + rotate, panning on
// the ground plane), without MapControls' mouse ray-casting: one class (and Raycaster) fewer in the engine chunk
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { configureFonts } from './fonts.js'
import { ColorRegistry, THEMES } from './palette.js'
import { applyTheme, pointInPolygon, setRise } from './geometry.js'
import { buildEscalator, buildLiftColumn, buildParkingLevel, buildRetailLevel } from './levels.js'
import { buildBaysMesh } from './bays.js'
import { createIconAtlas } from './icons.js'
import { OverlayLayer, buildPinMesh } from './overlay.js'
import { MIN_TEXT_PX, SignLayer } from './signs.js'
import { RouteLayer } from './route.js'
import { MarkerLayer, disposeTree } from './markers.js'
import { applyPose, boxCenter, easeStandard, fitDistance, lerpPose, readPose } from './camera.js'

/** Vertical distance between levels in stack view (metres). */
export const STACK_GAP_M = 18
/** Gap between the levels of a multi-level route in stack view (PLAN.md 19.2: the two floors 12 m apart). */
export const STACK_FOCUS_GAP_M = 12

const VIEW_DEFAULTS = {
  stack: { tiltDeg: 32, fov: 30 },
  floor: { tiltDeg: 52, fov: 34 },
  top: { tiltDeg: 89.5, fov: 18 },
}
const TILT_MIN = 20
const TILT_MAX = 75
const PICK_RADIUS_PX = 44
const BAY_CODES_MAX_DIST = 25
/** The destination ring stands this far in front of its shop sign (metres). */
const DEST_FRONT_M = 2.4
/** ...and this far on arrival (the ring alone, at the doorstep). */
const DEST_ARRIVED_FRONT_M = 1.3
/** The car marker stands this far toward the back of its bay, so the painted code at the bay mouth reads. */
const CAR_BACK_M = 0.75
/** Margin (CSS px) kept between a key map point and any control or screen edge after a camera move. */
const UI_CLEAR_PX = 16
/** Screen box (CSS px around the point: left, top, right, bottom) of a key point with a pin standing on it. */
const PIN_BOX = [24, 50, 24, 12]
/** ...of a key point without a pin (a turn corner, the walker). */
const POINT_BOX = [18, 22, 18, 14]
const DEFAULT_SIZE = { width: 390, height: 844 }

/**
 * @typedef {object} EngineStats
 * @property {number} drawCalls
 * @property {number} triangles
 * @property {number} frameMs
 * @property {number} totalFramesRendered
 * @property {number} geometries
 * @property {number} textures
 */

/**
 * Create an engine instance. Most apps use the default singleton export `engine`.
 */
export function createEngine() {
  configureFonts()

  const S = {
    container: null,
    renderer: null,
    controls: null,
    mounted: false,
    resizeObserver: null,
    scene: new Scene(),
    camera: new PerspectiveCamera(VIEW_DEFAULTS.stack.fov, DEFAULT_SIZE.width / DEFAULT_SIZE.height, 1, 4000),
    index: null,
    registry: new ColorRegistry(),
    atlas: null,
    theme: /** @type {'sunlight'|'basement'} */ ('sunlight'),
    lang: /** @type {'en'|'ar'} */ ('en'),
    mode: /** @type {'stack'|'floor'|'top'} */ ('stack'),
    focusId: null,
    /** 0 = true scale (floor / 2D), 1 = exploded stack; animated during camera flights */
    blend: 1,
    /** levels shown in stack view (null = all): a multi-level route stacks only its own levels */
    stackLevels: null,
    /** stackLevels sorted by ordinal (low to high) */
    stackOrder: [],
    /** screen rectangles covered by UI (header, map controls, sheet): labels and pins keep out */
    obstacles: [],
    /** ids of what the shown route ends at (occupant, amenity, connector, anchor) */
    destRefs: new Set(),
    /** @type {Map<string, any>} */
    levels: new Map(),
    connectors: [],
    venueRoot: new Group(),
    overlay: new OverlayLayer(),
    route: new RouteLayer(),
    markers: new MarkerLayer(),
    themedGeometries: [],
    pickables: [],
    pickPolygons: [],
    flight: null,
    follow: false,
    activeStep: -1,
    walkerDist: 0,
    frames: 0,
    frameMs: 0,
    needsRender: false,
    rafId: 0,
    lastTick: 0,
    pickCbs: new Set(),
    renderCbs: new Set(),
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    userMoved: false,
    lastView: null,
    pointer: null,
    bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
    disposed: false,
    /** WebGL could not start: every command is a no-op (the app shows its fallback) */
    failed: false,
    /** text batches built before the renderer existed: typeset them once it does (no troika work without GL) */
    needsSync: false,
    /** QR plate pins to show (OverlayLayer.scanKinds), kept across venue changes */
    scanKinds: null,
    /** route trimmed under the arrival ring (metres) */
    trimEnd: 0,
    mats: null,
  }

  S.scene.add(S.venueRoot)
  S.scene.add(S.route.root)
  S.scene.add(S.overlay.batch)
  S.scene.matrixWorldAutoUpdate = true
  // Markers (you, car, destination, walker) are drawn in a second pass after the depth buffer is cleared,
  // so walls, gates, glass or the floors stacked above can never hide or tint them.
  S.markerScene = new Scene()
  S.markerScene.add(S.markers.root)

  const makeMaterials = () => ({
    opaque: new MeshBasicMaterial({ vertexColors: true }),
    roofs: new MeshBasicMaterial({ vertexColors: true }),
    glass: new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.38, depthWrite: false, side: DoubleSide }),
    decals: new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false }),
    ghost: new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false }),
    // stack view with a multi-floor route: the floors above the lowest one are see-through, so the route,
    // the car and the destination below them stay in sight
    fadeOpaque: new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false }),
    fadeGlass: new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.12, depthWrite: false, side: DoubleSide }),
    fadeDecals: new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.1, depthWrite: false }),
  })
  S.mats = makeMaterials()

  // text batches still typesetting (a Set, so batches of a replaced venue cannot skew the count)
  const pendingSync = new Set()
  const watchSync = (batch) => {
    batch.addEventListener('syncstart', () => {
      pendingSync.add(batch)
    })
    batch.addEventListener('synccomplete', () => {
      pendingSync.delete(batch)
      requestRender()
    })
  }
  watchSync(S.overlay.batch)

  // ------------------------------------------------------------------------------------------
  // size + helpers
  // ------------------------------------------------------------------------------------------

  function viewSize() {
    if (S.container) {
      const w = S.container.clientWidth
      const h = S.container.clientHeight
      if (w > 0 && h > 0) return { width: w, height: h }
    }
    // not mounted yet (the engine loads after the first screen and replays queued commands before MapView mounts
    // the canvas): the map layer fills the window, so frame for the window's size, not a default phone
    if (typeof window !== 'undefined' && window.innerWidth > 0 && window.innerHeight > 0) return { width: window.innerWidth, height: window.innerHeight }
    return DEFAULT_SIZE
  }

  function levelOf(id) {
    return S.levels.get(id) ?? null
  }

  /** Stack-view height of a level (world y at blend = 1). */
  function stackY(id) {
    const L = levelOf(id)
    if (!L) return 0
    if (S.stackLevels && S.stackLevels.has(id) && S.stackOrder.length) {
      const order = S.stackOrder
      let mean = 0
      for (const lid of order) mean += levelOf(lid).level.elevation
      mean /= order.length
      return mean + (order.indexOf(id) - (order.length - 1) / 2) * STACK_FOCUS_GAP_M
    }
    return L.level.elevation * (STACK_GAP_M / floorToFloor())
  }

  /** World y of a level floor for a stack blend (0 = true scale, 1 = stack). */
  function levelY(id, blend = S.blend) {
    const L = levelOf(id)
    if (!L) return 0
    const e = L.level.elevation
    return blend <= 0 ? e : e + (stackY(id) - e) * blend
  }

  /** World y for a true-scale elevation (metres), between the visible levels (lift and stairs rides). */
  function worldYForElevation(e) {
    const lv = [...S.levels.values()].filter((L) => S.mode !== 'stack' || isVisible(L.id)).map((L) => L.level).sort((a, b) => a.elevation - b.elevation)
    if (!lv.length) return e
    if (e <= lv[0].elevation) return levelY(lv[0].id) + (e - lv[0].elevation)
    const top = lv[lv.length - 1]
    if (e >= top.elevation) return levelY(top.id) + (e - top.elevation)
    for (let i = 1; i < lv.length; i++) {
      const a = lv[i - 1]
      const b = lv[i]
      if (e <= b.elevation) {
        const f = (e - a.elevation) / Math.max(1e-6, b.elevation - a.elevation)
        return levelY(a.id) + (levelY(b.id) - levelY(a.id)) * f
      }
    }
    return levelY(top.id)
  }

  function isVisible(id) {
    if (S.mode === 'stack') return S.stackLevels ? S.stackLevels.has(id) : S.levels.has(id)
    return id === S.focusId
  }

  function focusOrdinal() {
    return levelOf(S.focusId)?.level.ordinal ?? 0
  }

  function targetBlend(mode) {
    return mode === 'stack' ? 1 : 0
  }

  function floorToFloor() {
    const v = S.index?.venue?.meta?.floorToFloorM
    if (typeof v === 'number' && v > 0) return v
    const lv = S.index?.levels ?? []
    for (let i = 1; i < lv.length; i++) {
      const d = lv[i].elevation - lv[i - 1].elevation
      if (d > 0) return d
    }
    return 5.5
  }

  const _proj = new Vector3()
  const _dir = new Vector3()
  function projectWorld(p) {
    const { width, height } = viewSize()
    _proj.copy(p).applyMatrix4(S.camera.matrixWorldInverse)
    if (-_proj.z <= 0.05) return null
    _proj.applyMatrix4(S.camera.projectionMatrix)
    return { sx: (_proj.x * 0.5 + 0.5) * width, sy: (1 - (_proj.y * 0.5 + 0.5)) * height }
  }

  function pxPerMeterAt(p) {
    const { height } = viewSize()
    _proj.copy(p).applyMatrix4(S.camera.matrixWorldInverse)
    const depth = Math.max(0.1, -_proj.z)
    return height / (2 * depth * Math.tan(MathUtils.degToRad(S.camera.fov) / 2))
  }

  // ------------------------------------------------------------------------------------------
  // render loop
  // ------------------------------------------------------------------------------------------

  function requestRender() {
    S.needsRender = true
    schedule()
  }

  function schedule() {
    if (S.rafId || !S.mounted || !S.renderer) return
    S.rafId = requestAnimationFrame(tick)
  }

  function tick(now) {
    S.rafId = 0
    if (!S.mounted) return
    const dt = S.lastTick ? Math.min(0.1, (now - S.lastTick) / 1000) : 1 / 60
    S.lastTick = now
    let animating = false
    const wasFlying = !!S.flight
    if (S.flight) {
      animating = stepFlight(now)
    } else if (S.controls) {
      if (S.controls.update()) animating = true
      if (clampTarget()) animating = true
    }
    if (stepFollow(dt)) animating = true
    if (S.needsRender || animating || wasFlying) render()
    if (animating) schedule()
    else if (!S.rafId) S.lastTick = 0
  }

  function updateClip() {
    const cam = S.camera
    const target = S.controls ? S.controls.target : S.flightTarget ?? new Vector3()
    const dist = cam.position.distanceTo(target)
    const near = MathUtils.clamp(dist * 0.035, 0.2, 40)
    const far = dist * 4 + 900
    if (Math.abs(cam.near - near) > 1e-3 || Math.abs(cam.far - far) > 1e-2) {
      cam.near = near
      cam.far = far
    }
    applyViewOffset()
    cam.updateProjectionMatrix()
  }

  function applyViewOffset() {
    setOffsetOn(S.camera, padFor(S.blend))
  }

  function setOffsetOn(cam, p) {
    const { width, height } = viewSize()
    const ox = -(p.left - p.right) / 2
    const oy = -(p.top - p.bottom) / 2
    cam.aspect = width / height
    if (Math.abs(ox) > 0.5 || Math.abs(oy) > 0.5) cam.setViewOffset(width, height, ox, oy, width, height)
    else cam.clearViewOffset()
  }

  /**
   * Screen space taken by UI for a stack blend. In the stacked Overview the reading-start side also keeps room
   * for the column of level names, so the fit moves the building away from it (the names never cover shops).
   */
  function padFor(blend = S.blend) {
    const p = S.padding
    if (blend <= 0.001) return p
    const col = S.overlay.levelColumnWidth(S.lang) * Math.min(1, blend)
    return S.lang === 'ar' ? { ...p, right: p.right + col } : { ...p, left: p.left + col }
  }

  // ------------------------------------------------------------------------------------------
  // keeping key points clear of the UI
  // ------------------------------------------------------------------------------------------

  const _probe = new PerspectiveCamera(30, 1, 1, 4000)
  const _pv = new Vector3()
  const _ro = new Vector3()
  const _rd = new Vector3()

  /** Put the probe camera at a pose that is not applied yet (same lens and padding as the real one). */
  function probeAt(pose) {
    const cam = _probe
    cam.fov = pose.fov ?? S.camera.fov
    cam.near = MathUtils.clamp(pose.distance * 0.035, 0.2, 40)
    cam.far = pose.distance * 4 + 900
    setOffsetOn(cam, padFor(targetBlend(S.mode)))
    cam.updateProjectionMatrix()
    applyPose(cam, pose)
    return cam
  }

  function projectWith(cam, p) {
    const { width, height } = viewSize()
    _pv.copy(p).applyMatrix4(cam.matrixWorldInverse)
    if (-_pv.z <= 0.05) return null
    _pv.applyMatrix4(cam.projectionMatrix)
    return { sx: (_pv.x * 0.5 + 0.5) * width, sy: (1 - (_pv.y * 0.5 + 0.5)) * height }
  }

  /** Where a screen point (container CSS px) meets the horizontal plane at world height y, or null. */
  function groundAt(cam, sx, sy, y) {
    const { width, height } = viewSize()
    _ro.setFromMatrixPosition(cam.matrixWorld)
    _rd.set((sx / width) * 2 - 1, -((sy / height) * 2 - 1), 0.5).unproject(cam).sub(_ro)
    if (Math.abs(_rd.y) < 1e-9) return null
    const t = (y - _ro.y) / _rd.y
    return t > 0 ? new Vector3().copy(_ro).addScaledVector(_rd, t) : null
  }

  /**
   * Move a camera pose (target only, same lens and angle) so key map points are not under a control, the
   * sheet or the screen edge: the step's corner, the connector it boards, the destination or the car.
   * Each item is { p: Vector3 (world), box: [left, top, right, bottom] CSS px around the point }.
   * Fits only frame the padded free area; this also handles the controls inside it (the View control, the
   * level picker), which matter most in Arabic, where the View control is wider.
   * @returns the adjusted pose (a new object; the input is left as it is)
   */
  function clearOfUi(pose, items) {
    const all = items.filter((it) => it && it.p)
    // soft items (nice to have in view) never push a hard one under a control: clear the hard ones alone when both
    // cannot be cleared together
    if (all.some((it) => it.soft) && all.some((it) => !it.soft)) {
      const both = clearOfUiAll(pose, all)
      if (!both.blocked) return both
      const hard = all.filter((it) => !it.soft)
      const hardOnly = clearOfUiAll(pose, hard)
      return blockedCountFor(both, hard) <= blockedCountFor(hardOnly, hard) ? both : hardOnly
    }
    return clearOfUiAll(pose, all)
  }

  /** How many of these items a pose leaves under a control, the sheet or the screen edge. */
  function blockedCountFor(pose, items) {
    const { width, height } = viewSize()
    const cam = probeAt(pose)
    let n = 0
    for (const it of items) {
      const sc = projectWith(cam, it.p)
      if (!sc) {
        n++
        continue
      }
      const box = [sc.sx - it.box[0], sc.sy - it.box[1], it.box[0] + it.box[2], it.box[1] + it.box[3]]
      if (box[0] < 0 || box[1] < 0 || box[0] + box[2] > width || box[1] + box[3] > height) n++
      else if (S.obstacles.some((q) => box[0] < q.x + q.w && box[0] + box[2] > q.x && box[1] < q.y + q.h && box[1] + box[3] > q.y)) n++
    }
    return n
  }

  function clearOfUiAll(pose, list) {
    if (!list.length) return { ...pose, blocked: 0 }
    const { width, height } = viewSize()
    const big = 1e5
    const blocks = S.obstacles
      .map((r) => [r.x, r.y, r.w, r.h])
      .concat([
        [-big, -big, big, 3 * big], // outside the screen counts as blocked
        [width, -big, big, 3 * big],
        [-big, -big, 3 * big, big],
        [-big, height, 3 * big, big],
      ])
    const M = UI_CLEAR_PX
    const boxOf = (s, b) => [s.sx - b[0], s.sy - b[1], b[0] + b[2], b[1] + b[3]]
    const overlap = (r, q) => r[0] < q[0] + q[2] && r[0] + r[2] > q[0] && r[1] < q[1] + q[3] && r[1] + r[3] > q[1]
    const blockedCount = (cam) => {
      let n = 0
      for (const it of list) {
        const sc = projectWith(cam, it.p)
        if (!sc || blocks.some((q) => overlap(boxOf(sc, it.box), q))) n++
      }
      return n
    }
    let cur = { ...pose, target: pose.target.clone() }
    let best = { pose: cur, n: blockedCount(probeAt(cur)) }
    if (!best.n) return { ...pose, blocked: 0 }
    for (let iter = 0; iter < 5; iter++) {
      const cam = probeAt(cur)
      let move = null
      for (const it of list) {
        const sc = projectWith(cam, it.p)
        if (!sc) continue
        const box = boxOf(sc, it.box)
        if (!blocks.some((o) => overlap(box, o))) continue
        // the shortest move to a free spot: every combination of "just past an edge of a control" and "just inside
        // the screen", across and down (a box can need both: below the level picker AND in from the screen edge)
        const xs = [0, M - box[0], width - M - (box[0] + box[2])]
        const ys = [0, M - box[1], height - M - (box[1] + box[3])]
        for (const o of S.obstacles) {
          xs.push(o.x - (box[0] + box[2]) - M, o.x + o.w - box[0] + M)
          ys.push(o.y - (box[1] + box[3]) - M, o.y + o.h - box[1] + M)
        }
        let ok = null
        for (const dx of xs) {
          for (const dy of ys) {
            if (ok && Math.hypot(dx, dy) >= Math.hypot(ok[0], ok[1])) continue
            if (!blocks.some((o) => overlap([box[0] + dx, box[1] + dy, box[2], box[3]], o))) ok = [dx, dy]
          }
        }
        if (!ok) continue
        if (!move || Math.hypot(ok[0], ok[1]) > Math.hypot(move.d[0], move.d[1])) move = { d: ok, sc, p: it.p }
      }
      if (!move) break
      // pan: the ground point now under (sx + dx, sy + dy) must come to where the key point is
      const g1 = groundAt(cam, move.sc.sx, move.sc.sy, move.p.y)
      const g2 = groundAt(cam, move.sc.sx + move.d[0], move.sc.sy + move.d[1], move.p.y)
      if (!g1 || !g2) break
      cur = { ...cur, target: cur.target.clone().add(g1.sub(g2)) }
      const n = blockedCount(probeAt(cur))
      if (n < best.n) best = { pose: cur, n }
      if (!n) break
    }
    return { ...best.pose, blocked: best.n }
  }

  /** A key point for clearOfUi: data x / y on a level (+ height), with a pin standing on it or not. */
  function keyPoint(levelId, x, y, { h = 0, pin = false } = {}) {
    if (!levelOf(levelId)) return null
    return { p: new Vector3(x, levelY(levelId, targetBlend(S.mode)) + h, -y), box: pin ? PIN_BOX : POINT_BOX }
  }

  /** screen polygons of each level's outline (stack occlusion) */
  function levelScreenPolys() {
    const out = new Map()
    if (S.mode !== 'stack') return out
    const v = new Vector3()
    for (const L of S.levels.values()) {
      if (!isVisible(L.id)) continue
      const y = levelY(L.id)
      const poly = []
      let ok = true
      for (const [x, yy] of L.level.outline) {
        const s = projectWorld(v.set(x, y, -yy))
        if (!s) {
          ok = false
          break
        }
        poly.push([s.sx, s.sy])
      }
      if (ok) out.set(L.id, poly)
    }
    return out
  }

  function render() {
    S.needsRender = false
    if (!S.renderer) return
    const t0 = performance.now()
    const { width, height } = viewSize()
    const cam = S.camera
    cam.updateMatrixWorld()
    updateClip()
    cam.updateMatrixWorld()
    const target = S.controls ? S.controls.target : new Vector3()
    const ppm = pxPerMeterAt(target)
    const camDist = cam.position.distanceTo(target)

    // route width keeps >= ~11 px on screen (14 px in the stacked Overview, where it must read from afar)
    S.route.setHalfWidth((S.mode === 'stack' ? 7 : 5.5) / ppm)
    const gap = S.stackLevels ? STACK_FOCUS_GAP_M : STACK_GAP_M
    const columnH = Math.max(5.5, 5.5 + (gap * 0.8 - 5.5) * S.blend)
    const layoutCtx = { levelY: (id) => levelY(id), isVisible, mode: S.mode, columnH }
    S.route.layout(layoutCtx)

    S.markers.layout({
      levelY: (id) => levelY(id),
      isVisible,
      elevationOverride: markerWorldY,
      pxPerMeter: (p) => pxPerMeterAt(p),
    })

    cam.getWorldDirection(_dir)
    const viewHeading = MathUtils.radToDeg(Math.atan2(_dir.x, -_dir.z))
    // world-space text is hidden while it would render under 14 px (Latin) / 16 px (Arabic): PLAN.md 19.2
    const textCtx = { camera: cam, levelY: 0, pxPerMeter: (p) => pxPerMeterAt(p) }
    for (const L of S.levels.values()) {
      const shown = isVisible(L.id)
      textCtx.levelY = levelY(L.id)
      if (L.signs) {
        L.signs.batch.visible = shown && !L.faded && ppm > 2.0
        if (L.signs.batch.visible) L.signs.cull(textCtx)
      }
      if (L.floorTexts) {
        L.floorTexts.setViewHeading(viewHeading)
        L.floorTexts.batch.visible = shown && S.mode !== 'stack'
        if (L.floorTexts.batch.visible) L.floorTexts.cull(textCtx)
      }
      if (L.bayCodes) {
        L.bayCodes.batch.visible = S.mode !== 'stack' && camDist < BAY_CODES_MAX_DIST && shown
        if (L.bayCodes.batch.visible) L.bayCodes.setViewHeading(viewHeading)
      }
    }

    const polys = levelScreenPolys()
    const ordinals = new Map([...S.levels.values()].map((L) => [L.id, L.level.ordinal]))
    const isOccluded = (levelId, sx, sy) => {
      if (S.mode !== 'stack') return false
      const o = ordinals.get(levelId) ?? 0
      for (const [id, poly] of polys) {
        if (levelOf(id)?.faded) continue // see-through floors hide nothing
        if ((ordinals.get(id) ?? 0) > o && pointInPolygon([sx, sy], poly)) return true
      }
      return false
    }
    const reserved = S.markers.screenRects((p) => projectWorld(p))
    S.overlay.update({
      camera: cam,
      width,
      height,
      mode: S.mode,
      rtl: S.lang === 'ar',
      levelY: (id) => levelY(id),
      isVisible,
      isOccluded,
      levelOutline: (id) => levelOf(id)?.level.outline ?? null,
      reserved,
      obstacles: S.obstacles,
      ...routeScreenInfo(),
      markerBadges: markerBadges(),
    })

    const r = S.renderer
    r.info.reset()
    r.render(S.scene, cam)
    // second pass: markers on top of everything (own depth buffer, so a marker still shades itself)
    r.autoClear = false
    r.clearDepth()
    r.render(S.markerScene, cam)
    r.autoClear = true
    S.frames++
    S.frameMs = performance.now() - t0
    for (const cb of S.renderCbs) {
      try {
        cb()
      } catch (err) {
        console.error(err)
      }
    }
  }

  /**
   * Screen-space route hints for the label layer: the key points of the current step (where it starts and ends,
   * the connector stops it uses) and the segments of the current and next step (names keep out of them).
   */
  function routeScreenInfo() {
    const r = S.route.route
    if (!r) return { keyRects: [], routeSegments: [] }
    const keyRects = []
    const routeSegments = []
    const v = new Vector3()
    const scr = (p) => (isVisible(p.levelId) ? projectWorld(v.set(p.x, levelY(p.levelId) + 0.05, -p.y)) : null)
    const R = 24
    const halfPx = 5.5 + 6
    if (S.activeStep < 0) {
      // a route preview (place screen): names keep off all of it
      for (let i = 1; i < r.points.length; i++) {
        if (r.points[i].levelId !== r.points[i - 1].levelId) continue
        const a = scr(r.points[i - 1])
        const b = scr(r.points[i])
        if (a && b) routeSegments.push([a.sx, a.sy, b.sx, b.sy, halfPx])
      }
      return { keyRects, routeSegments }
    }
    const step = r.steps[S.activeStep]
    if (step) {
      const pts = S.route.stepPoints(S.activeStep)
      const ends = [pts[0], pts[pts.length - 1]]
      if (step.kind === 'connector') ends.push(...pts.filter((p, i) => i > 0 && p.levelId !== pts[i - 1].levelId), ...pts.filter((p, i) => i < pts.length - 1 && p.levelId !== pts[i + 1].levelId))
      for (const p of ends) {
        const s = p && scr(p)
        if (s) keyRects.push({ x: s.sx - R, y: s.sy - R, w: 2 * R, h: 2 * R })
      }
    }
    for (const k of [S.activeStep, S.activeStep + 1]) {
      const pts = S.route.stepPoints(k)
      for (let i = 1; i < pts.length; i++) {
        if (pts[i].levelId !== pts[i - 1].levelId) continue
        const a = scr(pts[i - 1])
        const b = scr(pts[i])
        if (a && b) routeSegments.push([a.sx, a.sy, b.sx, b.sy, halfPx])
      }
    }
    return { keyRects, routeSegments }
  }

  /** Stack view: markers on a floor below the top one shown get a level badge ("B1"). */
  function markerBadges() {
    if (S.mode !== 'stack') return []
    let top = null
    for (const L of S.levels.values()) if (isVisible(L.id) && (!top || L.level.ordinal > top.level.ordinal)) top = L
    if (!top) return []
    const out = []
    const v = new Vector3()
    for (const kind of ['you', 'car', 'dest', 'walker']) {
      const m = S.markers.get(kind)
      if (!m || !isVisible(m.levelId) || m.levelId === top.id) continue
      if (out.some((b) => b.levelId === m.levelId)) continue
      const wy = levelY(m.levelId)
      v.set(m.x, wy, -m.y)
      const s = projectWorld(v)
      if (!s) continue
      _proj.copy(v).applyMatrix4(S.camera.matrixWorldInverse)
      out.push({ levelId: m.levelId, sx: s.sx, sy: s.sy, depth: -_proj.z, x: m.x, y: m.y, wy })
    }
    return out
  }

  // ------------------------------------------------------------------------------------------
  // camera: poses, flights, follow, limits
  // ------------------------------------------------------------------------------------------

  function currentPose() {
    const target = S.controls ? S.controls.target : S.flightTarget ?? new Vector3()
    return readPose(S.camera, target)
  }

  function setPoseNow(pose) {
    applyPose(S.camera, pose)
    if (S.controls) S.controls.target.copy(pose.target)
    else S.flightTarget = pose.target.clone()
  }

  function resetControlsMomentum() {
    const c = S.controls
    if (!c) return
    if (c._sphericalDelta) c._sphericalDelta.set(0, 0, 0)
    if (c._panOffset) c._panOffset.set(0, 0, 0)
    if (typeof c._scale === 'number') c._scale = 1
  }

  function applyControlLimits() {
    const c = S.controls
    if (!c) return
    if (S.mode === 'top') {
      c.minPolarAngle = MathUtils.degToRad(90 - 89.5)
      c.maxPolarAngle = MathUtils.degToRad(90 - 89.5)
    } else {
      c.minPolarAngle = MathUtils.degToRad(90 - TILT_MAX)
      c.maxPolarAngle = MathUtils.degToRad(90 - TILT_MIN)
    }
    const b = S.bounds
    const diag = Math.hypot(b.maxX - b.minX, b.maxY - b.minY)
    c.minDistance = 6
    // far enough for the stacked Overview to fit beside the level-name column and above a tall sheet
    c.maxDistance = Math.max(200, diag * 12)
  }

  function prefersReducedMotion() {
    try {
      return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    } catch {
      return false
    }
  }

  /**
   * Start a camera flight to `to` (and the stack blend `toBlend`).
   */
  function startFlight(to, durationMs, toBlend = S.blend) {
    resetControlsMomentum()
    const from = currentPose()
    const dur = prefersReducedMotion() ? Math.min(durationMs, 200) : durationMs
    if (!S.mounted || dur <= 0) {
      S.blend = toBlend
      applyLayout()
      setPoseNow(to)
      S.flight = null
      requestRender()
      return
    }
    S.flight = { from, to, start: performance.now(), dur, fromBlend: S.blend, toBlend }
    requestRender()
  }

  function stepFlight(now) {
    const f = S.flight
    const t = Math.min(1, (now - f.start) / f.dur)
    const e = easeStandard(t)
    S.blend = f.fromBlend + (f.toBlend - f.fromBlend) * e
    applyLayout()
    setPoseNow(lerpPose(f.from, f.to, e))
    if (t >= 1) {
      S.flight = null
      if (S.controls) S.controls.update()
      return false
    }
    return true
  }

  function cancelFlight() {
    if (!S.flight) return
    S.blend = S.flight.toBlend
    applyLayout()
    S.flight = null
    requestRender()
  }

  function clampTarget() {
    const c = S.controls
    if (!c) return false
    const b = S.bounds
    const m = 25
    const t = c.target
    const x = MathUtils.clamp(t.x, b.minX - m, b.maxX + m)
    const z = MathUtils.clamp(t.z, -(b.maxY + m), -(b.minY - m))
    if (x === t.x && z === t.z) return false
    const dx = x - t.x
    const dz = z - t.z
    t.x = x
    t.z = z
    S.camera.position.x += dx
    S.camera.position.z += dz
    return true
  }

  function walkerWorld() {
    const w = S.markers.get('walker')
    if (!w) return null
    const y = markerWorldY('walker', w) ?? levelY(w.levelId)
    return new Vector3(w.x, y, -w.y)
  }

  function stepFollow(dt) {
    if (!S.follow || S.flight || !S.controls) return false
    const goal = walkerWorld()
    if (!goal) return false
    const t = S.controls.target
    const d = goal.clone().sub(t)
    if (d.length() < 0.01) return false
    const k = 1 - Math.exp(-dt * 5)
    d.multiplyScalar(k)
    t.add(d)
    S.camera.position.add(d)
    S.needsRender = true
    return true
  }

  /**
   * World y of a marker that is not standing on its level floor, or null.
   * - the simulated walker riding an escalator (`connectorId` names it): follows that ramp's profile;
   * - any marker with an explicit true-scale `elevation` (lift and stairs rides).
   * Positions are never guessed from x/y alone: parking aisles run under the escalators of the floors above.
   */
  function markerWorldY(kind, v) {
    if (kind === 'walker' && v.connectorId) {
      const c = S.connectors.find((cc) => cc.conn.id === v.connectorId)
      if (c && c.kind === 'escalator') {
        const a = c.lowStop.point
        const b = c.highStop.point
        const dx = b[0] - a[0]
        const dy = b[1] - a[1]
        const l2 = Math.max(1e-6, dx * dx + dy * dy)
        const t = MathUtils.clamp(((v.x - a[0]) * dx + (v.y - a[1]) * dy) / l2, 0, 1)
        const L = Math.sqrt(l2)
        const landing = Math.min(1.4, L * 0.15)
        const f = MathUtils.clamp((t * L - landing) / Math.max(1e-6, L - 2 * landing), 0, 1)
        const y0 = levelY(c.lowStop.levelId)
        const y1 = levelY(c.highStop.levelId)
        return y0 + (y1 - y0) * f
      }
    }
    if (typeof v.elevation === 'number') return worldYForElevation(v.elevation)
    return null
  }

  /** The destination's own sign (shop, amenity, lift or entrance) nearest a point (within maxD metres), or null. */
  function nearestShopSign(levelId, x, y, maxD) {
    const L = levelOf(levelId)
    if (!L || L.level.kind === 'parking' || !S.destRefs.size) return null
    let best = null
    let bestD = maxD
    for (const sg of L.build?.signs ?? []) {
      if (sg.flat || !sg.text || !S.destRefs.has(sg.refId)) continue
      const d = Math.hypot(sg.x - x, sg.y - y)
      if (d < bestD) {
        bestD = d
        best = sg
      }
    }
    return best
  }

  // ------------------------------------------------------------------------------------------
  // scene state
  // ------------------------------------------------------------------------------------------

  /** Level groups and connector geometry follow the current stack blend and stacked levels. */
  function applyLayout() {
    for (const L of S.levels.values()) L.group.position.y = levelY(L.id)
    for (const c of S.connectors) {
      let lo = c.lowStop.levelId
      let hi = c.highStop.levelId
      if (c.kind === 'lift' && S.mode === 'stack') {
        // the glass column spans the stops that are shown
        const shown = c.stops.filter((st) => isVisible(st.levelId))
        if (shown.length >= 2) {
          shown.sort((a, b) => levelY(a.levelId) - levelY(b.levelId))
          lo = shown[0].levelId
          hi = shown[shown.length - 1].levelId
        }
      }
      const y0 = levelY(lo)
      c.group.position.y = y0
      const rise = levelY(hi) - y0
      if (Math.abs(rise - c.rise) > 1e-4) {
        setRise(c.mesh.geometry, rise)
        c.rise = rise
      }
    }
  }

  function applyVisibility() {
    const fo = focusOrdinal()
    for (const L of S.levels.values()) {
      const shown = isVisible(L.id)
      L.content.visible = shown
      L.ghost.visible = S.mode === 'floor' && !shown && Math.abs(L.level.ordinal - fo) === 1
    }
    for (const c of S.connectors) {
      const lowShown = isVisible(c.lowStop.levelId)
      const highShown = isVisible(c.highStop.levelId)
      if (c.kind === 'escalator') c.group.visible = S.mode === 'stack' ? lowShown && highShown : lowShown || highShown
      else c.group.visible = S.mode === 'stack' && c.stops.filter((st) => isVisible(st.levelId)).length >= 2
    }
    // floor view cuts the roofs away so storefronts and interiors read; stack/top keep them
    for (const L of S.levels.values()) if (L.roofs) L.roofs.visible = S.mode !== 'floor'
    // stack view with a multi-floor route: every route floor above the lowest is see-through
    const fadeIds = S.mode === 'stack' && S.stackLevels ? new Set(S.stackOrder.slice(1)) : null
    for (const L of S.levels.values()) setFaded(L, Boolean(fadeIds?.has(L.id)))
    S.route.setCurrentLevel(routeCurrentLevel())
    S.route.setXray(S.mode === 'stack')
    applyLayout()
  }

  function setFaded(L, faded) {
    if (L.faded === faded) return
    L.faded = faded
    if (L.opaque) L.opaque.material = faded ? S.mats.fadeOpaque : S.mats.opaque
    if (L.roofs) L.roofs.material = faded ? S.mats.fadeOpaque : S.mats.roofs
    if (L.glass) L.glass.material = faded ? S.mats.fadeGlass : S.mats.glass
    if (L.decals) L.decals.material = faded ? S.mats.fadeDecals : S.mats.decals
    if (L.bays) L.bays.visible = !faded
    if (L.signs) L.signs.batch.visible = !faded
  }

  function routeCurrentLevel() {
    if (S.mode !== 'stack') return S.focusId
    const step = S.route.route?.steps?.[S.activeStep]
    if (!step) return null
    return S.route.route.points[Math.max(0, step.from ?? 0)]?.levelId ?? null
  }

  function applyThemeAll() {
    for (const g of S.themedGeometries) applyTheme(g, S.theme)
    for (const L of S.levels.values()) {
      if (L.bays) L.bays.userData.setTheme(S.theme)
      if (L.floorTexts) L.floorTexts.setTextColor(THEMES[S.theme].floorPaint)
    }
    S.route.setTheme(S.theme)
    S.markers.setTheme(S.theme)
    const T = THEMES[S.theme]
    S.overlay.setColors({ text: T.labelText, halo: T.labelHalo, badgeText: T.badgeText, badgeHalo: T.badgeHalo })
    if (S.renderer) S.renderer.domElement.style.background = `linear-gradient(180deg, ${T.bgTop} 0%, ${T.bgBottom} 100%)`
  }

  function clearVenue() {
    S.flight = null
    S.route.clear()
    S.markers.dispose()
    S.overlay.dispose()
    S.scene.remove(S.overlay.batch)
    S.overlay = new OverlayLayer()
    S.overlay.setLanguage(S.lang)
    watchSync(S.overlay.batch)
    S.scene.add(S.overlay.batch)
    for (const L of S.levels.values()) {
      for (const layer of [L.signs, L.floorTexts, L.bayCodes]) if (layer) layer.dispose()
      if (L.bays) L.bays.userData.dispose()
      L.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
      })
      S.venueRoot.remove(L.group)
    }
    S.levels.clear()
    for (const c of S.connectors) {
      c.mesh.geometry.dispose()
      S.venueRoot.remove(c.group)
    }
    S.connectors = []
    S.themedGeometries = []
    S.pickables = []
    S.pickPolygons = []
    S.registry = new ColorRegistry()
    S.activeStep = -1
    S.walkerDist = 0
    S.stackLevels = null
    S.stackOrder = []
    S.destRefs = new Set()
    pendingSync.clear()
  }

  /** Start typesetting every text batch (signs, painted text, labels). */
  function syncText() {
    for (const L of S.levels.values()) {
      L.signs?.sync()
      L.floorTexts?.sync()
      L.bayCodes?.sync()
    }
    S.overlay.sync()
  }

  function addThemedMesh(builder, material, parent, name, renderOrder = 0) {
    if (builder.isEmpty) return null
    const g = builder.build(S.theme)
    S.themedGeometries.push(g)
    const mesh = new Mesh(g, material)
    mesh.name = name
    mesh.renderOrder = renderOrder
    parent.add(mesh)
    return mesh
  }

  function buildLevel(level) {
    const build = level.kind === 'parking' ? buildParkingLevel(S.index, level, S.registry) : buildRetailLevel(S.index, level, S.registry)
    const group = new Group()
    group.name = 'level-' + level.id
    const content = new Group()
    content.name = 'content'
    group.add(content)
    const ghostGroup = new Group()
    ghostGroup.name = 'ghost'
    group.add(ghostGroup)
    const L = { id: level.id, level, group, content, ghost: ghostGroup, build, faded: false }
    L.opaque = addThemedMesh(build.opaque, S.mats.opaque, content, 'opaque-' + level.id)
    L.roofs = addThemedMesh(build.roofs, S.mats.roofs, content, 'roofs-' + level.id, 0)
    L.decals = addThemedMesh(build.decals, S.mats.decals, content, 'zone-decals-' + level.id, 1)
    L.glass = addThemedMesh(build.glass, S.mats.glass, content, 'glass-' + level.id, 2)
    addThemedMesh(build.ghost, S.mats.ghost, ghostGroup, 'ghost-' + level.id, 1)
    if (build.bays.length) {
      L.bays = buildBaysMesh(build.bays, S.theme)
      L.bays.name = 'bays-' + level.id
      content.add(L.bays)
    }
    const signLayer = (items, opts, order) => {
      if (!items.length) return null
      const layer = new SignLayer(opts)
      layer.setLanguage(S.lang)
      for (const s of items) layer.add(s)
      layer.batch.renderOrder = order
      content.add(layer.batch)
      watchSync(layer.batch)
      return layer
    }
    L.signs = signLayer(build.signs, {}, 3)
    L.floorTexts = signLayer(build.floorTexts, {}, 3)
    if (L.floorTexts) L.floorTexts.setTextColor(THEMES[S.theme].floorPaint)
    L.bayCodes = signLayer(build.bayTexts, {}, 3)
    const pins = buildPinMesh(build.pins, S.atlas)
    if (pins) {
      pins.name = 'pins-' + level.id
      content.add(pins)
      S.overlay.addPins(pins, level.id)
    }
    for (const spec of build.labels) S.overlay.addLabel(spec)
    if (build.levelBadge) {
      S.overlay.addLabel(build.levelBadge)
      // the level badge under a marker on this level when it is not the top floor in stack view ("B1")
      if (build.levelBadge.shortText) S.overlay.addLabel({ id: 'lbl-mbadge-' + level.id, type: 'mbadge', levelId: level.id, x: 0, y: 0, h: 0, text: build.levelBadge.shortText, priority: 0, px: 14, modes: 'stack' })
    }
    L.routeGroup = new Group()
    L.routeGroup.name = 'route-' + level.id
    content.add(L.routeGroup)
    S.pickables.push(...build.pickables)
    for (const pp of build.pickPolygons) S.pickPolygons.push({ ...pp, levelId: level.id })
    S.venueRoot.add(group)
    S.levels.set(level.id, L)
  }

  function buildConnectors() {
    for (const conn of S.index.venue.connectors ?? []) {
      const stops = (conn.stops ?? []).filter((s) => S.levels.has(s.levelId))
      if (stops.length < 2) continue
      const elev = (s) => levelOf(s.levelId).level.elevation
      const sorted = [...stops].sort((a, b) => elev(a) - elev(b))
      const lowStop = sorted[0]
      const highStop = sorted[sorted.length - 1]
      let builder = null
      let material = S.mats.opaque
      if (conn.type === 'escalator') {
        builder = buildEscalator(conn, S.registry, { elevLow: elev(lowStop), elevHigh: elev(highStop), lowStop, highStop })
      } else if (conn.type === 'lift' && Array.isArray(conn.shaft)) {
        builder = buildLiftColumn(conn, S.registry)
        material = S.mats.glass
      }
      if (!builder || builder.isEmpty) continue
      const g = builder.build(S.theme)
      S.themedGeometries.push(g)
      const mesh = new Mesh(g, material)
      mesh.name = 'connector-' + conn.id
      mesh.renderOrder = conn.type === 'lift' ? 2 : 0
      const group = new Group()
      group.name = 'connector-' + conn.id
      group.add(mesh)
      S.venueRoot.add(group)
      S.connectors.push({ conn, kind: conn.type, group, mesh, stops, lowStop, highStop, elevLow: elev(lowStop), elevHigh: elev(highStop), rise: -1 })
    }
  }

  // ------------------------------------------------------------------------------------------
  // view fitting
  // ------------------------------------------------------------------------------------------

  function usableAspect(mode = S.mode) {
    const { width, height } = viewSize()
    const p = padFor(targetBlend(mode))
    const w = Math.max(50, width - p.left - p.right)
    const h = Math.max(50, height - p.top - p.bottom)
    return { aspect: w / h, vScale: h / height }
  }

  /** Effective vertical fov after padding (fit only). */
  function fitFov(fov, mode = S.mode) {
    const { vScale } = usableAspect(mode)
    const t = Math.tan(MathUtils.degToRad(fov) / 2) * vScale
    return MathUtils.radToDeg(Math.atan(t) * 2)
  }

  /**
   * Default heading. Stack: a 3/4 "game" angle showing the side faces of the stack. Floor/top:
   * north-up, except on a portrait screen with a wide venue, where the map turns 90 degrees so the
   * long side runs up the screen (PLAN 19.2: route-up, never compass-up).
   */
  function defaultHeading(mode) {
    if (mode === 'stack') return -22
    const { aspect } = usableAspect(mode)
    const b = S.bounds
    const wide = b.maxX - b.minX > (b.maxY - b.minY) * 1.2
    return aspect < 0.85 && wide ? 90 : 0
  }

  function levelCorners(levelId, blend, h0 = -0.5, h1 = 4.5) {
    const L = levelOf(levelId)
    if (!L) return []
    const y = levelY(levelId, blend)
    const pts = []
    const ext = extentsFor(levelId)
    for (const [x, yy] of [
      [ext.minX, ext.minY],
      [ext.maxX, ext.minY],
      [ext.maxX, ext.maxY],
      [ext.minX, ext.maxY],
    ]) {
      pts.push(new Vector3(x, y + h0, -yy), new Vector3(x, y + h1, -yy))
    }
    return pts
  }

  /** Level outline bounds plus outdoor areas (entrance plaza). */
  function extentsFor(levelId) {
    const L = levelOf(levelId)
    const b = { ...L.build.bounds }
    for (const ar of S.index.venue.areas ?? []) {
      if (ar.levelId !== levelId || ar.kind !== 'outdoor') continue
      for (const [x, y] of ar.polygon) {
        b.minX = Math.min(b.minX, x)
        b.minY = Math.min(b.minY, y)
        b.maxX = Math.max(b.maxX, x)
        b.maxY = Math.max(b.maxY, y)
      }
    }
    return b
  }

  function poseToFit(points, { tiltDeg, headingDeg, fov, minDistance = 0, margin = 0.06, mode = S.mode }) {
    const target = boxCenter(points)
    const { aspect } = usableAspect(mode)
    const d = fitDistance(points, target, tiltDeg, headingDeg, fitFov(fov, mode), aspect, margin)
    return { target, distance: Math.max(minDistance, d, 8), tiltDeg, headingDeg, fov }
  }

  function viewPose(mode, levelId, fit) {
    const def = VIEW_DEFAULTS[mode]
    const ex = targetBlend(mode)
    let pts = []
    if (fit === 'route' && S.route.route) {
      for (const p of S.route.route.points) {
        if (mode !== 'stack' && p.levelId !== levelId) continue
        pts.push(new Vector3(p.x, levelY(p.levelId, ex), -p.y))
      }
      if (pts.length) {
        // pad route framing by a few metres around
        const extra = []
        for (const p of pts) extra.push(p.clone().add(new Vector3(8, 0, 8)), p.clone().add(new Vector3(-8, 0, -8)))
        pts = pts.concat(extra)
      }
    }
    if (!pts.length) {
      if (mode === 'stack') {
        for (const L of S.levels.values()) if (isVisible(L.id)) pts.push(...levelCorners(L.id, ex, -0.5, 4.5))
      } else {
        pts = levelCorners(levelId, ex, 0, 0)
      }
    }
    const pose = poseToFit(pts, { tiltDeg: def.tiltDeg, headingDeg: defaultHeading(mode), fov: def.fov, margin: mode === 'stack' ? 0.04 : 0.05, mode })
    if (fit === 'route' && S.route.route && mode !== 'stack') {
      // the route's start and end stay clear of the controls
      const pts0 = S.route.route.points
      const first = pts0.find((p) => p.levelId === levelId)
      const last = [...pts0].reverse().find((p) => p.levelId === levelId)
      const items = []
      if (last) items.push(destKeyPoint(last))
      if (first && first !== last) items.push(keyPoint(first.levelId, first.x, first.y))
      return clearOfUiFor(mode, pose, items)
    }
    return pose
  }

  /** Data point of something a step names (occupant door, landmark, lift / escalator stop, amenity) on a level. */
  function landmarkPoint(id, levelId) {
    const idx = S.index
    if (!idx || !id) return null
    const occ = idx.occupantById.get(id)
    if (occ) {
      for (const nid of occ.entranceNodeIds ?? []) {
        const n = idx.nodeById.get(nid)
        if (n && n.levelId === levelId) return n.point
      }
      return null
    }
    const lm = idx.landmarkById.get(id)
    if (lm) return lm.levelId === levelId ? lm.point : null
    const conn = idx.connectorById.get(id)
    if (conn) return (conn.stops ?? []).find((st) => st.levelId === levelId)?.point ?? null
    const am = idx.amenityById.get(id)
    if (am) return am.levelId === levelId ? am.point : null
    return null
  }

  /** clearOfUi for a pose of another mode than the current one (its padding and blend). */
  function clearOfUiFor(mode, pose, items) {
    const prev = S.mode
    S.mode = mode
    try {
      return clearOfUi(pose, items)
    } finally {
      S.mode = prev
    }
  }

  /** Key point of a route end: the destination marker (or the car) when it is shown there, else the point. */
  function destKeyPoint(last) {
    const car = S.markers.get('car')
    if (car && car.levelId === last.levelId && Math.hypot(car.x - last.x, car.y - last.y) < 6) return keyPoint(car.levelId, car.x, car.y, { pin: true })
    const d = S.markers.get('dest')
    if (d && d.levelId === last.levelId) return keyPoint(d.levelId, d.x, d.y, { pin: true })
    return keyPoint(last.levelId, last.x, last.y, { pin: true })
  }

  // ------------------------------------------------------------------------------------------
  // picking
  // ------------------------------------------------------------------------------------------

  function pickAt(sx, sy) {
    if (!S.index) return null
    let best = null
    let bestD = PICK_RADIUS_PX
    const consider = (type, id, px, py) => {
      const d = Math.hypot(px - sx, py - sy)
      if (d <= bestD) {
        bestD = d
        best = { type, id }
      }
    }
    for (const t of S.overlay.visibleTargets) {
      if (t.type === 'landmark' || t.type === 'level' || t.type === 'zone') continue
      consider(t.type, t.id, t.sx, t.sy)
    }
    const target = S.controls ? S.controls.target : new Vector3()
    const near = S.camera.position.distanceTo(target) < BAY_CODES_MAX_DIST * 1.6
    const polys = levelScreenPolys()
    const ordinals = new Map([...S.levels.values()].map((L) => [L.id, L.level.ordinal]))
    const v = new Vector3()
    for (const p of S.pickables) {
      if (!isVisible(p.levelId)) continue
      if (p.nearOnly && !near) continue
      const s = projectWorld(v.set(p.x, levelY(p.levelId) + p.h, -p.y))
      if (!s) continue
      if (S.mode === 'stack') {
        const o = ordinals.get(p.levelId) ?? 0
        let hidden = false
        for (const [id, poly] of polys) if (!levelOf(id)?.faded && (ordinals.get(id) ?? 0) > o && pointInPolygon([s.sx, s.sy], poly)) hidden = true
        if (hidden) continue
      }
      consider(p.type, p.id, s.sx, s.sy)
    }
    if (best) return best
    // fallback: the unit under the finger on the top-most visible level
    S.camera.updateMatrixWorld()
    const levels = [...S.levels.values()].filter((L) => isVisible(L.id)).sort((a, b) => b.level.ordinal - a.level.ordinal)
    for (const L of levels) {
      for (const pp of S.pickPolygons) {
        if (pp.levelId !== L.id) continue
        const hit = groundAt(S.camera, sx, sy, levelY(L.id) + pp.h)
        if (hit && pointInPolygon([hit.x, -hit.z], pp.polygon)) return { type: pp.type, id: pp.id }
      }
    }
    return null
  }

  function onPointerDown(e) {
    cancelFlight()
    S.userMoved = true
    if (!e.isPrimary) {
      S.pointer = null
      return
    }
    S.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), multi: false }
  }

  function onPointerUp(e) {
    const p = S.pointer
    S.pointer = null
    if (!p || p.id !== e.pointerId || p.multi) return
    if (performance.now() - p.t > 600) return
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) return
    const rect = S.renderer.domElement.getBoundingClientRect()
    const hit = pickAt(e.clientX - rect.left, e.clientY - rect.top)
    if (hit) for (const cb of S.pickCbs) cb(hit)
  }

  function onPointerMoveOther(e) {
    if (S.pointer && e.pointerId !== S.pointer.id) S.pointer.multi = true
  }

  function onWheel() {
    cancelFlight()
    S.userMoved = true
  }

  // ------------------------------------------------------------------------------------------
  // public API
  // ------------------------------------------------------------------------------------------

  const api = {
    /**
     * Attach the canvas to a container (idempotent; StrictMode-safe).
     * @param {HTMLElement} containerEl
     */
    mount(containerEl) {
      if (S.disposed) throw new Error('engine: disposed')
      if (S.mounted && S.container === containerEl) return
      if (S.mounted) api.unmount()
      if (S.failed) throw new Error('engine: WebGL is not available')
      S.container = containerEl
      if (!S.renderer) {
        try {
          S.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
        } catch (err) {
          // no WebGL: free what setVenue built and turn every command into a no-op (the app shows its fallback)
          S.failed = true
          S.container = null
          clearVenue()
          S.index = null
          throw err
        }
        S.renderer.setClearColor(0x000000, 0)
        // two passes per frame (scene, then markers): stats are reset once per frame in render()
        S.renderer.info.autoReset = false
        const el = S.renderer.domElement
        el.style.display = 'block'
        el.style.width = '100%'
        el.style.height = '100%'
        el.style.touchAction = 'none'
        el.setAttribute('aria-hidden', 'true')
        S.controls = new OrbitControls(S.camera, el)
        S.controls.screenSpacePanning = false
        S.controls.mouseButtons = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }
        S.controls.touches = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_ROTATE }
        S.controls.enableDamping = true
        S.controls.dampingFactor = 0.14
        S.controls.screenSpacePanning = false
        S.controls.zoomSpeed = 1.1
        S.controls.rotateSpeed = 0.6
        if (S.flightTarget) S.controls.target.copy(S.flightTarget)
        S.controls.addEventListener('change', requestRender)
        S.controls.addEventListener('start', () => {
          cancelFlight()
          S.userMoved = true
        })
        el.addEventListener('pointerdown', onPointerDown)
        el.addEventListener('pointerup', onPointerUp)
        el.addEventListener('pointermove', onPointerMoveOther)
        el.addEventListener('pointercancel', () => (S.pointer = null))
        el.addEventListener('wheel', onWheel, { passive: true })
        el.addEventListener('webglcontextrestored', () => requestRender())
        applyControlLimits()
        applyThemeAll()
      }
      S.renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2))
      containerEl.appendChild(S.renderer.domElement)
      S.mounted = true
      if (S.needsSync) {
        // the venue was built before WebGL was there: typeset its text now
        S.needsSync = false
        syncText()
      }
      const resize = () => {
        const { width, height } = viewSize()
        S.renderer.setSize(width, height, false)
        S.camera.aspect = width / height
        updateClip()
        if (!S.userMoved && S.lastView && S.index) {
          const pose = viewPose(S.lastView.mode, S.lastView.levelId, S.lastView.fit)
          setPoseNow(pose)
        }
        requestRender()
      }
      if (typeof ResizeObserver !== 'undefined') {
        S.resizeObserver = new ResizeObserver(resize)
        S.resizeObserver.observe(containerEl)
      }
      resize()
    },

    /** Detach the canvas (keeps the renderer for the next mount). */
    unmount() {
      if (!S.mounted) return
      if (S.rafId) cancelAnimationFrame(S.rafId)
      S.rafId = 0
      S.resizeObserver?.disconnect()
      S.resizeObserver = null
      if (S.renderer?.domElement.parentNode) S.renderer.domElement.parentNode.removeChild(S.renderer.domElement)
      S.mounted = false
      S.container = null
      S.flight = null
    },

    /**
     * Build the scene for a venue (disposes the previous one).
     * @param {object} index VenueIndex (src/data/venue.js)
     */
    setVenue(index) {
      if (S.disposed) throw new Error('engine: disposed')
      if (S.failed) return
      clearVenue()
      S.index = index
      if (!index) {
        requestRender()
        return
      }
      // pin atlas: the fixed icons plus this venue's parking zones (pictogram on the zone colour)
      S.atlas?.dispose()
      S.atlas = createIconAtlas((index.venue.parking?.zones ?? []).map((z) => ({ id: z.id, color: z.color, icon: z.icon })))
      const b = index.venue.meta?.bounds
      S.bounds = b ? { ...b } : { minX: 0, minY: 0, maxX: 128, maxY: 64 }
      for (const level of index.levels) buildLevel(level)
      buildConnectors()
      S.overlay.setLanguage(S.lang)
      S.overlay.scanKinds = S.scanKinds
      applyThemeAll()
      // text is typeset only once WebGL is there (troika needs a context for its glyph atlas)
      if (S.renderer) syncText()
      else S.needsSync = true
      const startAnchor = index.anchorById.get(index.venue.meta?.defaultStartAnchorId)
      S.focusId = startAnchor?.levelId ?? index.levels.find((l) => l.kind === 'retail')?.id ?? index.levels[0]?.id ?? null
      S.mode = 'stack'
      S.blend = targetBlend('stack')
      S.userMoved = false
      S.stackLevels = null
      S.stackOrder = []
      applyVisibility()
      applyControlLimits()
      S.lastView = { mode: 'stack', levelId: S.focusId, fit: 'level' }
      setPoseNow(viewPose('stack', S.focusId, 'level'))
      requestRender()
    },

    /** @param {'en'|'ar'} lang */
    setLanguage(lang) {
      S.lang = lang === 'ar' ? 'ar' : 'en'
      if (S.failed) return
      S.overlay.setLanguage(S.lang)
      for (const L of S.levels.values()) {
        L.signs?.setLanguage(S.lang)
        L.floorTexts?.setLanguage(S.lang)
      }
      requestRender()
    },

    /** @param {'sunlight'|'basement'} theme */
    setTheme(theme) {
      S.theme = theme === 'basement' ? 'basement' : 'sunlight'
      if (S.failed) return
      applyThemeAll()
      requestRender()
    },

    /**
     * @param {{ mode: 'stack'|'floor'|'top', levelId?: string, fit?: 'level'|'route'|'none' }} view
     * @param {{ durationMs?: number }} [opts]
     */
    setView(view, opts = {}) {
      if (S.failed || !S.index) return
      const mode = view?.mode === 'floor' || view?.mode === 'top' ? view.mode : 'stack'
      const levelId = view?.levelId && S.levels.has(view.levelId) ? view.levelId : S.focusId
      const fit = view?.fit ?? 'level'
      S.mode = mode
      S.focusId = levelId
      S.lastView = { mode, levelId, fit }
      applyVisibility()
      applyControlLimits()
      const toBlend = targetBlend(mode)
      let pose
      if (fit === 'none') {
        const cur = currentPose()
        pose = { ...cur, target: new Vector3(cur.target.x, levelY(levelId, toBlend), cur.target.z), fov: VIEW_DEFAULTS[mode].fov }
        if (mode === 'top') pose.tiltDeg = VIEW_DEFAULTS.top.tiltDeg
        else pose.tiltDeg = MathUtils.clamp(pose.tiltDeg, TILT_MIN, TILT_MAX)
      } else {
        pose = viewPose(mode, levelId, fit)
      }
      startFlight(pose, opts.durationMs ?? 1200, toBlend)
    },

    /** @returns {{ mode: string, levelId: string|null, blend: number, stackLevels: string[]|null }} */
    getView() {
      return { mode: S.mode, levelId: S.focusId, blend: S.blend, stackLevels: S.stackLevels ? [...S.stackOrder] : null }
    },

    /**
     * Show a route (CONTRACT Route) or clear it with null.
     * @param {object|null} route
     */
    showRoute(route) {
      if (S.failed) return
      S.route.show(route, { routeGroupFor: (id) => levelOf(id)?.routeGroup ?? S.route.root })
      S.activeStep = -1
      S.walkerDist = 0
      S.trimEnd = 0
      S.overlay.forced.clear()
      S.overlay.stepForced = new Set()
      S.destRefs = new Set()
      if (route?.points?.length) {
        const last = route.points[route.points.length - 1]
        for (const occ of S.index?.occupantById.values() ?? []) {
          if ((occ.entranceNodeIds ?? []).includes(last.nodeId)) S.overlay.forced.add(occ.id)
        }
        for (const am of S.index?.amenityById.values() ?? []) if (am.nodeId === last.nodeId) S.overlay.forced.add(am.id)
        for (const id of S.overlay.forced) S.destRefs.add(id)
        const ref = S.index?.nodeById.get(last.nodeId)?.refId
        if (typeof ref === 'string' && ref) S.destRefs.add(ref)
      }
      // a route over several floors stacks only those floors in Overview (12 m apart, PLAN.md 19.2)
      const ids = [...new Set((route?.points ?? []).map((p) => p.levelId))].filter((id) => S.levels.has(id))
      if (ids.length >= 2) {
        S.stackLevels = new Set(ids)
        S.stackOrder = ids.sort((a, b) => levelOf(a).level.ordinal - levelOf(b).level.ordinal)
      } else {
        S.stackLevels = null
        S.stackOrder = []
      }
      applyVisibility()
      S.route.setProgress(-1, 0)
      S.route.setCurrentLevel(routeCurrentLevel())
      requestRender()
    },

    /**
     * Highlight a step and fly the camera to frame it.
     * @param {number} stepIndex
     * @param {{ durationMs?: number, fly?: boolean, headingDeg?: number }} [opts] the camera turns route-up
     *   (walking direction up the screen) unless headingDeg is given
     */
    setActiveStep(stepIndex, opts = {}) {
      const r = S.route.route
      if (S.failed || !r) return
      const i = Math.max(-1, Math.min((r.steps?.length ?? 0) - 1, stepIndex | 0))
      // the walked part follows a jump: back to a step's start, or forward past where the walker was
      const startD = i >= 0 ? S.route.stepStartDist(i) : 0
      if (i < S.activeStep || startD > S.walkerDist) S.walkerDist = startD
      S.activeStep = i
      S.route.setProgress(i, Math.max(startD, S.walkerDist))
      // the landmark and the lift / escalator the step names always show (PLAN.md 19.2)
      const st = i >= 0 ? r.steps[i] : null
      S.overlay.stepForced = new Set([st?.landmark?.id, st?.connector?.id].filter(Boolean))
      if (i < 0) {
        S.route.setCurrentLevel(routeCurrentLevel())
        requestRender()
        return
      }
      const pts = S.route.stepPoints(i)
      if (!pts.length) return
      if (opts.fly !== false) S.userMoved = true
      const stepLevel = pts[0].levelId
      if (S.mode !== 'stack' && stepLevel !== S.focusId) {
        S.focusId = stepLevel
        S.lastView = { mode: S.mode, levelId: stepLevel, fit: 'none' }
        applyVisibility()
      }
      S.route.setCurrentLevel(routeCurrentLevel())
      if (opts.fly === false) {
        requestRender()
        return
      }
      const ex = targetBlend(S.mode)
      const world = []
      for (const p of pts) {
        if (S.mode !== 'stack' && p.levelId !== S.focusId) continue
        const y = levelY(p.levelId, ex)
        world.push(new Vector3(p.x - 4, y, -p.y - 4), new Vector3(p.x + 4, y, -p.y + 4))
      }
      if (!world.length) for (const p of pts) world.push(new Vector3(p.x, levelY(p.levelId, ex), -p.y))
      const cur = currentPose()
      const def = VIEW_DEFAULTS[S.mode]
      const tilt = S.mode === 'top' ? def.tiltDeg : MathUtils.clamp(cur.tiltDeg, TILT_MIN, TILT_MAX)
      // route-up (PLAN 19.2): the step's walking direction points up the screen
      let heading = cur.headingDeg
      const a = pts[0]
      const b = pts[pts.length - 1]
      if (Math.hypot(b.x - a.x, b.y - a.y) > 2) heading = MathUtils.radToDeg(Math.atan2(b.x - a.x, b.y - a.y))
      if (opts.headingDeg != null) heading = opts.headingDeg
      const { aspect } = usableAspect()
      const tanH = Math.tan(MathUtils.degToRad(fitFov(def.fov)) / 2) * aspect
      const minD = 16 / Math.max(0.05, tanH)
      const fitted = poseToFit(world, { tiltDeg: tilt, headingDeg: heading, fov: def.fov, minDistance: Math.min(minD, 140), margin: 0.12 })
      // what the step is about stays clear of the controls: where it ends (the corner, the lift or escalator it
      // boards, the destination or the car), the landmark it names, and where it starts
      const here = pts.filter((p) => S.mode === 'stack' || p.levelId === S.focusId)
      const items = []
      if (here.length) {
        const end = here[here.length - 1]
        const isLast = i === r.steps.length - 1
        items.push(isLast ? destKeyPoint(end) : keyPoint(end.levelId, end.x, end.y, { pin: st.kind === 'connector' }))
        if (here[0] !== end) items.push(keyPoint(here[0].levelId, here[0].x, here[0].y))
      }
      const lm = st.landmark ? landmarkPoint(st.landmark.id, stepLevel) : null
      if (lm) items.push(keyPoint(stepLevel, lm[0], lm[1]))
      startFlight(clearOfUi(fitted, items), opts.durationMs ?? 1200, ex)
    },

    /**
     * @param {'you'|'car'|'dest'|'walker'} kind
     * @param {{levelId:string,x:number,y:number,headingDeg?:number,state?:'exact'|'estimated'|'lastSeen',elevation?:number}|null} value
     *   `elevation` (optional, metres, true scale) overrides the level height, e.g. inside a lift.
     */
    setMarker(kind, value) {
      if (!['you', 'car', 'dest', 'walker'].includes(kind)) throw new Error(`engine.setMarker: unknown kind "${kind}"`)
      if (S.failed) return
      // the destination ring stands in the corridor in front of its shop sign, never over the sign itself
      if (kind === 'dest' && value) {
        const sg = nearestShopSign(value.levelId, value.x, value.y, 6)
        // on arrival the ring stands at the doorstep, close under the sign, so both fit the arrival view
        const front = value.state === 'arrived' ? DEST_ARRIVED_FRONT_M : DEST_FRONT_M
        if (sg) value = { ...value, x: sg.x + Math.sin(sg.rotY) * front, y: sg.y - Math.cos(sg.rotY) * front }
      }
      // the car stands toward the back of its bay: the code painted at the bay mouth stays readable
      if (kind === 'car' && value && typeof value.headingDeg === 'number') {
        const h = MathUtils.degToRad(value.headingDeg)
        value = { ...value, x: value.x + Math.sin(h) * CAR_BACK_M, y: value.y + Math.cos(h) * CAR_BACK_M }
      }
      // the destination's name is placed by its marker (overlay)
      if (kind === 'dest') {
        // (on arrival the shop's own sign names it: no extra label by the ring)
        S.overlay.destAnchor = value ? { levelId: value.levelId, x: value.x, y: value.y, h: 0, noLabel: value.state === 'arrived' } : null
        // arrival: the ring alone; the route under it and beyond (to the door) is hidden
        let trim = 0
        if (value?.state === 'arrived' && S.route.route) {
          const total = S.route.totalDist()
          const d = S.route.project(value.levelId, value.x, value.y, Math.max(0, total - 12))
          trim = d != null ? Math.max(1, total - d + 1.5) : 1
        }
        S.trimEnd = trim
        S.route.setTrimEnd(trim)
      }
      S.markers.set(kind, value)
      if (kind === 'walker') {
        if (value && S.route.route) {
          // search from where the current step starts: after Next / Back the walker may be far from where it was
          const base = S.activeStep >= 0 ? S.route.stepStartDist(S.activeStep) : 0
          const hint = Math.max(base, S.walkerDist)
          const d = S.route.project(value.levelId, value.x, value.y, hint)
          if (d != null && d >= hint - 0.5 && d - hint < 40) S.walkerDist = Math.max(hint, d)
          S.route.setProgress(S.activeStep, Math.max(base, S.walkerDist))
        } else if (!value) {
          S.walkerDist = 0
          const base = S.activeStep >= 0 ? S.route.stepStartDist(S.activeStep) : 0
          S.route.setProgress(S.activeStep, base)
        }
        if (value && S.follow && S.mode !== 'stack' && value.levelId !== S.focusId && S.levels.has(value.levelId)) {
          S.focusId = value.levelId
          S.lastView = { mode: S.mode, levelId: value.levelId, fit: 'none' }
          applyVisibility()
        }
      }
      requestRender()
    },

    /**
     * Fly the camera to a point.
     * @param {{ levelId: string, x: number, y: number, distance?: number, tiltDeg?: number, headingDeg?: number }} p
     * @param {number} [durationMs]
     */
    flyTo(p, durationMs = 1200) {
      if (S.failed || !S.index || !p) return
      S.userMoved = true
      if (S.mode !== 'stack' && p.levelId && p.levelId !== S.focusId && S.levels.has(p.levelId)) {
        S.focusId = p.levelId
        S.lastView = { mode: S.mode, levelId: p.levelId, fit: 'none' }
        applyVisibility()
      }
      const ex = targetBlend(S.mode)
      const cur = currentPose()
      const def = VIEW_DEFAULTS[S.mode]
      const pose = {
        target: new Vector3(p.x, levelY(p.levelId ?? S.focusId, ex) + (p.h ?? 0), -p.y),
        distance: p.distance ?? Math.min(cur.distance, 120),
        tiltDeg: S.mode === 'top' ? def.tiltDeg : MathUtils.clamp(p.tiltDeg ?? cur.tiltDeg, TILT_MIN, TILT_MAX),
        headingDeg: p.headingDeg ?? cur.headingDeg,
        fov: def.fov,
      }
      // `clear`: map points ({ levelId, x, y, h?, pin? }) that must not end up under a control
      const items = (p.clear ?? []).map((q) => keyPoint(q.levelId ?? p.levelId, q.x, q.y, { h: q.h ?? 0, pin: Boolean(q.pin) }))
      startFlight(items.length ? clearOfUi(pose, items) : pose, durationMs, ex)
    },

    /**
     * Arrival view: fly to the shop front at a route's end, facing its sign, close enough for the sign text to
     * read (>= 18 px) and far enough to show the whole facade. Falls back to a close view of the point.
     * @param {{ levelId: string, x: number, y: number }} p  the destination (route end)
     * @param {number} [durationMs]
     * @returns {boolean} true when a sign was framed
     */
    flyToShopFront(p, durationMs = 1200) {
      if (S.failed || !S.index || !p) return false
      const L = levelOf(p.levelId)
      const best = nearestShopSign(p.levelId, p.x, p.y, 9)
      if (S.mode === 'stack') return false
      if (!best || L.level.kind === 'parking') {
        api.flyTo({ levelId: p.levelId, x: p.x, y: p.y, distance: 45, tiltDeg: 50, clear: [{ x: p.x, y: p.y, pin: true }] }, durationMs)
        return false
      }
      // the sign faces data direction (sin rotY, -cos rotY); the camera looks the opposite way
      const headingDeg = S.mode === 'top' ? currentPose().headingDeg : MathUtils.radToDeg(-best.rotY)
      const tiltDeg = S.mode === 'top' ? VIEW_DEFAULTS.top.tiltDeg : 30
      const fov = VIEW_DEFAULTS[S.mode].fov
      const { height } = viewSize()
      const { aspect } = usableAspect()
      const k = height / (2 * Math.tan(MathUtils.degToRad(fov) / 2)) // px per metre at 1 m
      // close enough for BOTH sign lines to read, whatever the screen size: the secondary line is 70 %, so it needs
      // 14 / 0.7 px (Latin) or 16 / 0.7 px (Arabic) of primary size; readableDistance works from the measured lines
      const factor = Math.cos(MathUtils.degToRad(tiltDeg))
      const strict = Math.max(MIN_TEXT_PX.en, MIN_TEXT_PX.ar) / 0.7
      const dText = L.signs?.readableDistance(best, k, factor) ?? (best.size * k * factor) / (strict * 1.08)
      const tanH = Math.tan(MathUtils.degToRad(fitFov(fov)) / 2) * aspect
      const dFit = (best.width / 2 + 2.5) / Math.max(0.05, tanH)
      // a margin under the readable limit: the camera may still pan a little to keep the ring clear of the sheet
      const dMax = dText * 0.9
      let distance = MathUtils.clamp(Math.min(dMax, Math.max(dFit, 14)), 6, 40)
      // the arrival ring on the floor in front of the door stays above the sheet, the sign below the header
      const ring = S.markers.get('dest')
      const signPos = new Vector3(best.x, levelY(p.levelId, 0) + best.h, -best.y)
      const half = () => Math.min(150, (best.width / 2) * (k / distance))
      // the sign is what must read; the ring in front of the door is shown when it fits (soft)
      const ringKey = ring && ring.levelId === p.levelId ? keyPoint(ring.levelId, ring.x, ring.y, { pin: ring.state !== 'arrived' }) : null
      const ringItem = ringKey ? { ...ringKey, soft: true } : null
      let pose = null
      for (let tries = 0; tries < 6; tries++) {
        const items = [{ p: signPos, box: [half(), 30, half(), 30] }, ringItem].filter(Boolean)
        pose = clearOfUi({ target: signPos.clone(), distance, tiltDeg, headingDeg, fov }, items)
        // the sign must stay within reading distance after that pan (both lines: CONTRACT flyToShopFront)
        const cam = probeAt(pose)
        _pv.copy(signPos).applyMatrix4(cam.matrixWorldInverse)
        const depth = -_pv.z
        if (depth > dMax * 1.02 && distance > 6) {
          distance = Math.max(6, distance * (dMax / depth))
          continue
        }
        // sign and ring not both in view yet: a little farther (still within reading distance) gives more room
        if (!blockedCountFor(pose, items) || distance >= dMax * 0.98) break
        distance = Math.min(dMax, distance * 1.12)
      }
      if (S.mode !== 'stack' && p.levelId !== S.focusId) {
        S.focusId = p.levelId
        S.lastView = { mode: S.mode, levelId: p.levelId, fit: 'none' }
        applyVisibility()
      }
      S.userMoved = true
      startFlight(pose, durationMs, targetBlend(S.mode))
      return true
    },

    /**
     * Arrival at a parking bay (find my car): look into the bay from the aisle, so the painted bay code at the bay
     * mouth is nearest the camera and upright, with the car beyond it, close enough for the painted codes to show
     * (< 25 m) and wide enough for the bay and part of each neighbour. Both stay clear of the controls.
     * @param {{ levelId: string, x: number, y: number, angleDeg?: number, w?: number, l?: number }} bay  bay centre,
     *   heading of a car driving in, width and length (metres)
     * @param {number} [durationMs]
     */
    flyToBay(bay, durationMs = 1200) {
      if (S.failed || !S.index || !bay) return
      const h = MathUtils.degToRad(bay.angleDeg ?? 0)
      const f = [Math.sin(h), Math.cos(h)]
      const w = bay.w ?? 2.5
      const l = bay.l ?? 5
      const code = [bay.x - f[0] * (l / 2 - 1.0), bay.y - f[1] * (l / 2 - 1.0)]
      const car = [bay.x + f[0] * CAR_BACK_M, bay.y + f[1] * CAR_BACK_M]
      const def = VIEW_DEFAULTS[S.mode === 'stack' ? 'floor' : S.mode]
      const { aspect } = usableAspect()
      const tanH = Math.tan(MathUtils.degToRad(fitFov(def.fov)) / 2) * aspect
      const distance = MathUtils.clamp((w + 1.2) / Math.max(0.05, tanH), 14, BAY_CODES_MAX_DIST - 1.5)
      api.flyTo(
        {
          levelId: bay.levelId,
          x: (code[0] + car[0]) / 2,
          y: (code[1] + car[1]) / 2,
          distance,
          tiltDeg: 52,
          headingDeg: bay.angleDeg ?? 0,
          clear: [
            { x: code[0], y: code[1] },
            { x: car[0], y: car[1], h: 0.8, pin: true },
          ],
        },
        durationMs,
      )
    },

    /**
     * Subscribe to taps on map items. Returns an unsubscribe function.
     * @param {(hit: { type: 'occupant'|'amenity'|'anchor'|'bay'|'connector', id: string }) => void} cb
     */
    onPick(cb) {
      S.pickCbs.add(cb)
      return () => S.pickCbs.delete(cb)
    },

    /** Programmatic pick at container pixel coordinates (tests, keyboard). */
    pickAt(sx, sy) {
      return pickAt(sx, sy)
    },

    requestRender,

    /** @returns {EngineStats} */
    getStats() {
      const info = S.renderer?.info
      return {
        drawCalls: info?.render.calls ?? 0,
        triangles: info?.render.triangles ?? 0,
        frameMs: Math.round(S.frameMs * 100) / 100,
        totalFramesRendered: S.frames,
        geometries: info?.memory.geometries ?? 0,
        textures: info?.memory.textures ?? 0,
      }
    },

    /**
     * QR plate pins for a scan sheet ("tap the plate in front of you"): true = every plate, a list of anchor kinds
     * (e.g. ['parking_pillar'] while saving the car), or null to hide them.
     * @param {true|string[]|null} kinds
     */
    setScanPins(kinds) {
      S.scanKinds = kinds === true ? true : Array.isArray(kinds) && kinds.length ? [...kinds] : null
      S.overlay.scanKinds = S.scanKinds
      requestRender()
    },

    /** True when WebGL could not start (every command is then a no-op). */
    isFailed() {
      return S.failed
    },

    /** Camera follows the walker marker (and switches the focused level with it). */
    setFollow(on) {
      S.follow = !!on
      requestRender()
    },

    /**
     * Reserve screen space used by UI (header, step card) so fits frame the free area.
     * @param {{top?:number,right?:number,bottom?:number,left?:number}} p CSS px
     */
    setViewportPadding(p) {
      S.padding = { top: p?.top ?? 0, right: p?.right ?? 0, bottom: p?.bottom ?? 0, left: p?.left ?? 0 }
      requestRender()
    },

    /**
     * Screen rectangles (container CSS px) covered by UI on top of the map: the header, map controls and
     * the top of the bottom sheet. Labels and pins never draw under them.
     * @param {Array<{x:number,y:number,w:number,h:number}>} rects
     */
    setScreenObstacles(rects) {
      S.obstacles = Array.isArray(rects) ? rects.filter((r) => r && r.w > 0 && r.h > 0) : []
      requestRender()
    },

    /**
     * Screen position (container CSS px) of a map point, for DOM overlays. null when behind the camera.
     * @param {{levelId:string,x:number,y:number,h?:number}} p
     */
    projectToScreen(p) {
      if (!S.levels.has(p.levelId)) return null
      S.camera.updateMatrixWorld()
      return projectWorld(new Vector3(p.x, levelY(p.levelId) + (p.h ?? 0), -p.y))
    },

    /** Called after every rendered frame (e.g. to move a DOM pulse). Returns an unsubscribe function. */
    onRender(cb) {
      S.renderCbs.add(cb)
      return () => S.renderCbs.delete(cb)
    },

    /**
     * Resolves when no flight runs, no frame is pending and all text has been typeset.
     * @param {number} [timeoutMs]
     */
    whenIdle(timeoutMs = 15000) {
      const start = performance.now()
      return new Promise((resolve) => {
        let stable = 0
        const check = () => {
          const busy = pendingSync.size > 0 || (S.mounted && (S.flight || S.rafId || S.needsRender))
          stable = busy ? 0 : stable + 1
          if (stable >= 3 || performance.now() - start > timeoutMs) resolve(!busy)
          else setTimeout(check, 60)
        }
        check()
      })
    },

    /** Current camera pose (for tests and deep links). */
    getCameraPose() {
      const p = currentPose()
      return { x: p.target.x, y: -p.target.z, distance: p.distance, tiltDeg: p.tiltDeg, headingDeg: p.headingDeg }
    },

    /** Read-only handles for debugging and tests (not part of the app contract). */
    get debug() {
      return {
        scene: S.scene,
        markerScene: S.markerScene,
        camera: S.camera,
        renderer: S.renderer,
        materials: S.mats,
        levels: S.levels,
        overlay: S.overlay,
        markers: S.markers,
        route: S.route,
        padding: padFor(S.blend),
        obstacles: S.obstacles,
        project: (levelId, x, y, h = 0) => projectWorld(new Vector3(x, levelY(levelId) + h, -y)),
      }
    },

    /** Free every GPU resource and the WebGL context. The instance cannot be used afterwards. */
    dispose() {
      if (S.disposed) return
      api.unmount()
      clearVenue()
      S.overlay.dispose()
      S.route.dispose()
      S.markers.dispose()
      for (const m of Object.values(S.mats)) m.dispose()
      S.atlas?.dispose()
      S.atlas = null
      S.controls?.dispose()
      S.controls = null
      if (S.renderer) {
        S.renderer.dispose()
        S.renderer.forceContextLoss()
        S.renderer = null
      }
      disposeTree(S.scene)
      disposeTree(S.markerScene)
      S.pickCbs.clear()
      S.renderCbs.clear()
      S.disposed = true
    },
  }
  return api
}

/** App-wide singleton (one renderer, one canvas). */
export const engine = createEngine()
export default engine
