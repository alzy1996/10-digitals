/**
 * v0.4 real material (DESIGN-REAL.md 3): the shader patch finds every anchor it needs in three r186's standard shader
 * (a three upgrade that moves them fails here, not on a phone), the surface table covers every surface, and a failed
 * asset fetch degrades to the plain look instead of throwing.
 */
import { describe, it, expect } from 'vitest'
import { ShaderLib } from 'three'
import { SURFACE_PARAMS, createRealMaterial, loadRealAssets, setRealMaps } from '../src/engine/realMaterials.js'
import { SURFACE } from '../src/engine/palette.js'

describe('real material (v0.4)', () => {
  it('patches the r186 standard shader at every anchor it needs', () => {
    const m = createRealMaterial()
    const sh = { uniforms: {}, vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader }
    m.onBeforeCompile(sh)
    for (const u of ['uMarble', 'uMarbleN', 'uMarbleR', 'uPlaster', 'uPlasterN', 'uWood', 'uHasMaps']) expect(sh.uniforms[u], u).toBeTruthy()
    expect(sh.vertexShader).toContain('attribute float surface;')
    expect(sh.vertexShader).toContain('vSurf = surface;')
    for (const s of ['realSample(rs)', 'float roughnessFactor = SP[rs].x;', 'float metalnessFactor = SP[rs].y;', 'texture2D(uMarbleN']) expect(sh.fragmentShader, s).toContain(s)
    expect(m.customProgramCacheKey()).toBe('dallni-real')
    expect(m.vertexColors).toBe(true)
  })

  it('surface params cover every surface id', () => {
    expect(SURFACE_PARAMS.length).toBe(Object.keys(SURFACE).length)
    expect(SURFACE_PARAMS[SURFACE.metal][1]).toBe(1)
    expect(SURFACE_PARAMS[SURFACE.water][0]).toBeLessThan(0.1)
  })

  it('maps switch the textured path on only when the three albedo maps are there', () => {
    const m = createRealMaterial()
    setRealMaps(m, { marble: {}, marbleN: null, marbleR: null, plaster: {}, plasterN: null, wood: null })
    expect(m.userData.real.uHasMaps.value).toBe(0)
    setRealMaps(m, { marble: {}, marbleN: null, marbleR: null, plaster: {}, plasterN: null, wood: {} })
    expect(m.userData.real.uHasMaps.value).toBe(1)
  })

  it('a failed asset fetch resolves null instead of throwing', async () => {
    const r = await loadRealAssets('http://127.0.0.1:9/nope/', { timeoutMs: 1500 })
    expect(r).toBeNull()
  })

  it('a missing normal or roughness map is skipped (no black placeholder texture sampled)', () => {
    const m = createRealMaterial()
    setRealMaps(m, { marble: {}, marbleN: null, marbleR: null, plaster: {}, plasterN: {}, wood: {} })
    const u = m.userData.real
    expect(u.uHasMaps.value).toBe(1)
    expect(u.uHasMarbleN.value).toBe(0)
    expect(u.uHasMarbleR.value).toBe(0)
    expect(u.uHasPlasterN.value).toBe(1)
    const sh = { uniforms: {}, vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader }
    m.onBeforeCompile(sh)
    for (const k of ['uHasMarbleN', 'uHasMarbleR', 'uHasPlasterN']) expect(sh.fragmentShader, k).toContain(k)
  })
})
