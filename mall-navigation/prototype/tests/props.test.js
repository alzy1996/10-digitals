/**
 * Furnished shop interiors (v0.4 real, DESIGN-REAL.md 4): prop spots stay inside the unit, off its walls and clear of
 * its doors, also for odd units (concave, no openings, tiny).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { propSpots } from '../src/engine/props.js'
import { distToSegment, pointInPolygon } from '../src/engine/geometry.js'
import { indexVenue } from '../src/data/venue.js'
import { buildRetailLevel } from '../src/engine/levels.js'
import { ColorRegistry } from '../src/engine/palette.js'

const rect = [[0, 0], [10, 0], [10, 8], [0, 8]]
const door = { a: [4, 0], b: [6, 0] }

describe('shop props placement', () => {
  it('stays inside the unit, off its walls and clear of the door', () => {
    const s = propSpots(rect, [door])
    expect(s.length).toBeGreaterThan(6)
    for (const p of s) {
      expect(pointInPolygon(p, rect)).toBe(true)
      expect(rect.every((q, i) => distToSegment(p, q, rect[(i + 1) % 4]) >= 0.9 - 1e-9)).toBe(true)
      expect(distToSegment(p, door.a, door.b)).toBeGreaterThanOrEqual(1.5)
    }
  })

  it('handles a concave unit and a unit with no openings', () => {
    const L = [[0, 0], [8, 0], [8, 3], [3, 3], [3, 8], [0, 8]]
    const s = propSpots(L, [])
    expect(s.length).toBeGreaterThan(0)
    for (const p of s) expect(pointInPolygon(p, L)).toBe(true)
  })

  it('a tiny unit gets no props', () => {
    expect(propSpots([[0, 0], [1.5, 0], [1.5, 1.5], [0, 1.5]], [])).toEqual([])
  })

  it('a real build furnishes the demo shops in their own props mesh', () => {
    const index = indexVenue(JSON.parse(readFileSync(fileURLToPath(new URL('../public/venues/demo-muscat/venue.json', import.meta.url)), 'utf8')))
    const L1 = index.levelById.get('L1')
    const toy = buildRetailLevel(index, L1, new ColorRegistry(), { bevel: 0.06, lit: true })
    const real = buildRetailLevel(index, L1, new ColorRegistry(), { bevel: 0.06, lit: true, real: true })
    expect(real.props.vertexCount).toBeGreaterThan(toy.opaque.vertexCount * 0.2)
    expect(toy.props.vertexCount).toBe(0)
  })
})
