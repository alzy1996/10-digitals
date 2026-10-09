/**
 * Map markers: 'you' (blue puck + white ring; 'lastSeen' = grey pin; 'estimated' = hollow halo),
 * 'dest' (green ring + pin; state 'arrived' = the ring alone, PLAN.md 19.2 "600 ms green ring"), 'car' (amber
 * car-shaped block with a dark outline, a little shorter than a real car so the painted bay code at the bay
 * mouth stays readable) and 'walker' (the SIMULATION avatar: a friendly capsule character with a heading cone).
 * All materials are unlit; simple shading is baked into vertex colours.
 * On screen every marker keeps between a minimum and a maximum size (layout), so it neither vanishes when the
 * camera is far nor grows into a blob over the place it marks when the camera is close.
 */
import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
  Vector3,
  BufferGeometry,
} from 'three'
import { themeColor } from './palette.js'

const LIGHT = new Vector3(-0.35, 0.85, 0.4).normalize()

/**
 * On-screen size limits per marker, as [min, max] CSS px of its radius: a car about 210 px long at most (about its bay
 * at the find-my-car arrival view, never a blob running off the screen), a
 * destination pin about 56 px tall, the you puck 56 px across.
 */
const MARKER_PX = { you: [14, 28], car: [16, 110], dest: [14, 30], walker: [16, 26] }

/**
 * Bake a simple light into vertex colours (non-indexed or indexed geometry with normals).
 * @param {BufferGeometry} g
 * @param {Color} base
 * @param {number} [ambient]
 */
function bake(g, base, ambient = 0.62) {
  const n = g.getAttribute('normal')
  const count = g.getAttribute('position').count
  const col = new Float32Array(count * 3)
  const v = new Vector3()
  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(n, i)
    const s = ambient + (1 - ambient) * Math.max(0, v.dot(LIGHT))
    col[i * 3] = base.r * s
    col[i * 3 + 1] = base.g * s
    col[i * 3 + 2] = base.b * s
  }
  g.setAttribute('color', new BufferAttribute(col, 3))
  return g
}

function flatDisc(r, color, opacity = 1, segs = 40) {
  // a ring with no hole is a disc (one geometry class fewer in the engine chunk)
  const g = new RingGeometry(0, r, segs)
  g.rotateX(-Math.PI / 2)
  const m = new MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, side: DoubleSide })
  return new Mesh(g, m)
}

function flatRing(r0, r1, color, opacity = 1, segs = 48) {
  const g = new RingGeometry(r0, r1, segs)
  g.rotateX(-Math.PI / 2)
  const m = new MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, side: DoubleSide })
  return new Mesh(g, m)
}

/** A flat wedge (heading cone) pointing along -Z (north) in local space. */
function headingWedge(len, halfAngleDeg, color, opacity) {
  const a = (halfAngleDeg * Math.PI) / 180
  const g = new BufferGeometry()
  const segs = 12
  const pos = [0, 0, 0]
  for (let i = 0; i <= segs; i++) {
    const t = -a + (2 * a * i) / segs
    pos.push(Math.sin(t) * len, 0, -Math.cos(t) * len)
  }
  const idx = []
  for (let i = 1; i <= segs; i++) idx.push(0, i + 1, i)
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setIndex(idx)
  const m = new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: DoubleSide })
  return new Mesh(g, m)
}

function pinShape(color, height = 3.2, headR = 0.75) {
  const grp = new Group()
  const head = new SphereGeometry(headR, 20, 14)
  head.translate(0, height, 0)
  const tip = new CylinderGeometry(0, headR * 0.83, height - 0.25, 20, 1) // a cone
  tip.rotateX(Math.PI)
  tip.translate(0, (height - 0.25) / 2, 0)
  const mat = new MeshBasicMaterial({ vertexColors: true })
  grp.add(new Mesh(bake(head, color, 0.7), mat))
  grp.add(new Mesh(bake(tip, color, 0.7), mat))
  const dot = new SphereGeometry(headR * 0.4, 12, 8)
  dot.translate(0, height, headR * 0.83)
  grp.add(new Mesh(dot, new MeshBasicMaterial({ color: 0xffffff })))
  return grp
}

/**
 * A capsule (radius r, straight part len, centred on the origin, along y) from a sphere whose two halves are pushed
 * apart: the equator ring stretches into the straight part (no extra geometry class in the engine chunk).
 */
function capsule(r, len) {
  const g = new SphereGeometry(r, 20, 16)
  const pos = g.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (y > 1e-6) pos.setY(i, y + len / 2)
    else if (y < -1e-6) pos.setY(i, y - len / 2)
  }
  pos.needsUpdate = true
  g.computeBoundingSphere()
  return g
}

/** Inverted-hull outline for a geometry. */
function outlineOf(g, color, grow = 0.08) {
  const og = g.clone()
  const pos = og.getAttribute('position')
  const nor = og.getAttribute('normal')
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) + nor.getX(i) * grow, pos.getY(i) + nor.getY(i) * grow, pos.getZ(i) + nor.getZ(i) * grow)
  }
  return new Mesh(og, new MeshBasicMaterial({ color, side: BackSide }))
}

/**
 * Build a marker group (local origin on the floor, -Z = heading 0 / north).
 * @param {'you'|'car'|'dest'|'walker'} kind
 * @param {string} state
 * @param {'sunlight'|'basement'} theme
 */
function buildMarker(kind, state, theme) {
  const g = new Group()
  g.name = `marker-${kind}`
  const heading = new Group()
  g.add(heading)
  let radius = 1.2
  if (kind === 'you') {
    const you = themeColor(theme, 'you')
    const ring = themeColor(theme, 'youRing')
    if (state === 'lastSeen') {
      const c = themeColor(theme, 'lastSeen')
      g.add(flatDisc(0.9, c, 0.35))
      g.add(pinShape(c, 3.0))
      radius = 1.1
    } else if (state === 'estimated') {
      g.add(flatRing(1.7, 2.2, you, 0.85))
      g.add(flatDisc(1.7, you, 0.18))
      radius = 2.2
    } else {
      g.add(flatDisc(2.6, you, 0.16))
      const base = new CylinderGeometry(1.2, 1.2, 0.28, 40)
      base.translate(0, 0.14, 0)
      g.add(new Mesh(bake(base, ring, 0.85), new MeshBasicMaterial({ vertexColors: true })))
      const puck = new CylinderGeometry(0.88, 0.88, 0.42, 40)
      puck.translate(0, 0.21, 0)
      g.add(new Mesh(bake(puck, you, 0.8), new MeshBasicMaterial({ vertexColors: true })))
      const wedge = headingWedge(3.2, 32, you, 0.32)
      wedge.position.y = 0.06
      heading.add(wedge)
      radius = 1.25
    }
  } else if (kind === 'dest') {
    const c = themeColor(theme, 'dest')
    if (state === 'arrived') {
      // arrival: the green ring alone, on the floor in front of the door (no pin over the doorway)
      g.add(flatRing(1.05, 1.5, c, 1))
      g.add(flatDisc(1.05, c, 0.18))
      radius = 1.5
    } else {
      g.add(flatRing(0.95, 1.4, c, 1))
      g.add(flatDisc(0.95, c, 0.22))
      // short pin, stood in front of the shop (see engine setMarker): from the arrival camera its head stays
      // below the shop sign
      const pin = pinShape(c, 1.9, 0.58)
      g.add(pin)
      radius = 1.4
    }
  } else if (kind === 'car') {
    const amber = themeColor(theme, 'car')
    const dark = themeColor(theme, 'carOutline')
    // 1.7 x 3.6 m: shorter than a real car, so standing toward the back of its bay (engine setMarker) it leaves
    // the painted code at the bay mouth uncovered
    const body = new BoxGeometry(1.7, 0.72, 3.6, 1, 1, 1)
    body.translate(0, 0.58, 0)
    const cabin = new BoxGeometry(1.42, 0.56, 1.85)
    cabin.translate(0, 1.22, 0.2)
    const matV = new MeshBasicMaterial({ vertexColors: true })
    heading.add(outlineOf(body, dark, 0.08))
    heading.add(outlineOf(cabin, dark, 0.08))
    heading.add(new Mesh(bake(body, amber, 0.72), matV))
    heading.add(new Mesh(bake(cabin, amber.clone().multiplyScalar(0.92), 0.72), matV))
    // windscreen + headlights (front = -Z)
    const glass = new BoxGeometry(1.26, 0.38, 0.06)
    glass.translate(0, 1.24, -0.74)
    heading.add(new Mesh(glass, new MeshBasicMaterial({ color: dark })))
    for (const x of [-0.55, 0.55]) {
      const hl = new BoxGeometry(0.38, 0.18, 0.06)
      hl.translate(x, 0.7, -1.82)
      heading.add(new Mesh(hl, new MeshBasicMaterial({ color: 0xffffff })))
    }
    for (const x of [-0.88, 0.88]) {
      for (const z of [-1.12, 1.12]) {
        const w = new CylinderGeometry(0.32, 0.32, 0.24, 16)
        w.rotateZ(Math.PI / 2)
        w.translate(x, 0.32, z)
        heading.add(new Mesh(w, new MeshBasicMaterial({ color: dark })))
      }
    }
    g.add(flatDisc(1.7, amber, 0.18))
    radius = 1.9
  } else if (kind === 'walker') {
    const body = themeColor(theme, 'walker')
    const dark = themeColor(theme, 'walkerOutline')
    g.add(flatDisc(0.75, new Color(0x0b0f14), 0.22))
    const cone = headingWedge(3.6, 26, body, 0.38)
    cone.position.y = 0.07
    heading.add(cone)
    const cap = capsule(0.5, 0.95)
    cap.translate(0, 0.5 + 0.475, 0)
    heading.add(outlineOf(cap, dark, 0.07))
    heading.add(new Mesh(bake(cap, body, 0.6), new MeshBasicMaterial({ vertexColors: true })))
    // face: white eyes with dark pupils looking along the heading (-Z)
    for (const x of [-0.19, 0.19]) {
      const eye = new SphereGeometry(0.15, 14, 10)
      eye.translate(x, 1.62, -0.4)
      heading.add(new Mesh(eye, new MeshBasicMaterial({ color: 0xffffff })))
      const pupil = new SphereGeometry(0.075, 10, 8)
      pupil.translate(x, 1.62, -0.53)
      heading.add(new Mesh(pupil, new MeshBasicMaterial({ color: dark })))
    }
    // a small white "SIM" band so it never reads as live positioning
    const band = new CylinderGeometry(0.52, 0.52, 0.16, 24, 1, true)
    band.translate(0, 0.95, 0)
    heading.add(new Mesh(band, new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide })))
    radius = 0.9
  }
  g.userData.heading = heading
  g.userData.radius = radius
  return g
}

export class MarkerLayer {
  constructor() {
    this.root = new Group()
    this.root.name = 'markers'
    /** @type {Record<string, { value: any, group: Group, key: string } | undefined>} */
    this.items = {}
    this.theme = 'sunlight'
  }

  /**
   * @param {'you'|'car'|'dest'|'walker'} kind
   * @param {{levelId:string,x:number,y:number,headingDeg?:number,state?:string,elevation?:number}|null} value
   */
  set(kind, value) {
    const prev = this.items[kind]
    if (!value) {
      if (prev) this._drop(kind)
      return
    }
    const key = `${kind}|${value.state ?? 'exact'}|${this.theme}`
    if (!prev || prev.key !== key) {
      if (prev) this._drop(kind)
      const group = buildMarker(kind, value.state ?? 'exact', this.theme)
      this.root.add(group)
      this.items[kind] = { value, group, key }
    } else {
      prev.value = value
    }
  }

  get(kind) {
    return this.items[kind]?.value ?? null
  }

  setTheme(theme) {
    if (theme === this.theme) return
    this.theme = theme
    const vals = Object.fromEntries(Object.entries(this.items).map(([k, it]) => [k, it?.value]))
    for (const [k, v] of Object.entries(vals)) if (v) this.set(k, v)
  }

  /**
   * Position, scale (min on-screen size) and visibility.
   * @param {object} ctx
   * @param {(levelId:string)=>number} ctx.levelY
   * @param {(levelId:string)=>boolean} ctx.isVisible
   * @param {(m:{levelId:string,x:number,y:number})=>number|null} ctx.elevationOverride world y or null
   * @param {(worldPos:Vector3)=>number} ctx.pxPerMeter
   */
  layout(ctx) {
    for (const [kind, it] of Object.entries(this.items)) {
      if (!it) continue
      const v = it.value
      const g = it.group
      const yOverride = ctx.elevationOverride(kind, v)
      g.visible = ctx.isVisible(v.levelId) || yOverride != null
      const y = yOverride ?? ctx.levelY(v.levelId)
      g.position.set(v.x, y + 0.03, -v.y)
      const h = typeof v.headingDeg === 'number' ? v.headingDeg : 0
      g.userData.heading.rotation.y = (-h * Math.PI) / 180
      g.userData.heading.visible = kind === 'car' || kind === 'walker' || typeof v.headingDeg === 'number'
      const ppm = ctx.pxPerMeter(g.position)
      const rpx = Math.max(1e-6, g.userData.radius * ppm)
      const [minPx, maxPx] = MARKER_PX[kind] ?? [14, 30]
      // never smaller than true size until it would drop under minPx; never larger on screen than maxPx
      const s = Math.min(8, Math.max(1, minPx / rpx), Math.max(0.05, maxPx / rpx))
      g.scale.setScalar(s)
      it.screenRadius = rpx * s
    }
  }

  /** Screen rects the label layer must keep free (with the marker's kind, level and depth). */
  screenRects(project) {
    const out = []
    for (const [kind, it] of Object.entries(this.items)) {
      if (!it || !it.group.visible) continue
      const s = project(it.group.position)
      if (!s) continue
      const r = Math.max(16, Math.min(40, it.screenRadius ?? 18))
      const top = kind === 'dest' && it.value.state !== 'arrived' ? r * 2.1 : kind === 'walker' ? r * 2.4 : r * 1.4
      out.push({ x: s.sx - r, y: s.sy - top, w: 2 * r, h: top + r * 0.6, kind, levelId: it.value.levelId })
    }
    return out
  }

  _drop(kind) {
    const it = this.items[kind]
    if (!it) return
    this.root.remove(it.group)
    disposeTree(it.group)
    delete this.items[kind]
  }

  dispose() {
    for (const k of Object.keys(this.items)) this._drop(k)
  }
}

/** Dispose every geometry and material under an object. */
export function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose()
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        for (const v of Object.values(m)) if (v && v.isTexture) v.dispose()
        m.dispose()
      }
    }
  })
}
