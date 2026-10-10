/**
 * Parking bays: ONE InstancedMesh per level (white U-shaped line outline + fill quad).
 * The fill is the asphalt colour for normal bays (so the zone decal tints them like the floor
 * around them) and a neutral grey for accessible bays, which also carry a white wheelchair symbol
 * (one more instanced mesh). Route blue and car amber never appear on the floor (PLAN.md 19.2).
 * Colours are uniforms, so a theme switch is free.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  ShaderMaterial,
  Vector3,
} from 'three'
import { themeColor } from './palette.js'
import { drawAccessible } from './icons.js'

const SYMBOL_M = 2.0

/** White wheelchair pictogram on a transparent canvas (no image files). */
function accessibleSymbolTexture() {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const ctx = c.getContext('2d')
  ctx.translate(64, 66)
  ctx.scale(1.7, 1.7)
  ctx.fillStyle = '#FFFFFF'
  ctx.strokeStyle = '#FFFFFF'
  drawAccessible(ctx)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.minFilter = LinearMipmapLinearFilter
  tex.magFilter = LinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}

const VERT = /* glsl */ `
attribute float aFill;
attribute float aKind;
uniform vec3 uLine;
uniform vec3 uFill;
uniform vec3 uAccessible;
varying vec3 vCol;
void main(){
vCol=aFill>0.5?(aKind>0.5?uAccessible:uFill):uLine;
gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);
}
`
const FRAG = /* glsl */ `
varying vec3 vCol;
void main(){
gl_FragColor=vec4(vCol,1.0);
#include <colorspace_fragment>
}
`

/**
 * Unit bay geometry for a w x l bay; local -Z = driving direction (back line at -l/2, mouth open at +l/2).
 */
function bayGeometry(w, l) {
  const lw = 0.12
  const pos = []
  const fill = []
  const idx = []
  const quad = (x0, z0, x1, z1, y, f) => {
    const b = pos.length / 3
    pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1)
    fill.push(f, f, f, f)
    // CCW seen from above (+Y): (x0,z1) -> (x1,z1) -> (x1,z0)
    idx.push(b, b + 3, b + 2, b, b + 2, b + 1)
  }
  const hw = w / 2
  const hl = l / 2
  quad(-hw + lw, -hl + lw, hw - lw, hl, 0.04, 1) // fill
  quad(-hw - lw / 2, -hl - lw / 2, -hw + lw / 2, hl, 0.05, 0) // left line
  quad(hw - lw / 2, -hl - lw / 2, hw + lw / 2, hl, 0.05, 0) // right line
  quad(-hw - lw / 2, -hl - lw / 2, hw + lw / 2, -hl + lw / 2, 0.05, 0) // back line
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('aFill', new BufferAttribute(new Float32Array(fill), 1))
  g.setIndex(idx)
  return g
}

/**
 * @param {Array<{center:[number,number], angleDeg:number, w?:number, l?:number, accessible?:boolean}>} bays
 * @param {'sunlight'|'basement'} theme
 * @returns {InstancedMesh|null}
 */
export function buildBaysMesh(bays, theme) {
  if (!bays.length) return null
  const w = bays[0].w ?? 2.5
  const l = bays[0].l ?? 5
  const g = bayGeometry(w, l)
  const kinds = new Float32Array(bays.length)
  bays.forEach((b, i) => (kinds[i] = b.accessible ? 1 : 0))
  g.setAttribute('aKind', new InstancedBufferAttribute(kinds, 1))
  const mat = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uLine: { value: new Color() },
      uFill: { value: new Color() },
      uAccessible: { value: new Color() },
    },
  })
  const mesh = new InstancedMesh(g, mat, bays.length)
  const m = new Matrix4()
  const q = new Quaternion()
  const s = new Vector3()
  const p = new Vector3()
  const up = new Vector3(0, 1, 0)
  bays.forEach((b, i) => {
    // per-bay size relative to the shared unit geometry
    s.set((b.w ?? w) / w, 1, (b.l ?? l) / l)
    q.setFromAxisAngle(up, (-(b.angleDeg ?? 0) * Math.PI) / 180)
    p.set(b.center[0], 0, -b.center[1])
    m.compose(p, q, s)
    mesh.setMatrixAt(i, m)
  })
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()

  // wheelchair symbols on the accessible bays
  const acc = bays.filter((b) => b.accessible)
  let symMat = null
  let symTex = null
  if (acc.length && typeof document !== 'undefined') {
    symTex = accessibleSymbolTexture()
    symMat = new MeshBasicMaterial({ map: symTex, transparent: true, depthWrite: false, color: themeColor(theme, 'accessibleSymbol') })
    const pg = new PlaneGeometry(SYMBOL_M, SYMBOL_M)
    pg.rotateX(-Math.PI / 2)
    const sym = new InstancedMesh(pg, symMat, acc.length)
    acc.forEach((b, i) => {
      q.setFromAxisAngle(up, (-(b.angleDeg ?? 0) * Math.PI) / 180)
      p.set(b.center[0], 0.07, -b.center[1])
      s.set(1, 1, 1)
      m.compose(p, q, s)
      sym.setMatrixAt(i, m)
    })
    sym.instanceMatrix.needsUpdate = true
    sym.computeBoundingSphere()
    sym.renderOrder = 1
    sym.name = 'accessible-symbols'
    mesh.add(sym)
  }

  mesh.userData.setTheme = (t) => {
    mat.uniforms.uLine.value.copy(themeColor(t, 'bayLine'))
    mat.uniforms.uFill.value.copy(themeColor(t, 'asphalt'))
    mat.uniforms.uAccessible.value.copy(themeColor(t, 'accessibleBay'))
    if (symMat) symMat.color.copy(themeColor(t, 'accessibleSymbol'))
  }
  mesh.userData.dispose = () => {
    mat.dispose()
    symMat?.dispose()
    symTex?.dispose()
  }
  mesh.userData.setTheme(theme)
  return mesh
}
