/**
 * Dallni 3D map engine (CONTRACT.md §3 "src/engine/"). Plain three.js r186 + troika-three-text,
 * no React. One renderer and one canvas for the whole app (singleton `engine`); screens attach it
 * with mount()/unmount() and send commands.
 *
 * Render-on-demand: a frame is drawn only when the controls move (incl. damping), a camera flight
 * or follow animation runs, text finishes typesetting, or requestRender() is called. Idle = 0 frames.
 *
 * Art direction: v0.3 "toy world" by default (DESIGN-TOY.md): lit vertex-coloured pastel blocks with bevelled edges, a
 * hemisphere + sun light rig and soft sun shadows (Showcase quality); meaning colours (route, markers, signs) stay unlit
 * and exact. The v0.2 "storm" and v0.1 "classic" styles keep PLAN.md §19.2's unlit "architect's model".
 */
import { Color, DirectionalLight, DoubleSide, Fog, Group, HemisphereLight, MOUSE, MathUtils, Mesh, MeshBasicMaterial, MeshLambertMaterial, PCFShadowMap, PerspectiveCamera, Scene, TOUCH, Vector3, WebGLRenderer } from 'three'
// OrbitControls set up exactly like three's MapControls (one-finger pan, two-finger pinch-zoom + rotate, panning on
// the ground plane), without MapControls' mouse ray-casting: one class (and Raycaster) fewer in the engine chunk
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { configureFonts } from './fonts.js'
import { ColorRegistry, THEMES, paletteName } from './palette.js'
import { applyTheme, distToSegment, pointInPolygon, polygonCentroid, setRise } from './geometry.js'
import { PLAIN, buildEscalator, buildLiftColumn, buildParkingLevel, buildRetailLevel } from './levels.js'
import { buildBaysMesh } from './bays.js'
import { createIconAtlas } from './icons.js'
import { OverlayLayer, buildPinMesh } from './overlay.js'
import { MIN_TEXT_PX, SignLayer } from './signs.js'
import { RouteLayer } from './route.js'
import { MarkerLayer, disposeTree } from './markers.js'
import { applyPose, boxCenter, easeStandard, fitDistance, lerpPose, readPose } from './camera.js'
import { SkyLayer } from './sky.js'
import { TargetRing } from './ring.js'
import { arrivalStand, buildInterior, levelVoids } from './interior.js'
import { shadowsFor } from './quality-rules.js'

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
/** Walk view defaults (CONTRACT 3b setFpvOptions) and their clamps. */
const FPV_DEFAULTS = Object.freeze({ eyeHeightM: 1.6, fovDeg: 70, pitchDeg: -5 })
const FPV_CLAMPS = { eyeHeightM: [1.2, 2.0], fovDeg: [50, 85], pitchDeg: [-25, 5] }
/** The Walk view's eye pose written as an orbit pose: the target this far ahead of the eye (the dive lerps to it). */
const EYE_TARGET_M = 6.1
/**
 * Toy light rig intensities (DESIGN-TOY.md 3), NoToneMapping: a white roof in the sun ~1.0, in shadow ~0.46, a wall
 * facing the sun ~0.84, one facing away ~0.44 (Lambert: (hemi + sun * cos) / pi).
 */
const TOY_LIGHT = Object.freeze({ hemi: 1.6, sun: 2.1, hemiBasement: 1.25, sunBasement: 1.2 })
const bearingDeg = (ax, ay, bx, by) => MathUtils.radToDeg(Math.atan2(bx - ax, by - ay))
const angDelta = (a, b) => ((((b - a) % 360) + 540) % 360) - 180
const norm360 = (a) => ((a % 360) + 360) % 360

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
    /** scene style (CONTRACT 3c): 'toy' (v0.3 default), 'storm' (v0.2) or 'classic' (v0.1) */
    style: /** @type {'toy'|'storm'|'classic'} */ ('toy'),
    /** 3D quality (DESIGN-TOY.md 4): 'showcase' = soft sun shadows, pixel ratio up to 2; 'light' = none, up to 1.5 */
    quality: /** @type {'showcase'|'light'} */ ('showcase'),
    /** bumped on every setVenue (the shadow map is redrawn) */
    venueGen: 0,
    /** what the shadow map was last drawn for (fitSun) */
    shadowSig: '',
    /** consecutive slow frames while moving (auto-downgrade to light) */
    slowFrames: 0,
    lang: /** @type {'en'|'ar'} */ ('en'),
    mode: /** @type {'stack'|'floor'|'top'|'fpv'} */ ('stack'),
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
    sky: new SkyLayer(),
    ring: new TargetRing(),
    /** the target ring / nextTurn anchor (setNextTurn), with its distance along the shown route */
    nextTurn: null,
    /** chevron flow and ring ripple: only while on (setPathAnimating) */
    anim: { on: false, flow: 1.8, pos: 0, t: 0 },
    anchorCbs: new Set(),
    /** inside onRender / onAnchors callbacks: commands are deferred, requestRender coalesced */
    inCb: false,
    fpvOpts: { ...FPV_DEFAULTS },
    /** Walk view runtime (created on first entry) */
    fpv: null,
    /** levels drawn in the Walk view */
    fpvShown: new Set(),
    lastTap: null,
    sheenColor: { value: new Color() },
    sheenOn: { value: 1 },
    /** 0 = map views, 1 = Walk view (floor tiles, wall gradient) */
    walkU: { value: 0 },
    /** floor-to-floor height (m): wall heights above their level floor in the Walk view (true scale) */
    levelH: { value: 5.5 },
  }

  S.scene.add(S.venueRoot)
  S.scene.add(S.route.root)
  S.scene.add(S.overlay.batch)
  S.scene.add(S.sky.mesh)
  S.scene.add(S.ring.root)
  // always present (so no material recompiles when the Walk view starts); far away outside the Walk view
  S.scene.fog = new Fog(0x2a3036, 1e6, 2e6)
  S.scene.matrixWorldAutoUpdate = true
  // Markers (you, car, destination, walker) are drawn in a second pass after the depth buffer is cleared,
  // so walls, gates, glass or the floors stacked above can never hide or tint them.
  S.markerScene = new Scene()
  S.markerScene.add(S.markers.root)

  /**
   * Storm finishes on the shared materials (no extra draw calls): a glossy-floor sheen on up-facing surfaces that
   * brightens toward grazing angles, and storefront glass whose opacity rises toward grazing angles (fresnel).
   * Normals come from screen-space derivatives (the merged geometry carries none). Off in classic (uSheenOn = 0).
   * Walk view only (uWalk): faint 1.2 m floor tiles (scale and perspective cues, faded out with distance) and a
   * vertical gradient on walls (a dark skirting, darker low down, a little lighter under the ceiling lights).
   */
  const finish = (mat, glass) => {
    mat.customProgramCacheKey = () => (glass ? 'dallni-glass' : 'dallni-sheen')
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uSheen: S.sheenColor, uSheenOn: S.sheenOn, uWalk: S.walkU, uLevelH: S.levelH })
      sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      const code = glass
        ? 'if (uSheenOn > 0.5) { vec3 gn = normalize(cross(dFdx(vWP), dFdy(vWP))); diffuseColor.a = 0.30 + 0.25 * pow(1.0 - abs(dot(gn, normalize(cameraPosition - vWP))), 2.0); }'
        : `{ vec3 sn = normalize(cross(dFdx(vWP), dFdy(vWP))); vec3 sv = normalize(cameraPosition - vWP); vec2 tq = vWP.xz / 1.2; vec2 tw = fwidth(tq) + 1e-4; float w = uWalk * uSheenOn;
if (abs(sn.y) > 0.9 && sv.y > 0.0) { outgoingLight += uSheen * pow(1.0 - sv.y, 3.0) * 0.16 * uSheenOn; vec2 gl = 1.0 - smoothstep(vec2(0.012), 0.012 + tw, abs(fract(tq + 0.5) - 0.5)); outgoingLight *= 1.0 - 0.07 * w * max(gl.x, gl.y) * (1.0 - smoothstep(8.0, 22.0, distance(vWP, cameraPosition))); }
else if (abs(sn.y) < 0.2) { float h = mod(vWP.y + 0.02, uLevelH); outgoingLight *= 1.0 + w * (0.24 * smoothstep(0.1, 1.9, h) - 0.24 - 0.14 * step(h, 0.12) + 0.06 * smoothstep(2.3, 3.4, h)); } }`
      sh.fragmentShader = 'uniform vec3 uSheen;\nuniform float uSheenOn, uWalk, uLevelH;\nvarying vec3 vWP;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', code + '\n#include <opaque_fragment>')
    }
    return mat
  }

  // toy: the opaque and roof meshes are lit (Lambert, normals from MeshBuilder); everything else stays unlit
  const makeMaterials = (lit) => ({
    opaque: finish(lit ? new MeshLambertMaterial({ vertexColors: true }) : new MeshBasicMaterial({ vertexColors: true }), false),
    roofs: lit ? new MeshLambertMaterial({ vertexColors: true }) : new MeshBasicMaterial({ vertexColors: true }),
    // toy: sign faces, QR plates and zone bands, unlit so their colours stay exact (levels.js exact faces)
    exact: new MeshBasicMaterial({ vertexColors: true }),
    glass: finish(new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.38, depthWrite: false, side: DoubleSide }), true),
    // escalator balustrade panels (storm): the same glass, one-sided (they carry a face per side)
    escGlass: finish(new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.38, depthWrite: false }), true),
    // Walk view: ceiling-light halos and floor reflection streaks
    interiorGlow: new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.09, depthWrite: false }),
    decals: new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false }),
    ghost: new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false }),
    // stack view with a multi-floor route: the floors above the lowest one are see-through, so the route,
    // the car and the destination below them stay in sight
    fadeOpaque: new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false }),
    fadeGlass: new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.12, depthWrite: false, side: DoubleSide }),
    fadeDecals: new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.1, depthWrite: false }),
  })
  S.mats = makeMaterials(true)

  // toy light rig (DESIGN-TOY.md 3): sky / ground fill + a sun from the south-east, ~55 degrees high. With NoToneMapping
  // a white roof facing the sun renders at about 1.0. Basic (unlit) materials ignore it, so storm and classic are unchanged.
  S.hemi = new HemisphereLight(0xe6f4ff, 0xf3dcc5, TOY_LIGHT.hemi)
  S.sun = new DirectionalLight(0xffffff, TOY_LIGHT.sun)
  S.sun.position.set(72, 115, -10)
  // soft PCF shadows (Showcase quality, toy only: quality-rules.js); the box is refitted to the shown levels (fitSun)
  S.sun.shadow.mapSize.set(2048, 2048)
  S.sun.shadow.radius = 3
  S.sun.shadow.bias = -0.0006
  S.sun.shadow.normalBias = 0.04
  S.scene.add(S.hemi, S.sun, S.sun.target)

  /** Geometry flavour of the current style (toy: bevelled edges + normals for the lit materials). */
  const flavour = () => (S.style === 'toy' ? { bevel: 0.06, lit: true } : PLAIN)

  // text batches still typesetting (a Set, so batches of a replaced venue cannot skew the count)
  const pendingSync = new Set()
  const watchSync = (batch) => {
    batch.addEventListener('syncstart', () => {
      pendingSync.add(batch)
    })
    batch.addEventListener('synccomplete', () => {
      pendingSync.delete(batch)
      requestRender()
      // (after the lines' own sync handlers, which measure them)
      if (S.reframe && !pendingSync.size)
        setTimeout(() => {
          const rf = S.reframe
          if (!rf || pendingSync.size) return
          S.reframe = null
          const cur = S.flight ? S.flight.to : currentPose()
          if (cur.target.distanceTo(rf.to.target) < 0.01 && Math.abs(cur.distance - rf.to.distance) < 0.01) api.flyToShopFront(rf.p, 400)
        })
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
    if (S.mode === 'fpv') return S.fpvShown.has(id)
    return id === S.focusId
  }

  /** Palette of the current style and theme (classic: the v0.1 tables). */
  function pal() {
    return paletteName(S.style, S.theme)
  }

  let reducedMq = null
  function prefersReducedMotion() {
    try {
      if (!reducedMq && typeof window !== 'undefined') reducedMq = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null
      return Boolean(reducedMq?.matches)
    } catch {
      return false
    }
  }

  /** Chevron flow / ring ripple run only while asked to, mounted, with a route, on a visible page, motion allowed. */
  function animActive() {
    return S.anim.on && S.mounted && Boolean(S.route.route) && !prefersReducedMotion() && (typeof document === 'undefined' || document.visibilityState !== 'hidden')
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
  /** where the toy sun stands: south-east (three.js +x = east, +z = south), about 55 degrees high */
  const _sunDir = new Vector3(0.45, 0.8, 0.4).normalize()
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
    // from inside a frame callback: no frame of its own (it joins whatever frame is scheduled next)
    if (S.inCb) return
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
    } else if (S.controls && S.mode !== 'fpv') {
      if (S.controls.update()) animating = true
      if (clampTarget()) animating = true
    }
    if (S.mode === 'fpv') {
      if (!S.flight && stepFpv(dt, now)) animating = true
    } else if (stepFollow(dt)) animating = true
    if (animActive()) {
      S.anim.pos = (S.anim.pos + dt * S.anim.flow) % 2400
      S.anim.t += dt
      animating = true
    }
    if (S.needsRender || animating || wasFlying) render()
    if (animating) schedule()
    else if (!S.rafId) S.lastTick = 0
  }

  function updateClip() {
    const cam = S.camera
    const target = S.controls ? S.controls.target : S.flightTarget ?? new Vector3()
    const dist = cam.position.distanceTo(target)
    const eye = S.mode === 'fpv' && !S.fpv?.dive
    const near = eye ? 0.05 : MathUtils.clamp(dist * 0.035, 0.2, 40)
    const far = eye ? 300 : dist * 4 + 900
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
    const eye = S.mode === 'fpv' && !S.fpv?.dive
    const walk = walkMix()
    const pose = readPose(cam, target)

    // route width keeps >= ~11 px on screen (14 px in the stacked Overview, where it must read from afar); the glowing
    // path is measured rim to rim (0.67 of its half width); the Walk view draws it at true size (1.4 m)
    const glow = S.route.style === 'glow'
    S.route.setHalfWidth(eye ? 1.05 : (S.mode === 'stack' ? (glow ? 10.4 : 7) : glow ? 8.2 : 5.5) / ppm)
    S.route.setFrame(eye, S.anim.pos)
    S.walkU.value = walk
    // the Walk view's fog (ramped in during the dive, out during the rise)
    S.scene.fog.near = walk > 0 ? Math.exp(Math.log(3000) + (Math.log(30) - Math.log(3000)) * walk) : 1e6
    S.scene.fog.far = walk > 0 ? Math.exp(Math.log(6000) + (Math.log(140) - Math.log(6000)) * walk) : 2e6
    const nt = S.nextTurn
    const dm = S.markers.get('dest')
    // Walk view with a route and no next turn (Arrived, CONTRACT 3b setNextTurn): the whole route counts as walked,
    // however the arrival happened (the Walk view does not draw walked parts, nor the connector poles); the target ring
    // in mint stands at the doorstep (DESIGN-GLASS 5.8; the flat arrival ring is not drawn there, fpvHiddenMarkers)
    const done = S.mode === 'fpv' && !nt && Boolean(S.route.route)
    const rt = nt ?? (done && dm?.state === 'arrived' ? { levelId: dm.levelId, x: dm.x, y: dm.y, kind: 'arrive' } : null)
    const rk = S.ring.target
    if (rt?.x !== rk?.x || rt?.y !== rk?.y || rt?.kind !== rk?.kind) S.ring.set(rt)
    S.route.uniforms.uWalked.value = done ? 1e9 : S.route.walked
    const ntY = rt ? levelY(rt.levelId) : 0
    S.ring.layout({
      shown: Boolean(rt) && S.mode !== 'stack' && isVisible(rt.levelId),
      y: ntY,
      // map views: the ring keeps at least 14 px radius on screen
      scale: eye || !rt ? 1 : Math.max(1, 14 / (1.1 * pxPerMeterAt(_dir.set(rt.x, ntY, -rt.y)))),
      camera: cam,
      ripple: animActive() ? (S.anim.t / 1.6) % 1 : null,
    })
    const gap = S.stackLevels ? STACK_FOCUS_GAP_M : STACK_GAP_M
    const columnH = Math.max(5.5, 5.5 + (gap * 0.8 - 5.5) * S.blend)
    const layoutCtx = { levelY: (id) => levelY(id), isVisible, mode: S.mode, columnH, fpv: eye, ring: nt, done, rampY: eye ? (id, x, y) => markerWorldY('walker', { connectorId: id, x, y }) ?? 0 : null }
    S.route.layout(layoutCtx)

    S.markers.layout({
      levelY: (id) => levelY(id),
      isVisible,
      elevationOverride: markerWorldY,
      pxPerMeter: (p) => pxPerMeterAt(p),
      fpv: S.mode === 'fpv',
      hidden: S.mode === 'fpv' ? fpvHiddenMarkers() : null,
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
    // Walk view: names keep clear of the UI's turn bubble on top of the ring's beam (its icon, and its box above it
    // toward the inline end)
    const bs = eye && rt && isVisible(rt.levelId) ? projectWorld(new Vector3(rt.x, ntY + 2.2, -rt.y)) : null
    if (bs) reserved.push({ x: bs.sx - 24, y: bs.sy - 24, w: 48, h: 48 }, { x: S.lang === 'ar' ? bs.sx - 230 : bs.sx - 8, y: bs.sy - 72, w: 238, h: 72 })
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
      turnAt: S.nextTurn,
    })

    const r = S.renderer
    fitSun()
    if (S.sky.mesh.visible) S.sky.update(r, cam, MathUtils.degToRad(pose.headingDeg), width / height, walk)
    r.info.reset()
    r.render(S.scene, cam)
    // second pass: markers on top of everything (own depth buffer, so a marker still shades itself)
    r.autoClear = false
    r.clearDepth()
    r.render(S.markerScene, cam)
    r.autoClear = true
    S.frames++
    S.frameMs = performance.now() - t0
    // a phone too slow for Showcase while the camera moves: drop to Light once (one-way for the session)
    if (S.quality === 'showcase' && (S.flight || S.anim.on)) {
      S.slowFrames = S.frameMs > 45 ? S.slowFrames + 1 : 0
      if (S.slowFrames >= 8) {
        console.info('Dallni: switching to light 3D quality (slow frames)')
        queueMicrotask(() => api.setQuality('light'))
      }
    }
    // callbacks: commands they send run after the frame (DEFERRED), a requestRender is coalesced; anchors are pure
    // projection and never request a frame (CONTRACT 3b onAnchors)
    S.inCb = true
    try {
      for (const cb of S.renderCbs) {
        try {
          cb()
        } catch (err) {
          console.error(err)
        }
      }
      if (S.anchorCbs.size) {
        const a = computeAnchors()
        for (const cb of S.anchorCbs) {
          try {
            cb(a)
          } catch (err) {
            console.error(err)
          }
        }
      }
    } finally {
      S.inCb = false
    }
  }

  /** Device pixel ratio cap for the quality level. */
  function pixelRatio() {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    return Math.min(dpr, S.quality === 'light' ? 1.5 : 2)
  }

  /**
   * The sun's shadows (DESIGN-TOY.md 4): on only for the toy style at Showcase quality outside the stacked Overview.
   * When what is shown changes (mode, levels, stack blend, style, quality, venue, the Walk view's floor), the shadow box
   * is refitted around the shown levels and the shadow map redrawn once; a pure camera move redraws nothing.
   */
  function fitSun() {
    const on = shadowsFor(S.mode, S.style, S.quality)
    const shown = [...S.levels.values()].filter((L) => isVisible(L.id))
    const eyeLevel = S.mode === 'fpv' ? (S.fpv?.levelId ?? S.focusId) : null
    const sig = `${on}|${S.mode}|${S.blend.toFixed(3)}|${shown.map((L) => L.id).join()}|${eyeLevel}|${S.venueGen}`
    if (sig === S.shadowSig) return
    S.shadowSig = sig
    S.sun.castShadow = on
    if (!on || !shown.length) return
    // in the Walk view only the eye's own floor casts (the slab above would shade the whole floor), roofs not at all
    for (const L of S.levels.values()) {
      const cast = !eyeLevel || L.id === eyeLevel
      if (L.opaque) L.opaque.castShadow = cast
      if (L.roofs) L.roofs.castShadow = cast && !eyeLevel
    }
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const L of shown) {
      const b = L.build.bounds
      const y = levelY(L.id)
      minX = Math.min(minX, b.minX)
      maxX = Math.max(maxX, b.maxX)
      minZ = Math.min(minZ, -b.maxY)
      maxZ = Math.max(maxZ, -b.minY)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y + 6)
    }
    const c = new Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2)
    const r = Math.hypot(maxX - minX, maxZ - minZ, maxY - minY) / 2 + 4
    S.sun.target.position.copy(c)
    S.sun.position.copy(c).addScaledVector(_sunDir, 160)
    S.sun.target.updateMatrixWorld()
    S.sun.updateMatrixWorld()
    const sc = S.sun.shadow.camera
    Object.assign(sc, { left: -r, right: r, top: r, bottom: -r, near: Math.max(1, 160 - r - 10), far: 160 + r + 10 })
    sc.updateProjectionMatrix()
    if (S.renderer) S.renderer.shadowMap.needsUpdate = true
  }

  /** 0 = map views, 1 = Walk view; in between during the dive into it and the rise out of it. */
  function walkMix() {
    if (S.mode === 'fpv') return S.fpv?.dive ? (S.fpv.diveE ?? 0) : 1
    return S.flight?.fromFpv ? 1 - (S.flight.e ?? 0) : 0
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

  /**
   * Start a camera flight to `to` (and the stack blend `toBlend`).
   */
  function startFlight(to, durationMs, toBlend = S.blend) {
    resetControlsMomentum()
    const from = currentPose()
    // prefers-reduced-motion: every camera move is a cut (CONTRACT 3b)
    const dur = prefersReducedMotion() ? 0 : durationMs
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
    f.e = e
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
  // Walk view (fpv): the simulated walk at eye height inside the model (DESIGN-GLASS.md 6). A SIMULATION, not AR.
  // ------------------------------------------------------------------------------------------

  /** Vertical fov of the Walk view, reduced so the horizontal fov stays <= 80 deg on wide screens. */
  function fpvFov() {
    const { width, height } = viewSize()
    const maxV = MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(40)) / (width / height)))
    return Math.min(S.fpvOpts.fovDeg, maxV)
  }

  /** The eye (world position, compass yaw, pitch) written as an orbit pose, so flights and dives lerp to it. */
  function eyePose(pos, yaw, pitch) {
    const t = MathUtils.degToRad(pitch)
    const h = MathUtils.degToRad(yaw)
    const c = Math.cos(t) * EYE_TARGET_M
    return { target: new Vector3(pos.x + Math.sin(h) * c, pos.y + Math.sin(t) * EYE_TARGET_M, pos.z - Math.cos(h) * c), distance: EYE_TARGET_M, tiltDeg: -pitch, headingDeg: yaw, fov: fpvFov() }
  }

  function connOf(id) {
    return id ? (S.connectors.find((c) => c.conn.id === id) ?? null) : null
  }

  /**
   * Compass yaw toward the route point 5 m ahead of route distance d (anticipates corners): the walker's follow
   * camera, and the fallback for a stand with no walker (the App sends its own stand heading, DESIGN-GLASS 6.1).
   */
  function routeYaw(d, levelId, x, y) {
    const p = d == null ? null : S.route.pointAt(d + 5)
    if (!p || p.levelId !== levelId || Math.hypot(p.x - x, p.y - y) < 0.5) return null
    return bearingDeg(x, y, p.x, p.y)
  }

  /** Where the eye stands for a step with no walker: the step's start, facing along it. */
  function stepStand(i) {
    const r = S.route.route
    let k = i
    // a zero-length "Start at ..." step stands where the next one starts
    while (r.steps[k + 1] && (r.steps[k].to ?? 0) <= (r.steps[k].from ?? 0)) k++
    const pts = S.route.stepPoints(k)
    const a = pts[0]
    if (!a) return null
    const d = S.route.stepStartDist(k)
    let yaw = routeYaw(d, a.levelId, a.x, a.y)
    if (yaw == null && pts[1]) {
      const b = pts[1]
      const c = connOf(r.steps[k].connector?.id)
      const ctr = c?.conn.shaft ? polygonCentroid(c.conn.shaft) : null
      if (Math.hypot(b.x - a.x, b.y - a.y) > 0.5) yaw = bearingDeg(a.x, a.y, b.x, b.y)
      else if (ctr) yaw = bearingDeg(a.x, a.y, ctr[0], ctr[1])
    }
    return { levelId: a.levelId, x: a.x, y: a.y, yaw: yaw ?? S.fpv.yaw }
  }

  /** Nothing to follow: the you marker, else the chosen step's start, else the route start, else the default anchor. */
  function restPose(levelId) {
    const r = S.route.route
    const you = S.markers.get('you')
    const st = r && S.activeStep >= 1 ? stepStand(S.activeStep) : null
    if (st) return st
    if (you && S.levels.has(you.levelId)) {
      const d = r ? S.route.locate(you.levelId, you.x, you.y) : null
      return { levelId: you.levelId, x: you.x, y: you.y, yaw: routeYaw(d, you.levelId, you.x, you.y) ?? you.headingDeg ?? S.fpv.yaw }
    }
    const st0 = r ? stepStand(0) : null
    if (st0) return st0
    const an = S.index.anchorById.get(S.index.venue.meta?.defaultStartAnchorId)
    if (an && S.levels.has(an.levelId)) return { levelId: an.levelId, x: an.point[0], y: an.point[1], yaw: an.facingDeg ?? 0 }
    const n = [...S.index.nodeById.values()].find((nd) => nd.levelId === (levelId ?? S.focusId))
    return { levelId: n?.levelId ?? S.focusId, x: n?.point[0] ?? 0, y: n?.point[1] ?? 0, yaw: 0 }
  }

  const walkerKey = (w) => (w ? `${w.levelId}|${w.x.toFixed(3)}|${w.y.toFixed(3)}` : '')

  /** What the eye aims for this frame: { levelId, x, y, fy (floor world y), yaw, pitch, ride?, cutRide? }. */
  function fpvGoal() {
    const F = S.fpv
    const o = S.fpvOpts
    const w = S.markers.get('walker')
    if (w && !F.hold && S.levels.has(w.levelId)) {
      const c = connOf(w.connectorId)
      if (c && c.kind === 'escalator' && c.inVoid) {
        // ride the ramp; look up the escalator going up (about +5 deg), further down going down
        const up = c.conn.direction !== 'down'
        return { levelId: w.levelId, x: w.x, y: w.y, fy: markerWorldY('walker', w) ?? levelY(w.levelId), yaw: w.headingDeg ?? F.yaw, pitch: o.pitchDeg + (up ? 0.5 : -0.3) * c.slopeDeg, ride: c }
      }
      if (c) {
        // lift / stairs: no vertical slide through floors; face the doors until the cut at the exit stop
        if (!F.rideAt || F.cutRide !== c) F.rideAt = { levelId: w.levelId, x: w.x, y: w.y }
        const at = F.rideAt
        const ctr = c.conn.shaft ? polygonCentroid(c.conn.shaft) : null
        let yaw = c.conn.doorFacingDeg != null ? c.conn.doorFacingDeg + 180 : F.yaw
        if (ctr && Math.hypot(ctr[0] - at.x, ctr[1] - at.y) > 0.5) yaw = bearingDeg(at.x, at.y, ctr[0], ctr[1])
        return { levelId: at.levelId, x: at.x, y: at.y, fy: levelY(at.levelId), yaw, pitch: o.pitchDeg, cutRide: c }
      }
      const yaw = routeYaw(S.walkerDist, w.levelId, w.x, w.y) ?? w.headingDeg ?? F.yaw
      return { levelId: w.levelId, x: w.x, y: w.y, fy: levelY(w.levelId), yaw, pitch: o.pitchDeg }
    }
    const h = F.hold ?? (F.rest ??= restPose())
    return { ...h, fy: levelY(h.levelId), pitch: h.pitch ?? o.pitchDeg }
  }

  /** Levels drawn in the Walk view: the eye's level, the adjacent retail levels (seen through voids), the ride's. */
  function updateFpvLevels() {
    const F = S.fpv
    const L = levelOf(F.levelId)
    const set = new Set()
    if (L) {
      set.add(L.id)
      if (L.level.kind === 'retail') for (const M of S.levels.values()) if (M.level.kind === 'retail' && Math.abs(M.level.ordinal - L.level.ordinal) === 1) set.add(M.id)
    }
    if (F.rideConn) set.add(F.rideConn.lowStop.levelId).add(F.rideConn.highStop.levelId)
    for (const id of set) ensureInterior(levelOf(id))
    S.fpvShown = set
    applyVisibility()
  }

  /** Walk-view-only geometry of a level (ceiling, bulkheads, light panels), built on first use. */
  function ensureInterior(L) {
    if (!L || L.interior) return
    const lv = S.index.levels
    const above = lv[lv.findIndex((l) => l.id === L.id) + 1]
    // the floor below an atrium looks up through it; the top floor's own voids are a skylight
    const b = buildInterior(S.index, L.level, S.registry, levelVoids(S.index, above ? above.id : L.id), flavour())
    const grp = new Group()
    grp.name = 'interior-' + L.id
    const ceiling = addThemedMesh(b.solid, S.mats.opaque, grp, 'ceiling-' + L.id)
    // the Walk view's ceiling never casts: the sun would put the whole floor in its shadow
    if (ceiling) ceiling.castShadow = false
    addThemedMesh(b.glow, S.mats.interiorGlow, grp, 'lights-' + L.id, 4)
    grp.visible = S.mode === 'fpv'
    L.content.add(grp)
    L.interior = grp
  }

  function fpvHiddenMarkers() {
    const F = S.fpv
    const hide = new Set(['walker'])
    // one marker per turn (DESIGN-GLASS 6.5): the target ring (and the bubble on its beam) marks the destination on the
    // last step and on arrival, so the destination pin / flat ring is not drawn as well
    const dm = S.markers.get('dest')
    const nt = S.nextTurn
    if (dm && (dm.state === 'arrived' || (nt?.kind === 'arrive' && nt.levelId === dm.levelId && Math.hypot(nt.x - dm.x, nt.y - dm.y) < 5))) hide.add('dest')
    const you = S.markers.get('you')
    if (you && F && you.levelId === F.levelId && Math.hypot(you.x - F.pos.x, you.y + F.pos.z) < 1.2) hide.add('you')
    return hide
  }

  /** Stand somewhere (flyTo, arrival framing, a step with no walker): glide there, then hold until the walker moves. */
  function fpvHoldAt(h, durationMs) {
    const F = S.fpv
    F.hold = h
    F.holdWalker = walkerKey(S.markers.get('walker'))
    const dur = prefersReducedMotion() ? 0 : durationMs
    if (dur > 0 && S.mounted) F.glide = { pos: F.pos.clone(), yaw: F.yaw, pitch: F.pitch, start: performance.now(), dur }
    else F.snap = true
    requestRender()
  }

  /**
   * Arrival in the Walk view (DESIGN-GLASS 6.3): on the sign's normal 8 m out (more for a sign wider than the view),
   * facing it; when the corridor in front is narrower (a shop facing the atrium void), turned along the corridor to
   * where the stand gets furthest (interior.arrivalStand); its centre at 25 % of the free area's height (the free area
   * ends at the Arrived sheet), so the arrival ring at the doorstep shows above the sheet, 900 ms.
   */
  function fpvShopFront(p, sign, durationMs) {
    const F = S.fpv
    const dur = durationMs === 0 ? 0 : 900
    if (!sign || levelOf(p.levelId)?.level.kind === 'parking') {
      fpvHoldAt({ levelId: p.levelId, x: p.x, y: p.y, yaw: F.yaw }, dur)
      return false
    }
    const fov = fpvFov()
    const { width, height } = viewSize()
    const tanV = Math.tan(MathUtils.degToRad(fov) / 2)
    const st = arrivalStand(S.index, p.levelId, sign, Math.max(8, sign.width / (2 * tanV * (width / height)) + 0.5))
    const freeH = Math.max(50, height - S.padding.top - S.padding.bottom)
    const el = MathUtils.radToDeg(Math.atan2(sign.h - S.fpvOpts.eyeHeightM, st.d))
    const pitch = MathUtils.clamp(el - MathUtils.radToDeg(Math.atan2(0.25 * freeH, height / 2 / tanV)), -25, 30)
    fpvHoldAt({ levelId: p.levelId, x: st.x, y: st.y, yaw: bearingDeg(st.x, st.y, sign.x, sign.y), pitch }, dur)
    return true
  }

  function enterFpv(view, opts) {
    const from = currentPose()
    const fromMap = S.mode !== 'fpv'
    S.flight = null
    resetControlsMomentum()
    if (!S.fpv) S.fpv = { pos: new Vector3(), yaw: from.headingDeg, pitch: S.fpvOpts.pitchDeg, lookYaw: 0, lookPitch: 0, lookFrom: [0, 0], lookRelease: 0 }
    const F = S.fpv
    if (fromMap) {
      F.mapPose = from
      Object.assign(F, { hold: null, glide: null, rest: null, lookYaw: 0, lookPitch: 0, recenter: null, cutRide: null, rideAt: null })
      if (!S.markers.get('walker')) F.rest = restPose(view?.levelId)
    }
    S.mode = 'fpv'
    if (S.controls) S.controls.enabled = false
    const g = fpvGoal()
    F.levelId = g.levelId
    F.rideConn = g.ride ?? null
    S.focusId = g.levelId
    S.lastView = { mode: 'fpv', levelId: g.levelId, fit: 'none' }
    updateFpvLevels()
    F.pos.set(g.x, g.fy + S.fpvOpts.eyeHeightM, -g.y)
    F.yaw = g.yaw
    F.pitch = g.pitch
    const dur = prefersReducedMotion() ? 0 : (opts?.durationMs ?? 1100)
    if (fromMap && dur > 0 && S.mounted) F.dive = { from, blend: S.blend, start: performance.now(), dur }
    else {
      F.dive = null
      S.blend = 0
      applyLayout()
      F.snap = true
    }
    requestRender()
  }

  /** Leave the Walk view (the caller starts the rise to the map pose). */
  function exitFpv() {
    const F = S.fpv
    F.dive = null
    F.glide = null
    if (S.controls) S.controls.enabled = true
  }

  /** Map pose to rise to when leaving the Walk view without a fit: over the walker, route-up, the last map distance. */
  function risePose(mode, levelId) {
    const F = S.fpv
    const def = VIEW_DEFAULTS[mode]
    const mp = F.mapPose
    return {
      target: new Vector3(F.pos.x, levelY(levelId, targetBlend(mode)), F.pos.z),
      distance: MathUtils.clamp(mp?.distance ?? 115, 40, 140),
      tiltDeg: mode === 'top' ? def.tiltDeg : MathUtils.clamp(mp?.tiltDeg ?? 52, TILT_MIN, TILT_MAX),
      headingDeg: F.yaw + F.lookYaw,
      fov: def.fov,
    }
  }

  /**
   * One Walk view frame: follow the walker (position tau 120 ms, heading tau 250 ms capped at 90 deg/s, aiming 5 m
   * ahead), escalator pitch ease, lift / stairs cut, glides, the dive, and the look-around offsets.
   * @returns {boolean} still moving
   */
  function stepFpv(dt, now) {
    const F = S.fpv
    if (!F) return false
    const g = fpvGoal()
    const wasCut = F.cutRide
    F.cutRide = g.cutRide ?? null
    if (!F.cutRide) F.rideAt = null
    // never a camera slide through floors (DESIGN-GLASS 6.4): a jump to another level outside a ride (Next step,
    // a step glide) or of more than 3 m (a walker seek) is a cut
    const levelJump = F.levelId != null && g.levelId !== F.levelId && !g.ride && !F.rideConn
    if (g.levelId !== F.levelId || (g.ride ?? null) !== F.rideConn) {
      F.levelId = g.levelId
      F.rideConn = g.ride ?? null
      S.focusId = g.levelId
      S.lastView = { mode: 'fpv', levelId: g.levelId, fit: 'none' }
      updateFpvLevels()
      S.route.setCurrentLevel(routeCurrentLevel())
    }
    const eye = new Vector3(g.x, g.fy + S.fpvOpts.eyeHeightM, -g.y)
    const cut = (wasCut && !F.cutRide) || (!F.dive && (levelJump || (!F.glide && eye.distanceToSquared(F.pos) > 9)))
    let moving = false
    if (F.glide && !cut) {
      const gl = F.glide
      const t = Math.min(1, (now - gl.start) / gl.dur)
      const e = easeStandard(t)
      F.pos.lerpVectors(gl.pos, eye, e)
      F.yaw = gl.yaw + angDelta(gl.yaw, g.yaw) * e
      F.pitch = gl.pitch + (g.pitch - gl.pitch) * e
      if (t >= 1) F.glide = null
      moving = true
    } else if (cut || F.dive || F.snap) {
      F.glide = null
      F.snap = false
      F.pos.copy(eye)
      F.yaw = g.yaw
      F.pitch = g.pitch
    } else {
      const dp = eye.clone().sub(F.pos)
      const dy = angDelta(F.yaw, g.yaw)
      const dpi = g.pitch - F.pitch
      if (dp.lengthSq() > 4e-6 || Math.abs(dy) > 0.02 || Math.abs(dpi) > 0.02) {
        F.pos.addScaledVector(dp, 1 - Math.exp(-dt / 0.12))
        F.yaw += MathUtils.clamp(dy * (1 - Math.exp(-dt / 0.25)), -90 * dt, 90 * dt)
        F.pitch += dpi * (1 - Math.exp(-dt / 0.2))
        moving = true
      } else {
        F.pos.copy(eye)
        F.yaw = g.yaw
        F.pitch = g.pitch
      }
    }
    F.yaw = norm360(F.yaw)
    // look-around: double-tap recentres; while the walk plays the offsets ease back 1.5 s after the finger lifts
    if (F.recenter) {
      const t = Math.min(1, (now - F.recenter.start) / 300)
      const k = 1 - easeStandard(t)
      F.lookYaw = F.recenter.from[0] * k
      F.lookPitch = F.recenter.from[1] * k
      if (t >= 1) F.recenter = null
      moving = true
    } else if (!F.drag && S.anim.on && (F.lookYaw || F.lookPitch)) {
      const t = (now - F.lookRelease - 1500) / 600
      const k = t >= 1 ? 0 : 1 - easeStandard(Math.max(0, t))
      F.lookYaw = F.lookFrom[0] * k
      F.lookPitch = F.lookFrom[1] * k
      moving = true
    }
    const pose = eyePose(F.pos, F.yaw + F.lookYaw, MathUtils.clamp(F.pitch + F.lookPitch, -60, 60))
    if (F.dive) {
      const t = Math.min(1, (now - F.dive.start) / F.dive.dur)
      const e = easeStandard(t)
      F.diveE = e
      S.blend = F.dive.blend * (1 - e)
      applyLayout()
      setPoseNow(lerpPose(F.dive.from, pose, e))
      if (t >= 1) F.dive = null
      moving = true
    } else setPoseNow(pose)
    return moving
  }

  // ------------------------------------------------------------------------------------------
  // anchors (CONTRACT 3b): projection only, after a rendered frame, never a frame of their own
  // ------------------------------------------------------------------------------------------

  function computeAnchors() {
    const cam = S.camera
    const { width, height } = viewSize()
    const fpv = S.mode === 'fpv'
    // "inside the free viewport" = the canvas minus setViewportPadding (CONTRACT 3b)
    const pad = S.padding
    const pose = currentPose()
    const heading = norm360(pose.headingDeg)
    const camX = cam.position.x
    const camY = -cam.position.z
    const w = S.markers.get('walker')
    const routeOn = Boolean(S.route.route)
    // along the route from the walker; in the Walk view with no walker, from where the eye stands (stepping through)
    const F = fpv && !w ? S.fpv : null
    const wd = w ? S.walkerDist : routeOn && F ? (S.route.locate(F.levelId, F.pos.x, -F.pos.z, S.route.stepStartDist(S.activeStep)) ?? 0) : 0
    const v = new Vector3()
    const proj = (x, h, y) => {
      v.set(x, h, -y).applyMatrix4(cam.matrixWorldInverse)
      const depth = -v.z
      v.applyMatrix4(cam.projectionMatrix)
      return { sx: (v.x * 0.5 + 0.5) * width, sy: (1 - (v.y * 0.5 + 0.5)) * height, depth }
    }
    const point = (levelId, x, y, routeD) => {
      if (!S.levels.has(levelId)) return { x: null, y: null, floorX: null, floorY: null, visible: false, behind: true, relBearingDeg: 0, distanceM: 0, levelId }
      const ly = levelY(levelId)
      const top = proj(x, ly + 2.2, y)
      const fl = proj(x, ly + 0.05, y)
      const behind = top.depth <= 0
      let distanceM
      if (routeOn && routeD != null) distanceM = Math.max(0, routeD - wd)
      else {
        const from = w ?? S.markers.get('you') ?? { x: pose.target.x, y: -pose.target.z }
        distanceM = Math.hypot(x - from.x, y - from.y)
      }
      return {
        x: top.sx,
        y: top.sy,
        floorX: fl.sx,
        floorY: fl.sy,
        visible: !behind && isVisible(levelId) && top.sx >= pad.left && top.sx <= width - pad.right && top.sy >= pad.top && top.sy <= height - pad.bottom,
        behind,
        relBearingDeg: angDelta(heading, bearingDeg(camX, camY, x, y)),
        distanceM,
        levelId,
      }
    }
    const nt = S.nextTurn
    const dm = S.markers.get('dest')
    const last = S.route.route?.points.at(-1)
    const total = S.route.totalDist()
    let walker = null
    if (w) {
      const s = fpv ? null : proj(w.x, (markerWorldY('walker', w) ?? levelY(w.levelId)) + 0.3, w.y)
      walker = { x: s ? s.sx : null, y: s ? s.sy : null, visible: Boolean(s && s.depth > 0 && isVisible(w.levelId)), headingDeg: w.headingDeg ?? 0, levelId: w.levelId, mapX: w.x, mapY: w.y }
    }
    return {
      frame: S.frames,
      mode: S.mode,
      camera: { headingDeg: heading, pitchDeg: -pose.tiltDeg, fovDeg: cam.fov },
      nextTurn: nt ? point(nt.levelId, nt.x, nt.y, nt.routeD) : null,
      destination: dm ? point(dm.levelId, dm.x, dm.y, routeOn ? total : null) : last ? point(last.levelId, last.x, last.y, total) : null,
      walker,
    }
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
        for (const m of c.parts) setRise(m.geometry, rise)
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
      if (c.arrows) c.arrows.visible = S.mode !== 'fpv'
      else c.group.visible = S.mode === 'stack' && c.stops.filter((st) => isVisible(st.levelId)).length >= 2
    }
    // floor view cuts the roofs away so storefronts and interiors read; stack/top keep them; the Walk view has its
    // own ceilings instead
    for (const L of S.levels.values()) {
      if (L.roofs) L.roofs.visible = S.mode !== 'floor' && S.mode !== 'fpv'
      if (L.interior) L.interior.visible = S.mode === 'fpv'
      // QR floor tiles read as smears seen edge-on from eye height
      if (L.plates) L.plates.visible = S.mode !== 'fpv'
    }
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
    if (L.plates) L.plates.material = L.opaque?.material ?? S.mats.opaque
    if (L.exact) L.exact.material = faded ? S.mats.fadeOpaque : S.mats.exact
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
    const P = pal()
    const T = THEMES[P]
    for (const g of S.themedGeometries) applyTheme(g, P)
    for (const L of S.levels.values()) {
      if (L.bays) L.bays.userData.setTheme(P)
      if (L.floorTexts) L.floorTexts.setTextColor(T.floorPaint)
    }
    S.route.setTheme(P)
    S.markers.setTheme(P)
    S.ring.setPalette(P)
    S.sky.setPalette(P)
    const toy = S.style === 'toy'
    S.sky.mesh.visible = S.style === 'storm'
    S.sheenColor.value.set(T.sheen)
    // toy keeps the Walk view's floor tiles and wall gradient, with a faint white sheen
    S.sheenOn.value = S.style === 'classic' ? 0 : 1
    for (const c of S.connectors) if (c.panels) c.panels.material = S.style === 'classic' ? S.mats.opaque : S.mats.escGlass
    S.scene.fog.color.set(T.fog)
    // zone colours stay the paint's; on the dark storm asphalt a lighter wash keeps them from flooding the floor
    S.mats.decals.opacity = S.style === 'storm' ? 0.2 : toy ? 0.35 : 0.3
    // toy light rig: a softer light on the parking levels (dusk palette)
    S.hemi.visible = S.sun.visible = toy
    S.hemi.intensity = S.theme === 'basement' ? TOY_LIGHT.hemiBasement : TOY_LIGHT.hemi
    S.sun.intensity = S.theme === 'basement' ? TOY_LIGHT.sunBasement : TOY_LIGHT.sun
    S.overlay.setColors({ text: T.labelText, halo: T.labelHalo, badgeText: T.badgeText, badgeHalo: T.badgeHalo, badgeW: T.badgeW })
    if (S.renderer) S.renderer.domElement.style.background = `linear-gradient(180deg, ${T.bgTop} 0%, ${T.bgBottom} 100%)`
  }

  function clearVenue() {
    S.flight = null
    S.reframe = null
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
      for (const m of c.parts) m.geometry.dispose()
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
    S.nextTurn = null
    S.ring.set(null)
    S.fpvShown = new Set()
    if (S.fpv) Object.assign(S.fpv, { hold: null, glide: null, dive: null, levelId: null, rideConn: null, cutRide: null, rideAt: null })
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
    const g = builder.build(pal())
    S.themedGeometries.push(g)
    const mesh = new Mesh(g, material)
    mesh.name = name
    mesh.renderOrder = renderOrder
    // lit (toy) meshes cast and take the sun's soft shadows (fitSun decides when the sun casts)
    mesh.castShadow = mesh.receiveShadow = Boolean(material.isMeshLambertMaterial)
    parent.add(mesh)
    return mesh
  }

  function buildLevel(level) {
    const build = level.kind === 'parking' ? buildParkingLevel(S.index, level, S.registry, flavour()) : buildRetailLevel(S.index, level, S.registry, flavour())
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
    L.plates = addThemedMesh(build.plates, S.mats.opaque, content, 'plates-' + level.id)
    L.exact = addThemedMesh(build.exact, S.mats.exact, content, 'exact-' + level.id)
    addThemedMesh(build.ghost, S.mats.ghost, ghostGroup, 'ghost-' + level.id, 1)
    if (build.bays.length) {
      L.bays = buildBaysMesh(build.bays, pal())
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
    if (L.floorTexts) L.floorTexts.setTextColor(THEMES[pal()].floorPaint)
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
      let e = null
      let material = S.mats.opaque
      if (conn.type === 'escalator') {
        e = buildEscalator(conn, S.registry, { elevLow: elev(lowStop), elevHigh: elev(highStop), lowStop, highStop }, flavour())
        builder = e.deck
      } else if (conn.type === 'lift' && Array.isArray(conn.shaft)) {
        builder = buildLiftColumn(conn, S.registry, flavour())
        material = S.mats.glass
      }
      if (!builder || builder.isEmpty) continue
      const g = builder.build(pal())
      S.themedGeometries.push(g)
      const mesh = new Mesh(g, material)
      mesh.name = 'connector-' + conn.id
      mesh.renderOrder = conn.type === 'lift' ? 2 : 0
      const group = new Group()
      group.name = 'connector-' + conn.id
      group.add(mesh)
      // escalators: balustrade panels (glass in storm, opaque in classic: applyThemeAll) and the painted arrows (map
      // views only: applyVisibility)
      const part = (b, order) => {
        if (!b || b.isEmpty) return null
        const m = new Mesh(b.build(pal()), S.mats.opaque)
        S.themedGeometries.push(m.geometry)
        m.renderOrder = order
        group.add(m)
        return m
      }
      const panels = part(e?.panels, 2)
      const arrows = part(e?.arrows, 0)
      S.venueRoot.add(group)
      const entry = { conn, kind: conn.type, group, mesh, panels, arrows, parts: [mesh, panels, arrows].filter(Boolean), stops, lowStop, highStop, elevLow: elev(lowStop), elevHigh: elev(highStop), rise: -1, inVoid: false, slopeDeg: 0 }
      if (conn.type === 'escalator') {
        // the Walk view rides an escalator only when its ramp runs inside the upper floor's void (no slab or ceiling
        // can cut through the camera); otherwise it is treated like the stairs (a cut under the UI's card)
        const a = lowStop.point
        const b = highStop.point
        const len = Math.hypot(b[0] - a[0], b[1] - a[1])
        const landing = Math.min(1.4, len * 0.15)
        const voids = levelVoids(S.index, highStop.levelId)
        const near = (p, v) => pointInPolygon(p, v) || v.some((q, i) => distToSegment(p, q, v[(i + 1) % v.length]) < 0.3)
        entry.inVoid = voids.length > 0
        for (let k = 0; k <= 4; k++) {
          const f = (landing + ((len - 2 * landing) * k) / 4) / Math.max(1e-6, len)
          const p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
          if (!voids.some((v) => near(p, v))) entry.inVoid = false
        }
        entry.slopeDeg = MathUtils.radToDeg(Math.atan2(entry.elevHigh - entry.elevLow, Math.max(1, len - 2 * landing)))
      }
      S.connectors.push(entry)
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
    const fpv = S.mode === 'fpv'
    // Walk view: a shop's sign (and a lift's or entrance's) is what the finger lands on
    if (fpv) {
      const idx = S.index
      for (const sg of levelOf(S.focusId)?.build.signs ?? []) {
        const id = sg.refId
        const s = id && !sg.flat ? projectWorld(v.set(sg.x, levelY(S.focusId) + sg.h, -sg.y)) : null
        if (s) consider(idx.occupantById.has(id) ? 'occupant' : idx.amenityById.has(id) ? 'amenity' : idx.connectorById.has(id) ? 'connector' : 'anchor', id, s.sx, s.sy)
      }
    }
    for (const p of S.pickables) {
      if (!isVisible(p.levelId)) continue
      if (fpv && (p.levelId !== S.focusId || Math.hypot(p.x - S.camera.position.x, p.y + S.camera.position.z) > 40)) continue
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
    const levels = [...S.levels.values()].filter((L) => isVisible(L.id) && (!fpv || L.id === S.focusId)).sort((a, b) => b.level.ordinal - a.level.ordinal)
    for (const L of levels) {
      for (const pp of S.pickPolygons) {
        if (pp.levelId !== L.id) continue
        const hit = groundAt(S.camera, sx, sy, levelY(L.id) + pp.h)
        if (hit && pointInPolygon([hit.x, -hit.z], pp.polygon)) return { type: pp.type, id: pp.id }
      }
    }
    return null
  }

  /** A Walk view look-around drag ends (however the gesture ended): the offsets stay (paused) or ease back (playing). */
  function endLook() {
    const F = S.fpv
    if (!F?.drag) return
    F.drag = false
    F.lookRelease = performance.now()
    F.lookFrom = [F.lookYaw, F.lookPitch]
    requestRender()
  }

  function onPointerDown(e) {
    cancelFlight()
    S.userMoved = true
    if (!e.isPrimary) {
      endLook()
      S.pointer = null
      return
    }
    S.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), multi: false, drag: false }
  }

  function onPointerUp(e) {
    const p = S.pointer
    S.pointer = null
    endLook()
    if (!p || p.id !== e.pointerId || p.multi || p.drag) return
    const now = performance.now()
    const F = S.mode === 'fpv' ? S.fpv : null
    if (now - p.t > 600) return
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) return
    if (F) {
      const lt = S.lastTap
      if (lt && now - lt.t < 320 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 30) {
        // double-tap recentres the view
        S.lastTap = null
        F.recenter = { start: now, from: [F.lookYaw, F.lookPitch] }
        requestRender()
        return
      }
      S.lastTap = { t: now, x: e.clientX, y: e.clientY }
    }
    const rect = S.renderer.domElement.getBoundingClientRect()
    const hit = pickAt(e.clientX - rect.left, e.clientY - rect.top)
    if (hit) for (const cb of S.pickCbs) cb(hit)
  }

  function onPointerMoveOther(e) {
    const p = S.pointer
    if (!p) return
    if (e.pointerId !== p.id) {
      p.multi = true
      endLook()
      return
    }
    const F = S.mode === 'fpv' ? S.fpv : null
    if (!F || p.multi) return endLook()
    // Walk view: one-finger drag looks around (0.25 deg/px yaw, 0.2 deg/px pitch); no pan, no zoom, no inertia
    if (!p.drag && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) p.drag = F.drag = true
    if (p.drag) {
      F.recenter = null
      const yaw = F.lookYaw - (e.clientX - p.lx) * 0.25
      F.lookYaw = S.anim.on ? MathUtils.clamp(yaw, -100, 100) : angDelta(0, yaw)
      F.lookPitch = MathUtils.clamp(F.lookPitch + (e.clientY - p.ly) * 0.2, -25, 25)
      requestRender()
    }
    p.lx = e.clientX
    p.ly = e.clientY
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') requestRender()
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
        // the sun's shadow map is redrawn only when the scene changes (fitSun), never on a pure camera move
        S.renderer.shadowMap.enabled = true
        S.renderer.shadowMap.type = PCFShadowMap
        S.renderer.shadowMap.autoUpdate = false
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
        // a deep link can enter the Walk view before the canvas mounts: no orbit / pan / zoom there (CONTRACT 3b)
        S.controls.enabled = S.mode !== 'fpv'
        S.controls.addEventListener('change', requestRender)
        S.controls.addEventListener('start', () => {
          cancelFlight()
          S.userMoved = true
        })
        el.addEventListener('pointerdown', onPointerDown)
        el.addEventListener('pointerup', onPointerUp)
        el.addEventListener('pointermove', onPointerMoveOther)
        el.addEventListener('pointercancel', () => {
          endLook()
          S.pointer = null
        })
        el.addEventListener('wheel', onWheel, { passive: true })
        // the cloud texture lives in a render target: after a context loss it comes back empty, draw it again
        el.addEventListener('webglcontextrestored', () => {
          S.sky.invalidate()
          requestRender()
        })
        // the chevron flow pauses on a hidden page and resumes when it shows again
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)
        applyControlLimits()
        applyThemeAll()
      }
      S.renderer.setPixelRatio(pixelRatio())
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
        if (!S.userMoved && S.lastView && S.index && S.mode !== 'fpv') {
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
      S.levelH.value = floorToFloor()
      S.venueGen++
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
      if (view?.mode === 'fpv') {
        enterFpv(view, opts)
        return
      }
      const leaving = S.mode === 'fpv'
      if (leaving) exitFpv()
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
      if (fit === 'none' && leaving) pose = risePose(mode, levelId)
      else if (fit === 'none') {
        const cur = currentPose()
        pose = { ...cur, target: new Vector3(cur.target.x, levelY(levelId, toBlend), cur.target.z), fov: VIEW_DEFAULTS[mode].fov }
        if (mode === 'top') pose.tiltDeg = VIEW_DEFAULTS.top.tiltDeg
        else pose.tiltDeg = MathUtils.clamp(pose.tiltDeg, TILT_MIN, TILT_MAX)
      } else {
        pose = viewPose(mode, levelId, fit)
      }
      startFlight(pose, opts.durationMs ?? 1200, toBlend)
      // the rise out of the Walk view: fog and the sky dome fade out with it
      if (leaving && S.flight) S.flight.fromFpv = true
    },

    /** @returns {{ mode: string, levelId: string|null, blend: number, stackLevels: string[]|null }} */
    getView() {
      if (S.mode === 'fpv') return { mode: 'fpv', levelId: S.focusId, blend: 0, stackLevels: null }
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
      if (!route) api.setNextTurn(null)
      else if (S.nextTurn) S.nextTurn.routeD = S.route.locate(S.nextTurn.levelId, S.nextTurn.x, S.nextTurn.y)
      if (S.fpv) S.fpv.rest = null
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
      if (S.mode === 'fpv') {
        // Walk view: no map flight; with no walker the eye glides to the step's start, facing along it
        S.fpv.rest = null
        S.route.setCurrentLevel(routeCurrentLevel())
        if (i >= 0 && opts.fly !== false && !S.markers.get('walker')) {
          const h = stepStand(i)
          if (h) fpvHoldAt(h, opts.durationMs ?? 900)
        }
        requestRender()
        return
      }
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
      const F = S.mode === 'fpv' ? S.fpv : null
      if (F && kind === 'walker') {
        // a held pose (arrival framing, flyTo) lasts until the walker moves again; a walker that goes away leaves
        // the eye where it stands
        if (value && F.hold && walkerKey(value) !== F.holdWalker) F.hold = null
        if (!value && S.markers.get('walker')) F.hold = { levelId: F.levelId, x: F.pos.x, y: -F.pos.z, yaw: F.yaw, pitch: F.pitch }
      }
      if (F && kind === 'you') F.rest = null
      S.markers.set(kind, value)
      if (kind === 'walker') {
        if (value && S.route.route) {
          // search from where the current step starts: after Next / Back the walker may be far from where it was
          const base = S.activeStep >= 0 ? S.route.stepStartDist(S.activeStep) : 0
          const hint = Math.max(base, S.walkerDist)
          const d = S.route.project(value.levelId, value.x, value.y, hint, value.connectorId)
          if (d != null && d >= hint - 0.5 && d - hint < 40) S.walkerDist = Math.max(hint, d)
          S.route.setProgress(S.activeStep, Math.max(base, S.walkerDist))
        } else if (!value) {
          S.walkerDist = 0
          const base = S.activeStep >= 0 ? S.route.stepStartDist(S.activeStep) : 0
          S.route.setProgress(S.activeStep, base)
        }
        if (value && S.follow && S.mode !== 'stack' && S.mode !== 'fpv' && value.levelId !== S.focusId && S.levels.has(value.levelId)) {
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
      if (S.mode === 'fpv') {
        // Walk view: the eye moves to the point, facing headingDeg when given
        const lid = p.levelId && S.levels.has(p.levelId) ? p.levelId : S.fpv.levelId
        fpvHoldAt({ levelId: lid, x: p.x, y: p.y, yaw: p.headingDeg ?? S.fpv.yaw }, durationMs)
        return
      }
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
      if (S.mode === 'fpv') return fpvShopFront(p, best, durationMs)
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
      // the text is what must read (on a 360 px phone the whole sign box can be wider than the gap between the View
      // control and the level picker)
      const ink = L.signs?.inkWidth(best) ?? null
      const textW = Math.min(best.width, ink ?? best.width)
      const half = () => Math.min(150, (textW / 2) * (k / distance))
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
      // the sign's text is not typeset yet (a deep link right after loading): frame it again once it is measured,
      // unless the camera has been moved since (watchSync)
      S.reframe = ink == null ? { p, to: pose } : null
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
      if (S.mode === 'fpv') {
        // Walk view: stand in the aisle 6 m from the bay mouth, facing into the bay (code and car in view)
        const k = l / 2 + 6
        fpvHoldAt({ levelId: bay.levelId, x: bay.x - f[0] * k, y: bay.y - f[1] * k, yaw: bay.angleDeg ?? 0, pitch: -14 }, durationMs)
        return
      }
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

    /**
     * Scene style (CONTRACT 3c): 'toy' (v0.3 default: lit pastel blocks, bevels, sun + soft shadows, DESIGN-TOY.md),
     * 'storm' (v0.2: storm sky, cool architecture, floor sheen, fresnel glass, desaturated sign boxes) or 'classic' (the
     * v0.1 look exactly). Storm and classic recolour in place. Switching to or from toy changes the geometry (bevels,
     * normals) and the materials: after setVenue that rebuilds the venue (route and markers must then be sent again), so
     * the App sets the style before the venue.
     * @param {'toy'|'storm'|'classic'} style
     */
    setSceneStyle(style) {
      const next = style === 'classic' || style === 'storm' ? style : 'toy'
      const wasToy = S.style === 'toy'
      S.style = next
      if (S.failed) return
      if ((next === 'toy') !== wasToy) {
        const old = S.mats
        S.mats = makeMaterials(next === 'toy')
        for (const m of Object.values(old)) m.dispose()
        if (S.index) {
          const view = S.lastView
          api.setVenue(S.index)
          if (view) api.setView(view, { durationMs: 0 })
        }
      }
      applyThemeAll()
      requestRender()
    },

    /**
     * 3D quality (DESIGN-TOY.md 4): 'showcase' (soft sun shadows in the toy style, pixel ratio up to 2) or 'light'
     * (no shadows, pixel ratio up to 1.5). The App picks it per device (src/quality.js); the engine drops to 'light' by
     * itself after 8 slow frames in a row while the camera moves.
     * @param {'showcase'|'light'} quality
     */
    setQuality(quality) {
      S.quality = quality === 'light' ? 'light' : 'showcase'
      S.slowFrames = 0
      if (S.failed || !S.renderer) return
      S.renderer.setPixelRatio(pixelRatio())
      const { width, height } = viewSize()
      S.renderer.setSize(width, height, false)
      requestRender()
    },

    /** @returns {'showcase'|'light'} */
    getQuality() {
      return S.quality
    },

    /** @returns {'toy'|'storm'|'classic'} */
    getSceneStyle() {
      return S.style
    },

    /** @param {'glow'|'ribbon'} style the v0.2 glowing path (default) or the v0.1 ribbon */
    setPathStyle(style) {
      S.route.setStyle(style)
      requestRender()
    },

    /**
     * Chevrons flow (flowMps m/s, default 1.8, 0.3..6) and the target ring ripples only while on; the engine then
     * renders every frame (only while mounted, with a route, on a visible page; never under reduced motion). Off:
     * static chevrons and render-on-demand again (idle = 0 frames).
     * @param {boolean} on
     * @param {{ flowMps?: number }} [opts]
     */
    setPathAnimating(on, opts = {}) {
      S.anim.on = Boolean(on)
      const f = Number(opts?.flowMps)
      if (Number.isFinite(f)) S.anim.flow = MathUtils.clamp(f, 0.3, 6)
      if (S.anim.on && S.fpv) {
        S.fpv.lookRelease = performance.now()
        S.fpv.lookFrom = [S.fpv.lookYaw, S.fpv.lookPitch]
      }
      requestRender()
    },

    /**
     * Target ring + beam at the next turn (and the nextTurn anchor). kind 'arrive' = destination colour. The label is
     * drawn beside the ring in Floor and 2D only. null removes it.
     * @param {{ levelId: string, x: number, y: number, label?: {en: string, ar: string}, kind?: 'turn'|'connector'|'arrive' } | null} p
     */
    setNextTurn(p) {
      if (S.failed) return
      const t = p && S.levels.has(p.levelId) && Number.isFinite(p.x) && Number.isFinite(p.y) ? { levelId: p.levelId, x: p.x, y: p.y, kind: p.kind ?? 'turn' } : null
      if (t) t.routeD = S.route.locate(t.levelId, t.x, t.y, S.walkerDist)
      S.nextTurn = t
      S.ring.set(t)
      S.overlay.setTurnLabel(t && p.label ? { levelId: t.levelId, x: t.x, y: t.y, text: p.label } : null)
      if (S.renderer) S.overlay.sync()
      requestRender()
    },

    /**
     * Walk view camera (partial update): eye height 1.2..2 m, vertical fov 50..85 deg (reduced so the horizontal fov
     * stays <= 80 deg), pitch -25..5 deg.
     * @param {{ eyeHeightM?: number, fovDeg?: number, pitchDeg?: number }} o
     */
    setFpvOptions(o = {}) {
      for (const [k, [lo, hi]] of Object.entries(FPV_CLAMPS)) {
        const v = Number(o?.[k])
        if (Number.isFinite(v)) S.fpvOpts[k] = MathUtils.clamp(v, lo, hi)
      }
      if (S.fpv) S.fpv.rest = null
      requestRender()
    },

    /** @returns {{ eyeHeightM: number, fovDeg: number, pitchDeg: number }} */
    getFpvOptions() {
      return { ...S.fpvOpts }
    },

    /**
     * Screen anchors after every rendered frame (next turn, destination, walker, camera heading). Called only when a
     * frame renders; never causes one. Returns an unsubscribe function.
     * @param {(a: object) => void} cb
     */
    onAnchors(cb) {
      S.anchorCbs.add(cb)
      return () => S.anchorCbs.delete(cb)
    },

    /** Anchors for the current camera (those of the last rendered frame unless something moved since). No render. */
    getAnchors() {
      S.camera.updateMatrixWorld()
      return computeAnchors()
    },

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
      if (S.mode === 'fpv' && S.fpv) {
        const F = S.fpv
        return { x: F.pos.x, y: -F.pos.z, distance: 0, tiltDeg: F.pitch + F.lookPitch, headingDeg: norm360(F.yaw + F.lookYaw), levelId: F.levelId, eye: true }
      }
      const p = currentPose()
      return { x: p.target.x, y: -p.target.z, distance: p.distance, tiltDeg: p.tiltDeg, headingDeg: p.headingDeg }
    },

    /** The engine state, for debugging and tests only (not part of the app contract; do not write to it). */
    get debug() {
      return S
    },

    /** Free every GPU resource and the WebGL context. The instance cannot be used afterwards. */
    dispose() {
      if (S.disposed) return
      api.unmount()
      clearVenue()
      S.overlay.dispose()
      S.route.dispose()
      S.markers.dispose()
      S.sky.dispose()
      S.ring.dispose()
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
      S.anchorCbs.clear()
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
      S.disposed = true
    },
  }
  // commands (set*, show*, fly*) sent from inside a frame callback (onRender / onAnchors) run in a microtask after
  // that frame
  for (const k of Object.keys(api).filter((n) => /^(set|show|fly)/.test(n))) {
    const f = api[k]
    api[k] = (...args) => {
      if (!S.inCb) return f(...args)
      queueMicrotask(() => f(...args))
      return undefined
    }
  }
  return api
}

/** App-wide singleton (one renderer, one canvas). */
export const engine = createEngine()
export default engine
