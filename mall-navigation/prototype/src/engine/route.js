/**
 * Route rendering: a 1.2 m ribbon 5 cm above the floor (blue core, white casing, static chevrons),
 * the walked part grey and dashed, parts on other levels dashed and faded, the active step brighter,
 * and a vertical light column at every connector stop (plus a beam joining the two stops in stack
 * view). One ribbon mesh per level run, so the stack layout and visibility follow the level groups.
 * In stack view each run also gets an "x-ray" copy (no depth test, dotted, faint) so the part of the route
 * under an upper floor still shows.
 *
 * The ribbon width is a uniform: when the camera is far away the ribbon widens so it never drops
 * under ~6 CSS px on screen.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  ShaderMaterial,
  Vector3,
  Quaternion,
} from 'three'
import { themeColor } from './palette.js'

export const ROUTE_HEIGHT = 0.05
const BASE_HALF_WIDTH = 0.6 // 1.2 m ribbon

const RIBBON_VERT = /* glsl */ `
attribute vec2 aMiter;
attribute float aSide;
attribute float aDist;
uniform float uHalfW;
varying float vSide;
varying float vDist;
void main() {
  vec3 p = position + vec3(aMiter.x, 0.0, aMiter.y) * aSide * uHalfW;
  vSide = aSide;
  vDist = aDist;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`

const RIBBON_FRAG = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uUpcoming;
uniform vec3 uCasing;
uniform vec3 uWalkedCol;
uniform vec3 uChevron;
uniform float uHalfW;
uniform float uWalked;
uniform float uActiveFrom;
uniform float uActiveTo;
uniform float uHasActive;
uniform float uDotted;
uniform float uOpacity;
uniform float uTrimEnd;
varying float vSide;
varying float vDist;
void main() {
  // the last metres under the arrival ring are hidden (setTrimEnd)
  if (vDist > uTrimEnd) discard;
  float w = uHalfW;
  float t = abs(vSide) * w;
  float aa = fwidth(t) + 1e-4;
  float coreHalf = w * 0.66;
  float casingMix = smoothstep(coreHalf - aa, coreHalf + aa, t);
  float edgeA = 1.0 - smoothstep(w - aa * 1.5, w, t);
  if (uDotted > 0.5) {
    float dp = max(1.8, w * 3.2);
    if (fract(vDist / dp) > 0.55) discard;
  }
  bool walked = vDist < uWalked;
  vec3 core = uCore;
  if (uHasActive > 0.5 && !walked) {
    bool isActive = vDist >= uActiveFrom - 0.02 && vDist <= uActiveTo + 0.02;
    core = isActive ? uCore : uUpcoming;
  }
  vec3 col;
  if (walked) {
    // walked: thinner grey dashes on the casing colour
    float wHalf = coreHalf * 0.62;
    float wMix = smoothstep(wHalf - aa, wHalf + aa, t);
    float dl = max(2.6, w * 4.4);
    float f = fract(vDist / dl);
    float fd = fwidth(vDist / dl) + 1e-4;
    float dash = smoothstep(0.0, fd, f) * (1.0 - smoothstep(0.6 - fd, 0.6, f));
    col = mix(uCasing, uWalkedCol, dash * (1.0 - wMix));
  } else {
    float period = max(3.0, w * 5.0);
    float s = fract(vDist / period) * period;
    float c = period * 0.5 + coreHalf * 0.5 - t * 0.9;
    float d = abs(s - c);
    float th = w * 0.2;
    float fd = fwidth(vDist) + 1e-4;
    float chev = (1.0 - smoothstep(th - fd, th + fd, d)) * (1.0 - smoothstep(coreHalf * 0.8 - aa, coreHalf * 0.8 + aa, t));
    col = mix(core, uChevron, chev);
    col = mix(col, uCasing, casingMix);
  }
  gl_FragColor = vec4(col, uOpacity * edgeA);
  #include <colorspace_fragment>
}
`

const COLUMN_VERT = /* glsl */ `
varying float vH;
void main() {
  vH = uv.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const COLUMN_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying float vH;
void main() {
  float a = uAlpha * pow(1.0 - vH, 1.4);
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`
const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying float vH;
void main() {
  gl_FragColor = vec4(uColor, uAlpha);
  #include <colorspace_fragment>
}
`

/**
 * Build the ribbon geometry for one run of route points on one level.
 * @param {Array<{x:number,y:number}>} pts
 * @param {number[]} dists cumulative route distance at each point
 */
function buildRibbonGeometry(pts, dists) {
  // drop consecutive duplicates
  const P = []
  const D = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const last = P[P.length - 1]
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.01) continue
    P.push(p)
    D.push(dists[i])
  }
  if (P.length < 2) return null
  const n = P.length
  const pos = new Float32Array(n * 2 * 3)
  const miter = new Float32Array(n * 2 * 2)
  const side = new Float32Array(n * 2)
  const dist = new Float32Array(n * 2)
  const dirs = []
  for (let i = 0; i < n - 1; i++) {
    const dx = P[i + 1].x - P[i].x
    const dy = P[i + 1].y - P[i].y
    const l = Math.hypot(dx, dy)
    dirs.push([dx / l, dy / l])
  }
  for (let i = 0; i < n; i++) {
    const d0 = dirs[Math.max(0, i - 1)]
    const d1 = dirs[Math.min(n - 2, i)]
    const n0 = [-d0[1], d0[0]]
    const n1 = [-d1[1], d1[0]]
    let mx = n0[0] + n1[0]
    let my = n0[1] + n1[1]
    let ml = Math.hypot(mx, my)
    let len = 1
    if (ml < 1e-3) {
      mx = n0[0]
      my = n0[1]
    } else {
      mx /= ml
      my /= ml
      len = Math.min(2.5, 1 / Math.max(0.2, mx * n0[0] + my * n0[1]))
    }
    for (let s = 0; s < 2; s++) {
      const k = i * 2 + s
      pos.set([P[i].x, ROUTE_HEIGHT, -P[i].y], k * 3)
      // data (mx, my) -> three (mx, -my) in xz
      miter.set([mx * len, -my * len], k * 2)
      side[k] = s === 0 ? 1 : -1
      dist[k] = D[i]
    }
  }
  const idx = []
  for (let i = 0; i < n - 1; i++) {
    const l0 = i * 2
    const r0 = i * 2 + 1
    const l1 = i * 2 + 2
    const r1 = i * 2 + 3
    idx.push(r0, r1, l1, r0, l1, l0)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('aMiter', new BufferAttribute(miter, 2))
  g.setAttribute('aSide', new BufferAttribute(side, 1))
  g.setAttribute('aDist', new BufferAttribute(dist, 1))
  g.setIndex(idx)
  g.computeBoundingSphere()
  if (g.boundingSphere) g.boundingSphere.radius += 3
  return g
}

export class RouteLayer {
  constructor() {
    this.root = new Group()
    this.root.name = 'route-connectors'
    /** @type {Array<{ levelId: string, mesh: Mesh, parent: Group }>} */
    this.runs = []
    /** @type {Array<{ kind: 'column'|'beam', mesh: Mesh, a: any, b?: any }>} */
    this.lights = []
    this.route = null
    this.dists = []
    this.walked = 0
    this.activeStep = -1
    this.theme = 'sunlight'
    this.currentLevelId = null
    this.xray = false
    this.halfW = BASE_HALF_WIDTH
    this.columnGeo = new CylinderGeometry(1, 1, 1, 24, 1, true)
    this.columnGeo.translate(0, 0.5, 0)
    this.beamGeo = new CylinderGeometry(1, 1, 1, 12, 1, true)
    this.uniforms = this._makeUniforms()
    this.columnMat = new ShaderMaterial({
      vertexShader: COLUMN_VERT,
      fragmentShader: COLUMN_FRAG,
      uniforms: { uColor: { value: new Color() }, uAlpha: { value: 0.5 } },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    })
    this.beamMat = new ShaderMaterial({
      vertexShader: COLUMN_VERT,
      fragmentShader: BEAM_FRAG,
      uniforms: { uColor: { value: new Color() }, uAlpha: { value: 0.45 } },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    })
    this.setTheme('sunlight')
  }

  _makeUniforms() {
    return {
      uCore: { value: new Color() },
      uUpcoming: { value: new Color() },
      uCasing: { value: new Color() },
      uWalkedCol: { value: new Color() },
      uChevron: { value: new Color() },
      uHalfW: { value: BASE_HALF_WIDTH },
      uWalked: { value: 0 },
      uActiveFrom: { value: 0 },
      uActiveTo: { value: 0 },
      uHasActive: { value: 0 },
      uTrimEnd: { value: 1e9 },
    }
  }

  setTheme(theme) {
    this.theme = theme
    const u = this.uniforms
    u.uCore.value.copy(themeColor(theme, 'routeCore'))
    u.uUpcoming.value.copy(themeColor(theme, 'routeUpcoming'))
    u.uCasing.value.copy(themeColor(theme, 'routeCasing'))
    u.uWalkedCol.value.copy(themeColor(theme, 'routeWalked'))
    u.uChevron.value.copy(themeColor(theme, 'routeCasing'))
    this.columnMat.uniforms.uColor.value.copy(themeColor(theme, 'routeCore'))
    this.beamMat.uniforms.uColor.value.copy(themeColor(theme, 'routeCore'))
  }

  /**
   * @param {object|null} route   CONTRACT Route
   * @param {object} ctx
   * @param {(levelId:string)=>Group} ctx.routeGroupFor
   */
  show(route, ctx) {
    this.clear()
    this.route = route
    if (!route || !Array.isArray(route.points) || route.points.length < 2) {
      this.route = null
      return
    }
    const pts = route.points
    const dists = [0]
    for (let i = 1; i < pts.length; i++) dists.push(dists[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
    this.dists = dists
    // runs: maximal sequences on one level joined by walk edges
    let start = 0
    const flush = (end) => {
      if (end - start >= 1) {
        const runPts = pts.slice(start, end + 1)
        const runD = dists.slice(start, end + 1)
        const g = buildRibbonGeometry(runPts, runD)
        if (g) {
          const mat = new ShaderMaterial({
            vertexShader: RIBBON_VERT,
            fragmentShader: RIBBON_FRAG,
            uniforms: { ...this.uniforms, uDotted: { value: 0 }, uOpacity: { value: 1 } },
            transparent: true,
            depthWrite: false,
            side: DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -4,
          })
          const mesh = new Mesh(g, mat)
          mesh.renderOrder = 5
          mesh.name = `route-${pts[start].levelId}-${start}`
          const parent = ctx.routeGroupFor(pts[start].levelId)
          parent.add(mesh)
          // x-ray pass (stack view): the same ribbon, dotted and faint, drawn through the floors stacked above
          const xmat = new ShaderMaterial({
            vertexShader: RIBBON_VERT,
            fragmentShader: RIBBON_FRAG,
            uniforms: { ...this.uniforms, uDotted: { value: 1 }, uOpacity: { value: 0.7 } },
            transparent: true,
            depthWrite: false,
            depthTest: false,
            side: DoubleSide,
          })
          const xray = new Mesh(g, xmat)
          xray.renderOrder = 25
          xray.name = `route-xray-${pts[start].levelId}-${start}`
          xray.visible = this.xray
          parent.add(xray)
          this.runs.push({ levelId: pts[start].levelId, mesh, xray, parent })
        }
      }
    }
    for (let i = 1; i < pts.length; i++) {
      const edge = route.edges?.[i - 1]
      const isConnector = pts[i].levelId !== pts[i - 1].levelId || (edge && edge.connectorId && edge.kind !== 'walk' && edge.kind !== 'parking_walk')
      if (isConnector) {
        flush(i - 1)
        start = i
        this._addConnectorLights(pts[i - 1], pts[i])
      }
    }
    flush(pts.length - 1)
    this.setProgress(this.activeStep, this.walked)
  }

  _addConnectorLights(a, b) {
    for (const p of [a, b]) {
      const mesh = new Mesh(this.columnGeo, this.columnMat)
      mesh.renderOrder = 6
      mesh.userData.point = p
      this.root.add(mesh)
      this.lights.push({ kind: 'column', mesh, a: p })
    }
    const beam = new Mesh(this.beamGeo, this.beamMat)
    beam.renderOrder = 6
    this.root.add(beam)
    this.lights.push({ kind: 'beam', mesh: beam, a, b })
  }

  /**
   * Place connector lights for the current stack layout and visibility.
   * @param {object} ctx
   * @param {(levelId:string)=>number} ctx.levelY
   * @param {(levelId:string)=>boolean} ctx.isVisible
   * @param {'stack'|'floor'|'top'} ctx.mode
   * @param {number} [ctx.columnH] height of the connector light columns (m)
   */
  layout(ctx) {
    const up = new Vector3(0, 1, 0)
    const q = new Quaternion()
    for (const L of this.lights) {
      if (L.kind === 'column') {
        const y = ctx.levelY(L.a.levelId)
        L.mesh.visible = ctx.isVisible(L.a.levelId)
        L.mesh.position.set(L.a.x, y + ROUTE_HEIGHT, -L.a.y)
        const r = Math.max(0.9, this.halfW * 1.4)
        L.mesh.scale.set(r, ctx.columnH ?? 5.5, r)
      } else {
        const ya = ctx.levelY(L.a.levelId) + 0.4
        const yb = ctx.levelY(L.b.levelId) + 0.4
        const A = new Vector3(L.a.x, ya, -L.a.y)
        const B = new Vector3(L.b.x, yb, -L.b.y)
        const d = B.clone().sub(A)
        const len = d.length()
        L.mesh.visible = ctx.mode === 'stack' && len > 0.5 && ctx.isVisible(L.a.levelId) && ctx.isVisible(L.b.levelId)
        if (len > 1e-3) {
          q.setFromUnitVectors(up, d.clone().normalize())
          L.mesh.quaternion.copy(q)
        }
        L.mesh.position.copy(A).add(B).multiplyScalar(0.5)
        const r = Math.max(0.25, this.halfW * 0.55)
        L.mesh.scale.set(r, Math.max(len, 0.001), r)
      }
    }
  }

  /**
   * @param {number} stepIndex  -1 for none
   * @param {number} walkedM
   */
  setProgress(stepIndex, walkedM) {
    this.activeStep = stepIndex
    this.walked = walkedM
    const u = this.uniforms
    let step = this.route?.steps?.[stepIndex]
    // "Start at ..." covers no distance: show the first walk in full route blue, never the whole route faded
    if (step && (step.kind === 'start' || (step.to ?? 0) <= (step.from ?? 0)) && this.route.steps[stepIndex + 1]) step = this.route.steps[stepIndex + 1]
    if (step && this.dists.length) {
      const from = Math.max(0, Math.min(this.dists.length - 1, step.from ?? 0))
      const to = Math.max(0, Math.min(this.dists.length - 1, step.to ?? from))
      u.uActiveFrom.value = this.dists[from]
      u.uActiveTo.value = this.dists[to]
      u.uHasActive.value = 1
    } else {
      u.uHasActive.value = 0
    }
    u.uWalked.value = walkedM
  }

  /**
   * Hide the last `metres` of the route (arrival: the green ring stands there), 0 to show it all.
   * @param {number} metres
   */
  setTrimEnd(metres) {
    const total = this.dists.length ? this.dists[this.dists.length - 1] : 0
    this.uniforms.uTrimEnd.value = metres > 0 && total > 0 ? Math.max(0, total - metres) : 1e9
  }

  /** Total route length along the drawn points (metres). */
  totalDist() {
    return this.dists.length ? this.dists[this.dists.length - 1] : 0
  }

  /** Distance along the route where a step starts. */
  stepStartDist(stepIndex) {
    const step = this.route?.steps?.[stepIndex]
    if (!step || !this.dists.length) return 0
    return this.dists[Math.max(0, Math.min(this.dists.length - 1, step.from ?? 0))]
  }

  /** Runs on levels other than `levelId` are drawn dashed and faded (null = all solid). */
  setCurrentLevel(levelId) {
    this.currentLevelId = levelId
    for (const r of this.runs) {
      const other = levelId != null && r.levelId !== levelId
      r.mesh.material.uniforms.uDotted.value = other ? 1 : 0
      r.mesh.material.uniforms.uOpacity.value = other ? 0.85 : 1
    }
  }

  /** Stack view: also draw every run through the floors above it (dotted, faint). */
  setXray(on) {
    this.xray = !!on
    for (const r of this.runs) r.xray.visible = this.xray
  }

  /** Screen-adaptive half width (metres). */
  setHalfWidth(hw) {
    this.halfW = Math.max(BASE_HALF_WIDTH, hw)
    this.uniforms.uHalfW.value = this.halfW
  }

  /**
   * Project a point onto the route (same level), searching forward from `fromDist`.
   * @returns {number|null} distance along the route
   */
  project(levelId, x, y, fromDist = 0) {
    const pts = this.route?.points
    if (!pts) return null
    let best = null
    let bestD = 4 // metres: farther than this is "not on the route"
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]
      const b = pts[i]
      if (a.levelId !== levelId || b.levelId !== levelId) continue
      if (this.dists[i] < fromDist - 3) continue
      if (this.dists[i - 1] > fromDist + 60) break
      const dx = b.x - a.x
      const dy = b.y - a.y
      const l2 = dx * dx + dy * dy
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)) : 0
      const d = Math.hypot(a.x + dx * t - x, a.y + dy * t - y)
      if (d < bestD) {
        bestD = d
        best = this.dists[i - 1] + Math.sqrt(l2) * t
      }
    }
    return best
  }

  /** Bounding points (data coords + level) of a step, for camera framing. */
  stepPoints(stepIndex) {
    const step = this.route?.steps?.[stepIndex]
    const pts = this.route?.points
    if (!step || !pts) return []
    const from = Math.max(0, Math.min(pts.length - 1, step.from ?? 0))
    const to = Math.max(from, Math.min(pts.length - 1, step.to ?? from))
    return pts.slice(from, to + 1)
  }

  clear() {
    for (const r of this.runs) {
      r.parent.remove(r.mesh)
      r.parent.remove(r.xray)
      r.mesh.geometry.dispose()
      r.mesh.material.dispose()
      r.xray.material.dispose()
    }
    this.runs = []
    for (const L of this.lights) this.root.remove(L.mesh)
    this.lights = []
    this.route = null
    this.dists = []
    this.uniforms.uTrimEnd.value = 1e9
  }

  dispose() {
    this.clear()
    this.columnGeo.dispose()
    this.beamGeo.dispose()
    this.columnMat.dispose()
    this.beamMat.dispose()
  }
}
