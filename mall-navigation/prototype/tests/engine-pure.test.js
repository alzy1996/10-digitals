/**
 * Pure parts of the 3D engine that run without WebGL (QA round 2): the Walk view's arrival stand in front of a shop
 * sign, the level codes on the 3D badges, the storm palette's lit shop walls and cool floor sheen.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { indexVenue } from '../src/data/venue.js'
import { buildRetailLevel, buildParkingLevel } from '../src/engine/levels.js'
import { ColorRegistry, THEMES, paletteName, resolveKeyHex } from '../src/engine/palette.js'
import { arrivalStand, freeRun } from '../src/engine/interior.js'
import { MeshBuilder } from '../src/engine/geometry.js'

const VENUE_PATH = fileURLToPath(new URL('../public/venues/demo-muscat/venue.json', import.meta.url))
const index = indexVenue(JSON.parse(readFileSync(VENUE_PATH, 'utf8')))
const L1 = index.levelById.get('L1')
const l1 = buildRetailLevel(index, L1, new ColorRegistry())
const signOf = (id) => l1.signs.find((s) => s.refId === id)

describe('Walk view arrival stand (DESIGN-GLASS 6.3)', () => {
  it('the three shops facing the atrium void stand at least 6 m from their sign, turned along the corridor', () => {
    for (const id of ['occ-abaya-atelier', 'occ-saffron-threads', 'occ-urban-dune']) {
      const sign = signOf(id)
      expect(sign, id).toBeTruthy()
      const n = [Math.sin(sign.rotY), -Math.cos(sign.rotY)]
      // straight out from the sign the void is close
      expect(freeRun(index, 'L1', sign.x, sign.y, n), id).toBeLessThan(6)
      const st = arrivalStand(index, 'L1', sign, 8)
      expect(st.d, id).toBeGreaterThanOrEqual(6)
      expect(Math.hypot(st.x - sign.x, st.y - sign.y)).toBeCloseTo(st.d, 6)
    }
  })

  it('a shop with room in front stands square on, 8 m out', () => {
    const sign = signOf('occ-muttrah-kitchen')
    const st = arrivalStand(index, 'L1', sign, 8)
    expect(st.d).toBe(8)
    const n = [Math.sin(sign.rotY), -Math.cos(sign.rotY)]
    expect(st.x).toBeCloseTo(sign.x + n[0] * 8, 6)
    expect(st.y).toBeCloseTo(sign.y + n[1] * 8, 6)
  })
})

describe('3D level badges', () => {
  it('show the lift-panel code in both languages ("G", "1", "B1"), like the screens', () => {
    expect(l1.levelBadge.shortText).toEqual({ en: '1', ar: '1' })
    expect(buildRetailLevel(index, index.levelById.get('G'), new ColorRegistry()).levelBadge.shortText).toEqual({ en: 'G', ar: 'G' })
    expect(buildParkingLevel(index, index.levelById.get('B1'), new ColorRegistry()).levelBadge.shortText).toEqual({ en: 'B1', ar: 'B1' })
  })
})

describe('storm palette (QA round 2)', () => {
  it('cool slate floor sheen and haze; amber stays a light source', () => {
    for (const key of ['sheen', 'fog']) {
      const hex = THEMES.storm[key]
      const [r, , b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
      expect(b, key).toBeGreaterThan(r)
    }
  })

  it('lit shop walls: warmer and lighter in storm, the plain wall colour in classic', () => {
    const cat = '#C2410C'
    expect(resolveKeyHex('lit:' + cat, 'sunlight')).toBe(resolveKeyHex('side:' + cat, 'sunlight'))
    const lum = (h) => [1, 3, 5].reduce((s, i) => s + parseInt(h.slice(i, i + 2), 16), 0)
    expect(lum(resolveKeyHex('lit:' + cat, 'storm'))).toBeGreaterThan(lum(resolveKeyHex('side:' + cat, 'storm')))
  })
})

describe('toy palette (v0.3)', () => {
  it('has every key the classic tables have, in both themes', () => {
    for (const k of Object.keys(THEMES.sunlight)) {
      expect(THEMES.toy[k], 'toy.' + k).toMatch(/^#[0-9A-F]{6}$/i)
      expect(THEMES.toyBasement[k], 'toyBasement.' + k).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })

  it('paletteName maps the toy style', () => {
    expect(paletteName('toy', 'sunlight')).toBe('toy')
    expect(paletteName('toy', 'basement')).toBe('toyBasement')
    expect(paletteName('storm', 'basement')).toBe('stormBasement')
  })

  it('category sign faces stay exact, zone paint stays exact, bay lines white', () => {
    expect(resolveKeyHex('sign:#C2410C', 'toy')).toBe('#C2410C')
    expect(resolveKeyHex('hex:#1E5BD8', 'toyBasement')).toBe('#1E5BD8')
    expect(THEMES.toyBasement.bayLine).toBe('#FFFFFF')
  })

  it('shop walls are a pastel of the category, lighter than classic grey-blue walls', () => {
    const lum = (h) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16)
    const toy = resolveKeyHex('side:#6D28D9', 'toy')
    expect(lum(toy)).toBeGreaterThan(lum('#6D28D9') + 200)
    expect(lum(toy)).toBeGreaterThan(lum(resolveKeyHex('side:#6D28D9', 'sunlight')))
  })
})

describe('MeshBuilder bevel + lit (v0.3)', () => {
  const sq = [[0, 0], [2, 0], [2, 2], [0, 2]]
  const ysOf = (b) => b.pos.filter((_, i) => i % 3 === 1)
  const topXs = (b, h) => b.pos.filter((_, i) => i % 3 === 0 && Math.abs(b.pos[i + 1] - h) < 1e-6)

  it('bevel 0 is byte-identical to the old prism', () => {
    const a = new MeshBuilder(new ColorRegistry())
    a.prism(sq, 0, 1, 'roof', 'wall')
    const b = new MeshBuilder(new ColorRegistry(), { bevel: 0 })
    b.prism(sq, 0, 1, 'roof', 'wall')
    expect(b.pos).toEqual(a.pos)
    expect(b.idx).toEqual(a.idx)
  })

  it('a bevelled prism insets its top face and adds a band below it', () => {
    const b = new MeshBuilder(new ColorRegistry(), { bevel: 0.1 })
    b.prism(sq, 0, 1, 'roof', 'wall')
    const ys = ysOf(b)
    expect(Math.max(...ys)).toBeCloseTo(1, 6)
    expect(ys.some((y) => Math.abs(y - 0.9) < 1e-6)).toBe(true)
    const top = topXs(b, 1)
    expect(Math.min(...top)).toBeCloseTo(0.1, 6)
    expect(Math.max(...top)).toBeCloseTo(1.9, 6)
  })

  it('the bevel is clamped on thin parts', () => {
    const b = new MeshBuilder(new ColorRegistry(), { bevel: 0.5 })
    b.prism([[0, 0], [0.2, 0], [0.2, 4], [0, 4]], 0, 3, 'roof', 'wall')
    expect(Math.min(...topXs(b, 3))).toBeCloseTo(0.06, 6)
  })

  it('a concave footprint is not bevelled', () => {
    const L = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]]
    const a = new MeshBuilder(new ColorRegistry())
    a.prism(L, 0, 1, 'roof', 'wall')
    const b = new MeshBuilder(new ColorRegistry(), { bevel: 0.1 })
    b.prism(L, 0, 1, 'roof', 'wall')
    expect(b.pos).toEqual(a.pos)
  })

  it('lit builds carry normals and soften baked shade', () => {
    const b = new MeshBuilder(new ColorRegistry(), { lit: true })
    b.vquad([0, 0], [1, 0], 0, 1, 'wall', [0, -1], { ao: true })
    const g = b.build('toy')
    expect(g.getAttribute('normal')).toBeTruthy()
    const flat = new MeshBuilder(new ColorRegistry())
    flat.vquad([0, 0], [1, 0], 0, 1, 'wall', [0, -1], { ao: true })
    expect(g.getAttribute('color').array[0]).toBeGreaterThan(flat.build('toy').getAttribute('color').array[0])
  })
})

describe('builder flavour (v0.3 toy)', () => {
  it('toy flavour bevels the retail opaque mesh and carries normals; the default stays unlit', () => {
    const plain = buildRetailLevel(index, L1, new ColorRegistry())
    const toy = buildRetailLevel(index, L1, new ColorRegistry(), { bevel: 0.06, lit: true })
    expect(toy.opaque.vertexCount).toBeGreaterThan(plain.opaque.vertexCount)
    expect(toy.opaque.build('toy').getAttribute('normal')).toBeTruthy()
    expect(toy.roofs.build('toy').getAttribute('normal')).toBeTruthy()
    expect(plain.opaque.build('storm').getAttribute('normal')).toBeUndefined()
  })

  it('parking levels take the flavour too', () => {
    const B1 = index.levelById.get('B1')
    const toy = buildParkingLevel(index, B1, new ColorRegistry(), { bevel: 0.06, lit: true })
    expect(toy.opaque.build('toyBasement').getAttribute('normal')).toBeTruthy()
  })
})
