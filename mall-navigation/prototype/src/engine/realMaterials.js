/**
 * v0.4 "real" material (DESIGN-REAL.md 3): one MeshStandardMaterial (vertex colours) whose albedo, normal and roughness
 * come from CC0 photo textures chosen per vertex by its `surface` id (MeshBuilder, palette.surfaceOf) and mapped by
 * world position (floors on xz, walls along their dominant horizontal axis). MeshBuilder needs no UVs and any venue
 * works. Until the textures arrive (or if they fail) the same material draws plain vertex colours.
 */
import { EquirectangularReflectionMapping, LinearFilter, LinearMipmapLinearFilter, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader } from 'three'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'

/** [roughness, metalness] per surface id: plain, marble, plaster, wood, stone, metal, water (palette.SURFACE) */
export const SURFACE_PARAMS = Object.freeze([
  [0.6, 0],
  [0.35, 0],
  [0.85, 0],
  [0.6, 0],
  [0.5, 0],
  [0.3, 1],
  [0.04, 0.1],
])

/** @returns {MeshStandardMaterial} the shared real material; its texture uniforms live in userData.real */
export function createRealMaterial() {
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 })
  const uniforms = {
    uMarble: { value: null },
    uMarbleN: { value: null },
    uMarbleR: { value: null },
    uPlaster: { value: null },
    uPlasterN: { value: null },
    uWood: { value: null },
    uHasMaps: { value: 0 },
  }
  mat.userData.real = uniforms
  mat.customProgramCacheKey = () => 'dallni-real'
  const params = SURFACE_PARAMS.map(([r, m]) => `vec2(${r.toFixed(2)}, ${m.toFixed(2)})`).join(', ')
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms)
    sh.vertexShader =
      'attribute float surface;\nvarying float vSurf;\nvarying vec3 vWPr;\nvarying vec3 vWNr;\n' +
      sh.vertexShader.replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvSurf = surface;\nvWPr = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNr = normalize(mat3(modelMatrix) * objectNormal);'
      )
    sh.fragmentShader =
      `uniform sampler2D uMarble, uMarbleN, uMarbleR, uPlaster, uPlasterN, uWood;
uniform float uHasMaps;
varying float vSurf;
varying vec3 vWPr;
varying vec3 vWNr;
const vec2 SP[${SURFACE_PARAMS.length}] = vec2[${SURFACE_PARAMS.length}](${params});
vec2 realUv(float rep) {
  vec3 n = abs(vWNr);
  vec2 uv = n.y > 0.7 ? vWPr.xz : (n.x > n.z ? vWPr.zy : vWPr.xy);
  return uv / rep;
}
vec3 realSample(int s) {
  if (uHasMaps < 0.5) return vec3(1.0);
  // the CC0 marble is a grey stone: warmed toward cream (Gulf-mall stone), a little brighter
  if (s == 1) return mix(texture2D(uMarble, realUv(4.0)).rgb, vec3(0.96, 0.93, 0.88), 0.35) * 1.08;
  if (s == 2) return texture2D(uPlaster, realUv(2.5)).rgb * 1.08;
  if (s == 3) return texture2D(uWood, realUv(3.0)).rgb * 1.15;
  if (s == 4) { vec3 c = texture2D(uPlaster, realUv(0.6)).rgb; return mix(vec3(dot(c, vec3(0.333))), c, 0.4) * 1.1; }
  return vec3(1.0);
}
` +
      sh.fragmentShader
        .replace('#include <map_fragment>', '#include <map_fragment>\nint rs = int(vSurf + 0.5);\ndiffuseColor.rgb *= realSample(rs);')
        .replace(
          '#include <roughnessmap_fragment>',
          'float roughnessFactor = SP[rs].x;\nif (rs == 1 && uHasMaps > 0.5) roughnessFactor = mix(0.15, 0.6, texture2D(uMarbleR, realUv(4.0)).g);'
        )
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = SP[rs].y;')
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
if (uHasMaps > 0.5 && (rs == 1 || rs == 2)) {
  vec3 tn = (rs == 1 ? texture2D(uMarbleN, realUv(4.0)).xyz : texture2D(uPlasterN, realUv(2.5)).xyz) * 2.0 - 1.0;
  vec3 wn = normalize(vWNr);
  vec3 tg = normalize(abs(wn.y) > 0.7 ? vec3(1.0, 0.0, 0.0) : cross(vec3(0.0, 1.0, 0.0), wn));
  vec3 bt = cross(wn, tg);
  vec3 pn = normalize(tg * tn.x * 0.6 + bt * tn.y * 0.6 + wn * tn.z);
  normal = normalize((viewMatrix * vec4(pn, 0.0)).xyz);
}`
        )
  }
  return mat
}

/**
 * Give a real material its textures (from loadRealAssets). The textured path turns on only when the three albedo maps
 * (marble, plaster, wood) are there; normal / roughness maps are optional.
 * @param {MeshStandardMaterial} mat
 * @param {{ marble: any, marbleN: any, marbleR: any, plaster: any, plasterN: any, wood: any }} maps
 */
export function setRealMaps(mat, maps) {
  const u = mat.userData.real
  u.uMarble.value = maps.marble
  u.uMarbleN.value = maps.marbleN
  u.uMarbleR.value = maps.marbleR
  u.uPlaster.value = maps.plaster
  u.uPlasterN.value = maps.plasterN
  u.uWood.value = maps.wood
  u.uHasMaps.value = maps.marble && maps.plaster && maps.wood ? 1 : 0
}

/**
 * Load the real-mall assets from our own origin (public/assets/real). Each file that fails becomes null (one console
 * warning); when every file fails, the whole result is null and the real style keeps its plain look.
 * @param {string} [base] URL of the assets folder, ending in "/"
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<{ marble: any, marbleN: any, marbleR: any, plaster: any, plasterN: any, wood: any, env: any } | null>}
 */
export async function loadRealAssets(base = 'assets/real/', { timeoutMs = 20000 } = {}) {
  const tl = new TextureLoader()
  const tex = (name, srgb) =>
    new Promise((res) => {
      const timer = setTimeout(() => res(null), timeoutMs)
      const done = (t) => {
        clearTimeout(timer)
        res(t)
      }
      try {
        tl.load(
          base + name,
          (t) => {
            t.wrapS = t.wrapT = RepeatWrapping
            t.minFilter = LinearMipmapLinearFilter
            t.magFilter = LinearFilter
            t.anisotropy = 4
            if (srgb) t.colorSpace = SRGBColorSpace
            done(t)
          },
          undefined,
          () => done(null)
        )
      } catch {
        done(null)
      }
    })
  const env = new Promise((res) => {
    const timer = setTimeout(() => res(null), timeoutMs)
    try {
      new HDRLoader().load(
        base + 'arcade.hdr',
        (t) => {
          clearTimeout(timer)
          t.mapping = EquirectangularReflectionMapping
          res(t)
        },
        undefined,
        () => {
          clearTimeout(timer)
          res(null)
        }
      )
    } catch {
      clearTimeout(timer)
      res(null)
    }
  })
  const [marble, marbleN, marbleR, plaster, plasterN, wood, envTex] = await Promise.all([
    tex('marble.webp', true),
    tex('marble-n.webp', false),
    tex('marble-r.webp', false),
    tex('plaster.webp', true),
    tex('plaster-n.webp', false),
    tex('wood.webp', true),
    env,
  ])
  const all = { marble, marbleN, marbleR, plaster, plasterN, wood, env: envTex }
  const missing = Object.values(all).filter((v) => !v).length
  if (missing === 7) {
    console.warn('Dallni: the real-mall assets could not load; keeping the plain look')
    return null
  }
  if (missing) console.warn(`Dallni: ${missing} real-mall asset(s) missing`)
  return all
}
