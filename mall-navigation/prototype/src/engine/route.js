/**
 * Route rendering, two styles: 'glow' (v0.2 default: a 1.4 m teal-green glowing path with white chevrons that flow
 * only while the walk plays, DESIGN-GLASS.md 5.7) and 'ribbon' (v0.1: a 1.2 m ribbon, blue core, white casing,
 * static chevrons), both 5 cm above the floor,
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
attribute float aAlong;
uniform float uHalfW;
varying float vSide;
varying float vDist;
varying vec3 vWP;
void main(){
vec3 p=position+vec3(aMiter.x,0.0,aMiter.y)*aSide*uHalfW;
vSide=aSide;
vDist=aDist+aAlong*aSide*uHalfW;
vec4 w=modelMatrix*vec4(p,1.0);
vWP=w.xyz;
gl_Position=projectionMatrix*viewMatrix*w;
}
`

// Two looks in one shader: uGlow = 1 is the v0.2 glowing path (DESIGN-GLASS.md 5.7: translucent body, bright rims,
// soft outer glow, white chevrons flowing by uFlow); uGlow = 0 is the v0.1 ribbon (core, casing, static chevrons).
// - vDist > uTrimEnd: the last metres under the arrival ring are hidden (setTrimEnd).
// - glow: other floors = round dots 0.5 m every 1.6 m (no glow, no chevrons); walked part = a faint core in map views,
//   hidden in the Walk view; chevrons = a white "^" pointing the walking way, 0.9 m wide, arms 55 deg back (a 0.64 m
//   deep point that still reads as an arrow from eye height), 0.18 m stroke, anti-aliased from the continuous route
//   distance (fwidth of the wrapped coordinate spikes at each period); Walk view: the body fades in from 1 to 5 m (no
//   flood at the bottom of the view), the chevrons are bolder (0.28 m stroke, ref 5's solid arrowheads) and full
//   white from 4 m (where the mini-map dome stops hiding the floor; fade 3 to 4 m, so the nearest visible chevron is
//   the boldest), the body is more opaque (0.88: painted aisle lines hardly show through); everything fades out from
//   40 to 60 m. uNoChev = 1 (escalator ramps: the moving steps show the direction) draws the body only.
// - ribbon: the walked part is thinner grey dashes on the casing colour.
const RIBBON_FRAG = /* glsl */ `
uniform vec3 uCore,uUpcoming,uCasing,uWalkedCol,uChevron,uRim,uBody,uGlowC;
uniform float uHalfW,uWalked,uActiveFrom,uActiveTo,uHasActive,uDotted,uOpacity,uTrimEnd,uGlow,uFpv,uFlow,uNoChev;
varying float vSide;
varying float vDist;
varying vec3 vWP;
void main(){
if(vDist>uTrimEnd)discard;
float w=uHalfW;
float t=abs(vSide)*w;
float aa=fwidth(t)+1e-4;
bool walked=vDist<uWalked;
bool isAct=uHasActive<0.5||(vDist>=uActiveFrom-0.02&&vDist<=uActiveTo+0.02);
vec3 col;
float a;
if(uGlow>0.5){
float k=w/1.05;
if(uDotted>0.5){
float per=1.6*k;
float r=length(vec2((fract(vDist/per)-0.5)*per,t));
a=0.45*(1.0-smoothstep(0.25*k-aa,0.25*k+aa,r));
col=uCore;
}else if(walked){
if(uFpv>0.5)discard;
a=0.5*(1.0-smoothstep(0.42*w-aa,0.42*w+aa,t));
col=uWalkedCol;
}else{
float de=distance(vWP,cameraPosition);
float inB=1.0-smoothstep(0.59*w-aa,0.59*w+aa,t);
float inR=1.0-smoothstep(0.67*w-aa,0.67*w+aa,t)-inB;
float g=1.0-smoothstep(0.67*w,w,t);
col=mix(mix(uGlowC,uRim,inR),isAct?uBody:uUpcoming,inB);
a=mix(mix(0.45*g*g,0.95,inR),isAct?(uFpv>0.5?0.88:0.62):0.434,inB);
float per=uFpv>0.5?2.4:max(2.4,6.0*w);
float s=(fract((vDist-uFlow)/per)-0.5)*per/k;
float tt=t/k;
float fd=fwidth(vDist)/k+1e-4;
float d=abs(s+1.43*tt)*0.573;
float th=uFpv>0.5?0.14:0.09;
float ch=(1.0-smoothstep(th-fd,th+fd,d))*(1.0-smoothstep(0.45-fd,0.45+fd,tt))*(isAct?0.92:0.55);
if(uFpv>0.5){
a*=smoothstep(1.0,5.0,de);
ch*=smoothstep(3.0,4.0,de)*(1.0-uNoChev);
}
float oa=ch+a*(1.0-ch);
col=(uChevron*ch+col*a*(1.0-ch))/max(oa,1e-4);
a=oa;
}
if(uFpv>0.5)a*=1.0-smoothstep(40.0,60.0,distance(vWP,cameraPosition));
}else{
float coreHalf=w*0.66;
float casingMix=smoothstep(coreHalf-aa,coreHalf+aa,t);
a=1.0-smoothstep(w-aa*1.5,w,t);
if(uDotted>0.5){
float dp=max(1.8,w*3.2);
if(fract(vDist/dp)>0.55)discard;
}
vec3 core=isAct?uCore:uUpcoming;
if(walked){
float wMix=smoothstep(coreHalf*0.62-aa,coreHalf*0.62+aa,t);
float dl=max(2.6,w*4.4);
float f=fract(vDist/dl);
float fd=fwidth(vDist/dl)+1e-4;
float dash=smoothstep(0.0,fd,f)*(1.0-smoothstep(0.6-fd,0.6,f));
col=mix(uCasing,uWalkedCol,dash*(1.0-wMix));
}else{
float period=max(3.0,w*5.0);
float s=fract(vDist/period)*period;
float d=abs(s-(period*0.5+coreHalf*0.5-t*0.9));
float th=w*0.2;
float fd=fwidth(vDist)+1e-4;
float chev=(1.0-smoothstep(th-fd,th+fd,d))*(1.0-smoothstep(coreHalf*0.8-aa,coreHalf*0.8+aa,t));
col=mix(mix(core,uChevron,chev),uCasing,casingMix);
}
}
if(a<0.004)discard;
gl_FragColor=vec4(col,uOpacity*a);
#include <colorspace_fragment>
}
`

const COLUMN_VERT = /* glsl */ `
varying float vH;
varying float vF;
varying float vD;
void main(){
vH=uv.y;
vec4 mv=modelViewMatrix*vec4(position,1.0);
vF=abs(dot(normalize(normalMatrix*normal),normalize(-mv.xyz)));
vD=length(mv.xyz);
gl_Position=projectionMatrix*mv;
}
`
// glow style: a bright core line up the middle of the light column (routeRim on a routeGlow halo); uNear = 1 (Walk
// view): fades in from 4 to 12 m, so a pole close by never washes over the view
const COLUMN_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uCoreC;
uniform float uAlpha;
uniform float uCoreOn;
uniform float uNear;
varying float vH;
varying float vF;
varying float vD;
void main(){
float c=uCoreOn*pow(vF,40.0);
gl_FragColor=vec4(mix(uColor,uCoreC,c),min(1.0,uAlpha*pow(1.0-vH,1.4)*(1.0+1.6*c))*mix(1.0,smoothstep(4.0,12.0,vD),uNear));
#include <colorspace_fragment>
}
`
const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
void main(){
gl_FragColor=vec4(uColor,uAlpha);
#include <colorspace_fragment>
}
`

/**
 * Build the ribbon geometry for one run of route points on one level. Each segment is its own quad (its own vertices
 * at the joints): the route distance at a vertex is measured along that segment (`aAlong` = the mitre corner's offset
 * along the segment per metre of half width, applied in the vertex shader), so chevrons stay straight right up to the
 * mitre line of a corner instead of shearing across the joint.
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
  const dirs = []
  for (let i = 0; i < n - 1; i++) {
    const dx = P[i + 1].x - P[i].x
    const dy = P[i + 1].y - P[i].y
    const l = Math.hypot(dx, dy)
    dirs.push([dx / l, dy / l])
  }
  // the mitre at each joint (data coords, per metre of half width)
  const M = []
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
    M.push([mx * len, my * len])
  }
  const m = n - 1
  const pos = new Float32Array(m * 12)
  const miter = new Float32Array(m * 8)
  const side = new Float32Array(m * 4)
  const dist = new Float32Array(m * 4)
  const along = new Float32Array(m * 4)
  const idx = []
  for (let i = 0; i < m; i++) {
    for (let k = i * 4, e = 0; e < 4; e++, k++) {
      const j = i + (e >> 1)
      const q = M[j]
      pos.set([P[j].x, ROUTE_HEIGHT, -P[j].y], k * 3)
      // data (x, y) -> three (x, -y) in xz
      miter.set([q[0], -q[1]], k * 2)
      side[k] = e & 1 ? -1 : 1
      dist[k] = D[j]
      along[k] = q[0] * dirs[i][0] + q[1] * dirs[i][1]
    }
    const b = i * 4
    idx.push(b + 1, b + 3, b + 2, b + 1, b + 2, b)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('aMiter', new BufferAttribute(miter, 2))
  g.setAttribute('aSide', new BufferAttribute(side, 1))
  g.setAttribute('aDist', new BufferAttribute(dist, 1))
  g.setAttribute('aAlong', new BufferAttribute(along, 1))
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
    /** escalator legs: a narrower glowing path up the ramp, shown in the Walk view only */
    this.ramps = []
    this.route = null
    this.dists = []
    this.walked = 0
    this.activeStep = -1
    this.theme = 'sunlight'
    /** 'glow' (v0.2 default) or 'ribbon' (v0.1) */
    this.style = 'glow'
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
      uniforms: { uColor: { value: new Color() }, uCoreC: { value: new Color() }, uAlpha: { value: 0.5 }, uCoreOn: { value: 0 }, uNear: { value: 0 } },
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
      uRim: { value: new Color() },
      uBody: { value: new Color() },
      uGlowC: { value: new Color() },
      uGlow: { value: 1 },
      uFpv: { value: 0 },
      uFlow: { value: 0 },
      uNoChev: { value: 0 },
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
    const glow = this.style === 'glow'
    const set = (uni, key) => uni.value.copy(themeColor(theme, key))
    set(u.uCore, 'routeCore')
    set(u.uUpcoming, 'routeUpcoming')
    set(u.uCasing, 'routeCasing')
    set(u.uWalkedCol, 'routeWalked')
    set(u.uChevron, glow ? 'chevron' : 'routeCasing')
    set(u.uRim, 'routeRim')
    set(u.uBody, 'routeBody')
    set(u.uGlowC, 'routeGlow')
    u.uGlow.value = glow ? 1 : 0
    const cu = this.columnMat.uniforms
    set(cu.uColor, glow ? 'routeGlow' : 'routeCore')
    set(cu.uCoreC, 'routeRim')
    cu.uCoreOn.value = glow ? 1 : 0
    cu.uAlpha.value = glow ? 0.42 : 0.5
    set(this.beamMat.uniforms.uColor, glow ? 'routeRim' : 'routeCore')
  }

  /** @param {'glow'|'ribbon'} style */
  setStyle(style) {
    this.style = style === 'ribbon' ? 'ribbon' : 'glow'
    this.setTheme(this.theme)
  }

  /**
   * Walk view (fpv = true: true-size path, distance fades, walked part hidden) and the chevron flow offset (m).
   * @param {boolean} fpv
   * @param {number} flow
   */
  setFrame(fpv, flow) {
    this.uniforms.uFpv.value = fpv ? 1 : 0
    this.uniforms.uFlow.value = flow
  }

  /**
   * Point at a distance along the route (clamped), interpolated within a level run.
   * @param {number} d
   * @returns {{ x: number, y: number, levelId: string } | null}
   */
  pointAt(d) {
    const pts = this.route?.points
    const D = this.dists
    if (!pts) return null
    let i = 1
    while (i < pts.length - 1 && D[i] < d) i++
    const a = pts[i - 1]
    const b = pts[i]
    if (a.levelId !== b.levelId) return { x: a.x, y: a.y, levelId: a.levelId }
    const f = Math.max(0, Math.min(1, (d - D[i - 1]) / Math.max(1e-6, D[i] - D[i - 1])))
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, levelId: a.levelId }
  }

  /**
   * Distance along the route of the route position nearest a point on that level (within 4 m), preferring positions
   * at or after `after`; null when the point is not on the route.
   */
  locate(levelId, x, y, after = 0) {
    const pts = this.route?.points
    if (!pts) return null
    let best = null
    let bestScore = Infinity
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]
      const b = pts[i]
      if (a.levelId !== levelId || b.levelId !== levelId) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const l2 = dx * dx + dy * dy
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)) : 0
      const off = Math.hypot(a.x + dx * t - x, a.y + dy * t - y)
      const d = this.dists[i - 1] + Math.sqrt(l2) * t
      const score = off + (d < after - 0.5 ? 50 : 0)
      if (off < 4 && score < bestScore) {
        bestScore = score
        best = d
      }
    }
    return best
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
        if (edge?.kind === 'escalator') this._addRamp(pts[i - 1], pts[i], dists[i - 1], dists[i], edge.connectorId)
      }
    }
    flush(pts.length - 1)
    this.setProgress(this.activeStep, this.walked)
  }

  _addRamp(a, b, da, db, connId) {
    const P = []
    const D = []
    for (let k = 0; k <= 16; k++) {
      const f = k / 16
      P.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f })
      D.push(da + (db - da) * f)
    }
    const g = buildRibbonGeometry(P, D)
    if (!g) return
    const mat = new ShaderMaterial({
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      uniforms: { ...this.uniforms, uDotted: { value: 0 }, uOpacity: { value: 1 }, uHalfW: { value: 0.75 }, uNoChev: { value: 1 } },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    })
    const mesh = new Mesh(g, mat)
    mesh.renderOrder = 5
    mesh.frustumCulled = false
    mesh.visible = false
    this.root.add(mesh)
    this.ramps.push({ mesh, connId })
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
   * @param {boolean} [ctx.fpv] Walk view: slim poles fading in with distance, none at the next-turn ring (its own beam
   *   marks that stop), and the path up the escalator ramps
   * @param {((connectorId: string, x: number, y: number) => number)|null} [ctx.rampY] world y of a ramp point
   * @param {{ levelId: string, x: number, y: number } | null} [ctx.ring] the next-turn ring (setNextTurn)
   * @param {boolean} [ctx.done] the whole route is walked (Walk view, Arrived): no poles
   */
  layout(ctx) {
    this.columnMat.uniforms.uNear.value = ctx.fpv ? 1 : 0
    for (const r of this.ramps) {
      r.mesh.visible = Boolean(ctx.fpv && ctx.rampY)
      if (!r.mesh.visible) continue
      const pos = r.mesh.geometry.getAttribute('position')
      for (let k = 0; k < pos.count; k++) pos.setY(k, ctx.rampY(r.connId, pos.getX(k), -pos.getZ(k)) + 0.11)
      pos.needsUpdate = true
    }
    const up = new Vector3(0, 1, 0)
    const q = new Quaternion()
    for (const L of this.lights) {
      if (L.kind === 'column') {
        const y = ctx.levelY(L.a.levelId)
        const rg = ctx.ring
        L.mesh.visible = ctx.isVisible(L.a.levelId) && !ctx.done && !(ctx.fpv && rg && rg.levelId === L.a.levelId && Math.hypot(rg.x - L.a.x, rg.y - L.a.y) < 1)
        L.mesh.position.set(L.a.x, y + ROUTE_HEIGHT, -L.a.y)
        // the Walk view sees it from close by: a thin light pole up to the ceiling, not a glass drum
        const r = ctx.fpv ? 0.06 : Math.max(0.9, this.halfW * 1.4)
        L.mesh.scale.set(r, ctx.fpv ? 4.4 : (ctx.columnH ?? 5.5), r)
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
    this.halfW = Math.max(this.style === 'glow' ? 1.05 : BASE_HALF_WIDTH, hw)
    this.uniforms.uHalfW.value = this.halfW
  }

  /**
   * Project a point onto the route (same level), searching forward from `fromDist`. `connectorId` (a walker riding
   * it) also accepts that connector's edge between two levels, so the walked distance runs on up the escalator.
   * @returns {number|null} distance along the route
   */
  project(levelId, x, y, fromDist = 0, connectorId) {
    const pts = this.route?.points
    if (!pts) return null
    let best = null
    let bestD = 4 // metres: farther than this is "not on the route"
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]
      const b = pts[i]
      if ((a.levelId !== levelId || b.levelId !== levelId) && !(connectorId && this.route.edges?.[i - 1]?.connectorId === connectorId)) continue
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
    for (const r of this.ramps) {
      this.root.remove(r.mesh)
      r.mesh.geometry.dispose()
      r.mesh.material.dispose()
    }
    this.ramps = []
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
