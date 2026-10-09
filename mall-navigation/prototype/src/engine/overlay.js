/**
 * Screen-space overlay: billboard icon pins (one draw call per level) and roof labels (troika
 * BatchedText, one batch for the whole venue). Every rendered frame they are projected, culled
 * against the levels stacked above them, sorted by priority (landmarkScore) and placed greedily so
 * labels never pile up. Label text keeps a constant on-screen size (>= 14 px Latin, >= 16 px Arabic).
 *
 * - Screen areas covered by UI (header, map controls, the bottom sheet) are "obstacles": nothing is
 *   drawn under them, so no label is ever half hidden by a button.
 * - Level labels in stack view get their own pass: one column at the slab edges (the start side in the
 *   reading direction), pushed apart instead of dropped, with the short level code as a fallback. They are
 *   never dropped.
 * - Neighbouring labels keep a clear gap, and nothing crowds the destination's label.
 * - The destination and the landmark / connector named in the current step always show (PLAN.md 19.2): when
 *   their spot is taken by a control or the screen edge they move to the nearest free spot instead of
 *   disappearing. The destination's name sits by its marker, not at the middle of the unit.
 * - Names never sit on the route of the current and next step, the route's key points (step start and end,
 *   connector stops) stay free of other pins, and a screen grid keeps names from stacking into a wall.
 * - In stack view, a marker that is not on the top floor shown carries a small level badge ("B1"), and the
 *   QR plates show as pins while a scan sheet asks the shopper to tap one (setScanKinds).
 */
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
} from 'three'
import { BatchedText, Text } from 'troika-three-text'
import { fontFor } from './fonts.js'
import { drawableText } from './textGuard.js'
import { iconUv } from './icons.js'
import { pointInPolygon } from './geometry.js'

// aShift: CSS px (x right, y down), a pin slid out from under a control; clip.z: always in front (occlusion is
// decided on the CPU)
const PIN_VERT = /* glsl */ `
attribute vec2 aCorner;
attribute vec2 aUv;
attribute float aVis;
attribute vec2 aShift;
uniform vec2 uViewport;
uniform float uSize;
varying vec2 vUv;
varying float vVis;
void main(){
vec4 clip=projectionMatrix*modelViewMatrix*vec4(position,1.0);
clip.xy+=(aCorner*uSize+vec2(aShift.x,-aShift.y))*2.0/uViewport*clip.w;
clip.z=-clip.w*0.999;
gl_Position=clip;
vUv=aUv;
vVis=aVis;
}
`

const PIN_FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uOpacity;
varying vec2 vUv;
varying float vVis;
void main(){
if(vVis<0.5)discard;
vec4 c=texture2D(uAtlas,vUv);
if(c.a<0.03)discard;
gl_FragColor=vec4(c.rgb,c.a*uOpacity);
#include <colorspace_fragment>
}
`

/**
 * @typedef {object} PinSpec
 * @property {string} id         pick id
 * @property {string} type       pick type ('amenity'|'connector'|'anchor'|'occupant')
 * @property {string} icon       icon id (icons.js)
 * @property {number} x
 * @property {number} y
 * @property {number} h          height above the level floor
 * @property {number} priority
 * @property {boolean} [stack]   also shown in stack view
 * @property {boolean} [scan]    QR plate pin: only shown while a scan sheet is open (OverlayLayer.scanKinds)
 * @property {string} [kind]     anchor kind of a scan pin ('parking_pillar', 'lift_lobby', ...)
 */

/**
 * Build one pin mesh for a level.
 * @param {PinSpec[]} pins
 * @param {import('three').Texture} atlas
 * @returns {Mesh|null}
 */
export function buildPinMesh(pins, atlas) {
  if (!pins.length) return null
  const n = pins.length
  const pos = new Float32Array(n * 12)
  const corner = new Float32Array(n * 8)
  const uv = new Float32Array(n * 8)
  const vis = new Float32Array(n * 4)
  const shift = new Float32Array(n * 8)
  const idx = new Uint16Array(n * 6)
  const C = [
    [-0.5, 0],
    [0.5, 0],
    [0.5, 1],
    [-0.5, 1],
  ]
  pins.forEach((p, i) => {
    const [u0, v0, u1, v1] = iconUv(p.icon, atlas)
    for (let k = 0; k < 4; k++) {
      pos.set([p.x, p.h, -p.y], (i * 4 + k) * 3)
      corner.set(C[k], (i * 4 + k) * 2)
      uv.set([C[k][0] < 0 ? u0 : u1, C[k][1] < 0.5 ? v0 : v1], (i * 4 + k) * 2)
      vis[i * 4 + k] = 1
    }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6)
  })
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('aCorner', new BufferAttribute(corner, 2))
  g.setAttribute('aUv', new BufferAttribute(uv, 2))
  g.setAttribute('aVis', new BufferAttribute(vis, 1))
  g.setAttribute('aShift', new BufferAttribute(shift, 2))
  g.setIndex(new BufferAttribute(idx, 1))
  g.computeBoundingSphere()
  const m = new ShaderMaterial({
    vertexShader: PIN_VERT,
    fragmentShader: PIN_FRAG,
    uniforms: {
      uAtlas: { value: atlas },
      uViewport: { value: new Vector2(390, 844) },
      uSize: { value: 40 },
      uOpacity: { value: 1 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })
  const mesh = new Mesh(g, m)
  mesh.frustumCulled = false
  mesh.renderOrder = 30
  mesh.userData.pins = pins
  return mesh
}

/**
 * @typedef {object} LabelSpec
 * @property {string} id
 * @property {string} type          'occupant'|'amenity'|'landmark'|'connector'|'level'
 * @property {string} levelId
 * @property {number} x
 * @property {number} y
 * @property {number} h
 * @property {{en:string, ar:string}} text
 * @property {number} priority
 * @property {number} [px]          font size in CSS px (Latin; Arabic gets +2)
 * @property {number} [offsetPx]    screen offset downwards (labels under pins)
 * @property {'all'|'stack'|'flat'} [modes] when to show: all views, stack only, floor/top only
 * @property {string} [refOccupantId]
 * @property {{en:string, ar:string}} [shortText]  level labels: short code used when the full name has no room
 */

/** Label collision padding (CSS px per side) so two names never read as one. */
const PAD_X = 8
const PAD_Y = 3
/** Free space kept around the destination's label (CSS px). */
const DEST_CLEAR_PX = 24
/** Gap between stacked level labels (CSS px): the 0.3 em halo eats about 4 px of it. */
const LEVEL_GAP_PX = 9
/** Level labels sit this far outside the slab corner (CSS px). */
const LEVEL_OUT_PX = 6
/** Density cap for names: at most one per cell of this size (CSS px), best landmarkScore first. */
const GRID_W = 80
const GRID_H = 40
/** The destination's name, under its marker (CSS px below the marker's floor point). */
const DEST_BELOW_PX = 14
/** ...or above the marker's pin head. */
const DEST_ABOVE_PX = 50

/** Does a screen rect come within `seg[4]` px of the segment seg = [x1, y1, x2, y2, r]? */
function rectNearSegment(r, seg) {
  const [x1, y1, x2, y2, rad] = seg
  const x0 = r[0] - rad
  const y0 = r[1] - rad
  const xa = r[0] + r[2] + rad
  const ya = r[1] + r[3] + rad
  // Liang-Barsky clip of the segment against the inflated rect
  let t0 = 0
  let t1 = 1
  const dx = x2 - x1
  const dy = y2 - y1
  const edges = [
    [-dx, x1 - x0],
    [dx, xa - x1],
    [-dy, y1 - y0],
    [dy, ya - y1],
  ]
  for (const [pp, q] of edges) {
    if (Math.abs(pp) < 1e-9) {
      if (q < 0) return false
      continue
    }
    const t = q / pp
    if (pp < 0) {
      if (t > t1) return false
      if (t > t0) t0 = t
    } else {
      if (t < t0) return false
      if (t < t1) t1 = t
    }
  }
  return t0 <= t1
}

const _v = new Vector3()
const _v4 = new Vector4()
const _up = new Vector3()
const _right = new Vector3()

export class OverlayLayer {
  constructor() {
    this.batch = new BatchedText()
    this.material = new MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, side: DoubleSide })
    this.batch.material = this.material
    this.batch.renderOrder = 40
    this.batch.frustumCulled = false
    /** @type {Array<LabelSpec & { members: {en: Text, ar: Text}, shown: boolean, sx: number, sy: number }>} */
    this.labels = []
    /** @type {Array<{ mesh: Mesh, levelId: string }>} */
    this.pinMeshes = []
    this.lang = 'en'
    this.colors = { text: '#0B0F14', halo: '#FFFFFF', badgeText: '#FFFFFF', badgeHalo: '#1F2937' }
    /** ids that must always show: the destination (occupant / amenity / connector / anchor ids) */
    this.forced = new Set()
    /** ids named by the current step (its landmark, its lift / escalator): always shown too */
    this.stepForced = new Set()
    /** where the destination's name goes: its marker ({ levelId, x, y, h }) or null (the unit centre) */
    this.destAnchor = null
    /** QR plate pins: null = hidden, true = every plate, or a list of anchor kinds */
    this.scanKinds = null
    this.pinSize = 40
    /** @type {Array<{type:string,id:string,sx:number,sy:number}>} visible pick targets from the last frame */
    this.visibleTargets = []
  }

  /** @param {LabelSpec} spec */
  addLabel(spec) {
    const mk = (lang, str = spec.text[lang]) => {
      const t = new Text()
      // only characters the bundled fonts can draw (textGuard.js: troika would fetch the rest from a CDN)
      t.text = drawableText(str, lang)
      t.font = fontFor(lang)
      t.fontSize = 1
      t.anchorX = 'center'
      t.anchorY = 'middle'
      t.textAlign = 'center'
      t.direction = lang === 'ar' ? 'rtl' : 'ltr'
      t.outlineBlur = spec.type === 'level' || spec.type === 'mbadge' ? 0.02 : 0.0
      t.scale.setScalar(0)
      this.batch.addText(t)
      return t
    }
    const members = { en: mk('en'), ar: mk('ar') }
    if (spec.shortText) {
      members.enShort = mk('en', spec.shortText.en)
      members.arShort = mk('ar', spec.shortText.ar)
    }
    const item = { ...spec, members, shown: false, sx: 0, sy: 0 }
    this.labels.push(item)
    this._colorItem(item)
    return item
  }

  /**
   * The next-turn label beside the target ring (engine setNextTurn): always shown in Floor and 2D, never in the
   * stacked Overview or the Walk view (the UI's bubble names it there). null removes it.
   * @param {{ levelId: string, x: number, y: number, text: {en: string, ar: string} } | null} spec
   */
  setTurnLabel(spec) {
    const i = this.labels.findIndex((l) => l.type === 'turn')
    if (i >= 0) {
      for (const m of Object.values(this.labels[i].members)) {
        this.batch.removeText(m)
        m.dispose()
      }
      this.labels.splice(i, 1)
    }
    if (spec) this.addLabel({ id: 'lbl-turn', type: 'turn', h: 0, priority: 0, px: 14, offsetPx: 30, ...spec })
  }

  /** @param {Mesh} mesh @param {string} levelId */
  addPins(mesh, levelId) {
    this.pinMeshes.push({ mesh, levelId })
  }

  setLanguage(lang) {
    this.lang = lang
  }

  setColors(colors) {
    this.colors = { ...this.colors, ...colors }
    for (const it of this.labels) this._colorItem(it)
  }

  _colorItem(it) {
    const badge = it.type === 'level' || it.type === 'mbadge'
    for (const m of Object.values(it.members)) {
      m.color = badge ? this.colors.badgeText : this.colors.text
      m.outlineColor = badge ? this.colors.badgeHalo : this.colors.halo
      m.outlineWidth = badge ? (this.colors.badgeW ?? 0.26) : 0.17
    }
  }

  /** Start typesetting every label now (instead of on first render). */
  sync(cb) {
    this.batch.sync(cb)
  }

  /**
   * Place pins and labels for the current camera.
   * @param {object} ctx
   * @param {import('three').PerspectiveCamera} ctx.camera
   * @param {number} ctx.width   CSS px
   * @param {number} ctx.height  CSS px
   * @param {'stack'|'floor'|'top'|'fpv'} ctx.mode   in 'fpv' (Walk view) only the always-shown pins and names
   * @param {boolean} [ctx.rtl]  Arabic: level labels sit at the right-hand slab edges
   * @param {(levelId:string)=>number} ctx.levelY      world y of a level floor
   * @param {(levelId:string)=>boolean} ctx.isVisible   level content shown
   * @param {(levelId:string, sx:number, sy:number)=>boolean} ctx.isOccluded  covered by a level above
   * @param {(levelId:string)=>Array<[number, number]>} [ctx.levelOutline] level outline (data coords), for level labels
   * @param {Array<{x:number,y:number,w:number,h:number,levelId?:string,kind?:string}>} ctx.reserved  screen rects of the markers
   * @param {Array<{x:number,y:number,w:number,h:number}>} [ctx.obstacles] screen rects covered by UI
   * @param {Array<{x:number,y:number,w:number,h:number}>} [ctx.keyRects] the route's key points (step start / end,
   *   connector stops): no other pin or name covers them
   * @param {Array<number[]>} [ctx.routeSegments] screen segments [x1, y1, x2, y2, r] of the current and next step:
   *   names keep out of them (soft: the forced ones may cross)
   * @param {Array<{levelId:string, sx:number, sy:number, depth:number, x:number, y:number, wy:number}>} [ctx.markerBadges]
   *   markers that need a level badge (screen point, depth, data x / y and world y of the marker's floor point)
   */
  update(ctx) {
    const { camera, width, height, mode } = ctx
    const fpv = mode === 'fpv'
    const lang = this.lang
    const tanHalf = Math.tan((camera.fov * Math.PI) / 360)
    const pxToWorld = (depth) => (2 * depth * tanHalf) / height
    _up.set(0, 1, 0).applyQuaternion(camera.quaternion)
    _right.set(1, 0, 0).applyQuaternion(camera.quaternion)

    const toRect = (r) => [r.x, r.y, r.w, r.h]
    const obstacles = (ctx.obstacles ?? []).map(toRect)
    const markerRects = (ctx.reserved ?? []).map(toRect)
    const keyRects = (ctx.keyRects ?? []).map(toRect)
    const segs = ctx.routeSegments ?? []
    const overlap = (r, q) => r[0] < q[0] + q[2] && r[0] + r[2] > q[0] && r[1] < q[1] + q[3] && r[1] + r[3] > q[1]
    const hits = (r, list) => {
      for (const q of list) if (overlap(r, q)) return q
      return null
    }
    const underUi = (r) => hits(r, obstacles) != null
    const onScreen = (r, m = 4) => r[0] >= m && r[1] >= m && r[0] + r[2] <= width - m && r[1] + r[3] <= height - m
    const free = (r, avoid) => onScreen(r) && !underUi(r) && !(avoid && hits(r, avoid))
    const hitsRoute = (r) => segs.some((sg) => rectNearSegment(r, sg))
    const forcedOf = (...ids) => {
      for (const id of ids) if (id && this.forced.has(id)) return 2
      for (const id of ids) if (id && this.stepForced.has(id)) return 1
      return 0
    }
    // Walk view: only the forced pins and names, and not the step's lift / escalator / landmark when it stands within
    // 3 m of the next-turn ring, nor the destination's own name on the last step (the UI's turn bubble and turn card
    // already name it, and so does its sign: one marker per turn)
    const T = ctx.turnAt
    const skip = (f, x, y) => fpv && (!f || (T && (f < 2 ? Math.hypot(x - T.x, y - T.y) < 3 : T.kind === 'arrive')))
    /**
     * The smallest move [dx, dy] (CSS px, at most maxPx) that takes a rect out from under the controls and in from
     * the screen edges (and off `avoid`), or null.
     */
    const slideFree = (rect, maxPx, avoid = null) => {
      if (free(rect, avoid)) return [0, 0]
      const [x, y, w, h] = rect
      const moves = []
      for (const q of avoid ? obstacles.concat(avoid) : obstacles) {
        if (!overlap(rect, q)) continue
        moves.push([q[0] - (x + w) - 4, 0], [q[0] + q[2] - x + 4, 0], [0, q[1] - (y + h) - 4], [0, q[1] + q[3] - y + 4])
      }
      const edge = [x < 4 ? 4 - x : x + w > width - 4 ? width - 4 - x - w : 0, y < 4 ? 4 - y : y + h > height - 4 ? height - 4 - y - h : 0]
      if (edge[0] || edge[1]) moves.push(edge)
      // a move away from one control can run into the screen edge: also try it with the edge correction
      for (const m of moves.slice()) {
        const r = [x + m[0], y + m[1], w, h]
        const ex = r[0] < 4 ? 4 - r[0] : r[0] + w > width - 4 ? width - 4 - r[0] - w : 0
        const ey = r[1] < 4 ? 4 - r[1] : r[1] + h > height - 4 ? height - 4 - r[1] - h : 0
        if (ex || ey) moves.push([m[0] + ex, m[1] + ey])
      }
      moves.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]))
      for (const m of moves) {
        if (Math.hypot(m[0], m[1]) > maxPx) break
        if (free([x + m[0], y + m[1], w, h], avoid)) return m
      }
      return null
    }

    /** @type {Array<any>} */
    const cands = []
    const project = (x, y, z) => {
      _v4.set(x, y, z, 1).applyMatrix4(camera.matrixWorldInverse)
      const depth = -_v4.z
      if (depth <= 0.1) return null
      _v4.applyMatrix4(camera.projectionMatrix)
      const sx = ((_v4.x / _v4.w) * 0.5 + 0.5) * width
      const sy = (1 - ((_v4.y / _v4.w) * 0.5 + 0.5)) * height
      return { sx, sy, depth }
    }
    const inView = (sx, sy, m = 40) => sx > -m && sx < width + m && sy > -m && sy < height + m

    // pins
    const size = this.pinSize
    for (const pm of this.pinMeshes) {
      const pins = pm.mesh.userData.pins
      pm.mesh.material.uniforms.uViewport.value.set(width, height)
      pm.mesh.material.uniforms.uSize.value = size
      const levelShown = ctx.isVisible(pm.levelId)
      pm.mesh.visible = levelShown
      if (!levelShown) continue
      const ly = ctx.levelY(pm.levelId)
      pins.forEach((p, i) => {
        p._visible = false
        const scanPin = Boolean(p.scan)
        if (scanPin && (!this.scanKinds || (this.scanKinds !== true && !this.scanKinds.includes(p.kind)))) return
        if (mode === 'stack' && !p.stack) return
        const s = project(p.x, ly + p.h, -p.y)
        if (!s || !inView(s.sx, s.sy, size)) return
        if (ctx.isOccluded(pm.levelId, s.sx, s.sy)) return
        const f = forcedOf(p.id)
        if (skip(f, p.x, p.y)) return
        const important = f > 0 || scanPin
        let rect = [s.sx - size * 0.42, s.sy - size, size * 0.84, size]
        let shift = [0, 0]
        if (!onScreen(rect, 2) || underUi(rect)) {
          // the destination, the step's lift / escalator and the plates to tap move out from under a control
          if (!important) return
          const d = slideFree(rect, size * 1.6)
          if (!d) return
          shift = d
          rect = [rect[0] + d[0], rect[1] + d[1], rect[2], rect[3]]
        }
        // the route's key points (where the step starts and ends, connector stops) stay clear
        if (!important && hits(rect, keyRects)) return
        cands.push({
          kind: 'pin',
          pri: f === 2 ? 1000 : f === 1 ? 900 : scanPin ? 500 : p.priority + 20,
          forced: f > 0,
          rect,
          ref: { pm, i, p },
          shift,
          sx: s.sx + shift[0],
          sy: s.sy - size * 0.6 + shift[1],
          depth: s.depth,
        })
      })
    }

    // level labels (stack view): their own column, never dropped
    const levelPlaced = []
    const levelItems = []
    for (const it of this.labels) {
      it.shown = false
      it.activeMember = null
      if (it.type !== 'level') continue
      if (mode !== 'stack' || !ctx.isVisible(it.levelId)) continue
      const anchor = this._levelAnchor(it, ctx, project)
      if (anchor) levelItems.push({ it, anchor })
    }
    if (levelItems.length) this._layoutLevelLabels(levelItems, ctx, obstacles.concat(markerRects), hits, levelPlaced)

    // level badges under markers that are not on the top floor shown (stack view)
    const badgeCands = this._placeBadges(ctx.markerBadges ?? [], ctx, slideFree, levelPlaced.concat(markerRects))
    for (const b of badgeCands) levelPlaced.push(b.rect)

    // other labels
    for (const it of this.labels) {
      if (it.type === 'level' || it.type === 'mbadge') continue
      const m = it.members[lang]
      const info = m.textRenderInfo
      if (!info) continue
      if (!ctx.isVisible(it.levelId)) continue
      const modes = it.modes ?? 'all'
      if (modes === 'stack' && mode !== 'stack') continue
      if (modes === 'flat' && mode === 'stack') continue
      const turn = it.type === 'turn'
      if (turn && mode !== 'floor' && mode !== 'top') continue
      const f = turn ? 1 : forcedOf(it.refOccupantId, it.pickId, it.id)
      if (skip(f, it.x, it.y)) continue
      if (mode === 'stack' && it.priority < 3 && !f) continue
      // arrival: the shop's own sign is in view and names it
      if (f === 2 && this.destAnchor?.noLabel) continue
      // the destination's name goes by its marker: the middle of a unit can be far from its door, or off screen
      const at = f === 2 && this.destAnchor && this.destAnchor.levelId === it.levelId ? this.destAnchor : null
      const ax = at ? at.x : it.x
      const ay = at ? at.y : it.y
      const wy = ctx.levelY(it.levelId) + (at ? (at.h ?? 0) : it.h)
      const s = project(ax, wy, -ay)
      // (a forced name whose place is off screen is not shown: it would float far from what it names)
      if (!s || !inView(s.sx, s.sy, 80)) continue
      if (ctx.isOccluded(it.levelId, s.sx, s.sy)) continue
      const px = (it.px ?? 14) + (lang === 'ar' ? 2 : 0)
      const bb = info.blockBounds
      const w = (bb[2] - bb[0]) * px
      const h = (bb[3] - bb[1]) * px * 0.82
      let dx = 0
      let dy = it.offsetPx ?? 0
      if (f) {
        // always shown: under the marker / at its spot, above it, or slid sideways; else the nearest free place
        const below = at ? DEST_BELOW_PX + h / 2 : dy
        const above = at ? -(DEST_ABOVE_PX + h / 2) : dy - h - 14
        let pickT = null
        for (const ty of [below, above]) {
          for (const tx of [0, -(w / 2 + 14), w / 2 + 14, -w, w]) {
            if (free([s.sx + tx - w / 2, s.sy + ty - h / 2, w, h], markerRects)) {
              pickT = [tx, ty]
              break
            }
          }
          if (pickT) break
        }
        if (!pickT) {
          const d = slideFree([s.sx - w / 2, s.sy + below - h / 2, w, h], Math.max(width, height), markerRects)
          pickT = d ? [d[0], below + d[1]] : [0, below]
        }
        dx = pickT[0]
        dy = pickT[1]
      } else {
        let sx = s.sx
        if ((it.type === 'occupant' || it.type === 'landmark') && s.sx > 0 && s.sx < width) {
          // a unit cut by the screen edge keeps its label: slide it in by up to half its width
          const clamped = Math.min(Math.max(sx, w / 2 + 6), width - w / 2 - 6)
          if (Math.abs(clamped - sx) <= w / 2) sx = clamped
        }
        dx = sx - s.sx
        // a name under a control slides out from under it by up to half its width; else it is left out
        const r = [s.sx + dx - w / 2, s.sy + dy - h / 2, w, h]
        if (!free(r)) {
          const d = slideFree(r, w / 2 + 10)
          if (!d) continue
          dx += d[0]
          dy += d[1]
        }
        // names never sit on the route the shopper is about to walk
        if (hitsRoute([s.sx + dx - w / 2, s.sy + dy - h / 2, w, h])) continue
      }
      const sx = s.sx + dx
      const cy = s.sy + dy
      cands.push({
        kind: 'label',
        pri: (f === 2 ? 1000 : f === 1 ? 900 : 0) + it.priority,
        forced: f > 0,
        dest: f === 2,
        rect: [sx - w / 2 - PAD_X, cy - h / 2 - PAD_Y, w + 2 * PAD_X, h + 2 * PAD_Y],
        ref: it,
        member: m,
        sx,
        shiftPx: dx,
        shiftYPx: dy,
        sy: cy,
        depth: s.depth,
        px,
        wy,
        ax,
        ay,
      })
    }

    cands.sort((a, b) => b.pri - a.pri || a.depth - b.depth)
    const placed = markerRects.concat(levelPlaced)
    const accepted = levelItems.filter((x) => x.cand).map((x) => x.cand).concat(badgeCands)
    const cells = new Set()
    const forcedPlaced = []
    for (const c of cands) {
      if (!c.forced && hits(c.rect, placed)) continue
      if (c.forced && c.kind === 'label') {
        // two always-shown names (the destination and the step's landmark) never sit on each other: the later one
        // moves just below or above the earlier one (pulled in from the screen edge when it pokes out)
        const q = hits(c.rect, forcedPlaced)
        if (q) {
          const dx = Math.min(Math.max(c.rect[0], 5), width - 5 - c.rect[2]) - c.rect[0]
          for (const dy of [q[1] + q[3] + 2 - c.rect[1], q[1] - 2 - (c.rect[1] + c.rect[3])]) {
            const r = [c.rect[0] + dx, c.rect[1] + dy, c.rect[2], c.rect[3]]
            if (!free(r) || hits(r, forcedPlaced)) continue
            c.rect = r
            c.sx += dx
            c.shiftPx += dx
            c.sy += dy
            c.shiftYPx += dy
            break
          }
        }
        forcedPlaced.push(c.rect)
      }
      if (c.kind === 'label' && !c.forced) {
        // density: one name per grid cell, the most prominent first
        const cell = `${Math.floor(c.sx / GRID_W)},${Math.floor(c.sy / GRID_H)}`
        if (cells.has(cell)) continue
        cells.add(cell)
      }
      placed.push(c.rect)
      // keep the destination's name on its own: neighbours within 24 px are left out
      if (c.kind === 'label' && c.dest) placed.push([c.rect[0] - DEST_CLEAR_PX, c.rect[1] - DEST_CLEAR_PX, c.rect[2] + 2 * DEST_CLEAR_PX, c.rect[3] + 2 * DEST_CLEAR_PX])
      accepted.push(c)
    }

    // apply pins
    for (const pm of this.pinMeshes) {
      pm.mesh.geometry.getAttribute('aVis').array.fill(0)
      pm.mesh.geometry.getAttribute('aShift').array.fill(0)
    }
    this.visibleTargets = []
    for (const c of accepted) {
      if (c.kind !== 'pin') continue
      const { pm, i, p } = c.ref
      const vis = pm.mesh.geometry.getAttribute('aVis')
      vis.array.fill(1, i * 4, i * 4 + 4)
      if (c.shift[0] || c.shift[1]) {
        const sh = pm.mesh.geometry.getAttribute('aShift').array
        for (let k = 0; k < 4; k++) {
          sh[(i * 4 + k) * 2] = c.shift[0]
          sh[(i * 4 + k) * 2 + 1] = c.shift[1]
        }
      }
      p._visible = true
      this.visibleTargets.push({ type: p.type, id: p.id, sx: c.sx, sy: c.sy })
    }
    for (const pm of this.pinMeshes) {
      pm.mesh.geometry.getAttribute('aVis').needsUpdate = true
      pm.mesh.geometry.getAttribute('aShift').needsUpdate = true
    }

    // apply labels
    for (const it of this.labels) for (const m of Object.values(it.members)) m.scale.setScalar(0)
    for (const c of accepted) {
      if (c.kind !== 'label') continue
      const it = c.ref
      const m = c.member
      const k = pxToWorld(c.depth)
      m.position.set(c.ax, c.wy, -c.ay)
      if (c.shiftYPx) m.position.addScaledVector(_up, -c.shiftYPx * k)
      if (c.shiftPx) m.position.addScaledVector(_right, c.shiftPx * k)
      m.quaternion.copy(camera.quaternion)
      m.scale.setScalar(c.px * k)
      it.shown = true
      it.activeMember = m
      it.sx = c.sx
      it.sy = c.sy
      if (it.type !== 'level' && it.type !== 'mbadge' && it.type !== 'turn') this.visibleTargets.push({ type: it.pickType ?? it.type, id: it.pickId ?? it.id, sx: c.sx, sy: c.sy })
    }
    // members changed transforms: the batch reads member matrices when it renders
    this.batch.updateMatrixWorld(true)
  }

  /**
   * Width (CSS px) the stack view's column of level names needs beside the slabs, for the camera fit: the widest
   * full name plus its gap, measured once typeset (estimated from the letters before that).
   * @param {'en'|'ar'} lang
   */
  levelColumnWidth(lang = this.lang) {
    const px = 15 + (lang === 'ar' ? 2 : 0)
    let w = 0
    for (const it of this.labels) {
      if (it.type !== 'level') continue
      const bb = it.members[lang]?.textRenderInfo?.blockBounds
      const lw = bb ? (bb[2] - bb[0]) * px : String(it.text[lang] ?? '').length * px * (lang === 'ar' ? 0.5 : 0.56)
      w = Math.max(w, lw)
    }
    return w ? w + LEVEL_OUT_PX + 16 : 0
  }

  /**
   * Screen anchor of a level label: the slab corner furthest towards the reading start (left in English,
   * right in Arabic), so the column of level names sits beside the stack, away from the level picker.
   */
  _levelAnchor(it, ctx, project) {
    const outline = ctx.levelOutline?.(it.levelId)
    const wy = ctx.levelY(it.levelId)
    let best = null
    if (outline?.length) {
      for (const [x, y] of outline) {
        const s = project(x, wy, -y)
        if (!s) continue
        if (!best || (ctx.rtl ? s.sx > best.sx : s.sx < best.sx)) best = { ...s, x, y }
      }
    }
    if (!best) {
      const s = project(it.x, wy + it.h, -it.y)
      if (!s) return null
      best = { ...s, x: it.x, y: it.y }
    }
    return { ...best, wy }
  }

  /**
   * Lay out the level labels as one column beside the slabs: each name grows outward from its slab's
   * reading-start corner (to the left in English, to the right in Arabic), pushed down until it clears the one
   * above, the controls and the markers. Full names when every one fits outside its slab, else the short codes
   * ("B1", «ب١») for the whole column, so the names never cover the shops.
   */
  _layoutLevelLabels(items, ctx, obstacles, hits, out) {
    const { width, height } = ctx
    const lang = this.lang
    const px = 15 + (lang === 'ar' ? 2 : 0)
    const sizeOf = (m) => {
      const bb = m?.textRenderInfo?.blockBounds
      if (!bb) return null
      return { w: (bb[2] - bb[0]) * px, h: (bb[3] - bb[1]) * px * 0.82 }
    }
    // the band between the top controls and the sheet
    let bottom = height - 4
    for (const q of obstacles) if (q[1] > height * 0.35 && q[0] < width / 2 + 40 && q[0] + q[2] > width / 2 - 40) bottom = Math.min(bottom, q[1] - 4)
    items.sort((a, b) => a.anchor.sy - b.anchor.sy)
    const layout = (useShort) => {
      let prevBottom = -Infinity
      const res = []
      for (const entry of items) {
        const { it, anchor } = entry
        const m = useShort ? (it.members[lang + 'Short'] ?? it.members[lang]) : it.members[lang]
        const sz = sizeOf(m)
        if (!sz) return null
        const want = ctx.rtl ? anchor.sx + LEVEL_OUT_PX + sz.w / 2 : anchor.sx - LEVEL_OUT_PX - sz.w / 2
        const cx = Math.min(Math.max(want, sz.w / 2 + 8), width - sz.w / 2 - 8)
        let cy = Math.max(anchor.sy, prevBottom + LEVEL_GAP_PX + sz.h / 2)
        let rect = [cx - sz.w / 2 - 4, cy - sz.h / 2 - 2, sz.w + 8, sz.h + 4]
        // slide down below any control or marker it would sit under
        for (let guard = 0; guard < 6; guard++) {
          const q = hits(rect, obstacles)
          if (!q) break
          cy = q[1] + q[3] + 4 + sz.h / 2
          rect = [cx - sz.w / 2 - 4, cy - sz.h / 2 - 2, sz.w + 8, sz.h + 4]
        }
        prevBottom = rect[1] + rect[3]
        res.push({ entry, m, cx, cy, rect, overSlab: Math.abs(cx - want), ok: !hits(rect, obstacles) && rect[1] + rect[3] <= bottom })
      }
      return res
    }
    let pick = layout(false)
    if (!pick || pick.some((r) => !r.ok || r.overSlab > 10)) {
      const alt = layout(true)
      if (alt) pick = alt
    }
    if (!pick) return
    for (const r of pick) {
      const { it, anchor } = r.entry
      out.push(r.rect)
      r.entry.cand = {
        kind: 'label',
        pri: 2000,
        rect: r.rect,
        ref: it,
        member: r.m,
        sx: r.cx,
        sy: r.cy,
        shiftPx: r.cx - anchor.sx,
        shiftYPx: r.cy - anchor.sy,
        depth: anchor.depth,
        px,
        wy: anchor.wy,
        ax: anchor.x,
        ay: anchor.y,
      }
    }
  }

  /**
   * Level badges ("B1" / «ب١») under markers on a floor below the top one shown in stack view, so a car on B1
   * drawn over the Ground slab still says where it is.
   */
  _placeBadges(badges, ctx, slideFree, avoid) {
    const out = []
    if (ctx.mode !== 'stack' || !badges.length) return out
    const lang = this.lang
    const px = 14 + (lang === 'ar' ? 2 : 0)
    for (const b of badges) {
      const it = this.labels.find((l) => l.type === 'mbadge' && l.levelId === b.levelId)
      const m = it?.members[lang]
      const bb = m?.textRenderInfo?.blockBounds
      if (!bb) continue
      const w = (bb[2] - bb[0]) * px
      const h = (bb[3] - bb[1]) * px * 0.82
      let rect = [b.sx - w / 2 - 4, b.sy + 8, w + 8, h + 4]
      const d = slideFree(rect, 80, avoid.concat(out.map((o) => o.rect)))
      if (d) rect = [rect[0] + d[0], rect[1] + d[1], rect[2], rect[3]]
      const cx = rect[0] + rect[2] / 2
      const cy = rect[1] + rect[3] / 2
      // world anchor: the marker's floor point; shifted on screen like the other labels
      out.push({
        kind: 'label',
        pri: 1900,
        rect,
        ref: it,
        member: m,
        sx: cx,
        sy: cy,
        shiftPx: cx - b.sx,
        shiftYPx: cy - b.sy,
        depth: b.depth,
        px,
        wy: b.wy,
        ax: b.x,
        ay: b.y,
      })
    }
    return out
  }

  dispose() {
    for (const it of this.labels) {
      for (const m of Object.values(it.members)) {
        this.batch.removeText(m)
        m.dispose()
      }
    }
    this.labels = []
    this.batch.dispose()
    this.material.dispose()
    for (const pm of this.pinMeshes) {
      pm.mesh.geometry.dispose()
      pm.mesh.material.dispose()
    }
    this.pinMeshes = []
  }
}

/**
 * Is a screen point inside a projected level footprint (used to hide pins/labels of lower levels
 * that sit under an upper level in stack view)?
 * @param {Array<[number, number]>} screenPoly
 * @param {number} sx
 * @param {number} sy
 */
export function screenPointInPoly(screenPoly, sx, sy) {
  return pointInPolygon([sx, sy], screenPoly)
}
