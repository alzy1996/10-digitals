import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { indexVenue, loadVenue, otherNodeId, VENUE_SCHEMA } from '../src/data/venue.js'
import { validateVenue } from '../tools/validate-venue.mjs'

const VENUE_PATH = fileURLToPath(new URL('../public/venues/demo-muscat/venue.json', import.meta.url))
const raw = readFileSync(VENUE_PATH, 'utf8')
const fresh = () => JSON.parse(raw)

describe('demo venue file', () => {
  it('passes the venue validator with zero errors', () => {
    const { errors } = validateVenue(fresh())
    expect(errors).toEqual([])
  })

  it('is the fictional demo mall on schema 0.1', () => {
    const v = fresh()
    expect(v.schema).toBe(VENUE_SCHEMA)
    expect(v.meta.id).toBe('demo-muscat')
    expect(v.meta.disclaimer.en).toMatch(/Fictional/)
    expect(v.meta.defaultStartAnchorId).toBe('A-G-ENT-S')
  })

  it('has mall hours (longer Thursday and Friday), Ramadan and Eid specials, and Ramadan hours for two shops (v0.5)', () => {
    const v = fresh()
    expect(v.meta.hours.weekly.sun).toEqual([{ open: '10:00', close: '22:00' }])
    expect(v.meta.hours.weekly.thu).toEqual([{ open: '10:00', close: '23:00' }])
    expect(v.meta.hours.specials.map((s) => s.id)).toEqual(['ramadan-2027', 'eid-fitr-2027'])
    expect(v.meta.hours.specials[0]).toMatchObject({ kind: 'ramadan', from: '2027-02-08', to: '2027-03-09', expected: true, shops: 'mall' })
    const byId = new Map(v.occupants.map((o) => [o.id, o]))
    expect(byId.get('occ-sidab-fresh').ramadan).toEqual([{ open: '08:00', close: '02:00' }])
    expect(byId.get('occ-majlis-cinemas').ramadan).toEqual([{ open: '20:00', close: '02:00' }])
  })

  it('the four new "global brands" are invented names, not real brands (v0.5 review: Strideline and Kaze Ramen exist)', () => {
    const names = new Set(fresh().occupants.map((o) => o.name.en))
    for (const n of ['Strivano', 'Maison Lumel', 'Hoshikaze Ramen Lab', 'Nova Arcade']) expect(names.has(n), n).toBe(true)
    for (const n of ['Strideline', 'Kaze Ramen Lab']) expect(names.has(n), n).toBe(false)
  })

  it('the validator refuses malformed hours', () => {
    const v = fresh()
    v.meta.hours.weekly.mon = [{ open: '10', close: '22:00' }]
    v.meta.hours.specials[0].to = '2027-13-40'
    v.occupants[0].ramadan = [{ open: 'x', close: '02:00' }]
    const { errors } = validateVenue(v)
    expect(errors.some((e) => /hours\.weekly\.mon/.test(e))).toBe(true)
    expect(errors.some((e) => /ramadan-2027/.test(e))).toBe(true)
    expect(errors.some((e) => /ramadan/.test(e) && /occupant/.test(e))).toBe(true)
  })
})

describe('indexVenue', () => {
  const v = fresh()
  const index = indexVenue(v)

  it('sorts levels by ordinal ascending', () => {
    expect(index.levels.map((l) => l.id)).toEqual(['B2', 'B1', 'G', 'L1'])
    expect(index.levels.map((l) => l.ordinal)).toEqual([-2, -1, 0, 1])
    expect(index.levels.map((l) => l.elevation)).toEqual([-11, -5.5, 0, 5.5])
  })

  it('builds one Map entry per record', () => {
    expect(index.venue).toBe(v)
    const sizes = {
      levelById: v.levels.length,
      unitById: v.units.length,
      occupantById: v.occupants.length,
      amenityById: v.amenities.length,
      anchorById: v.anchors.length,
      connectorById: v.connectors.length,
      landmarkById: v.landmarks.length,
      zoneById: v.parking.zones.length,
      bayById: v.parking.bays.length,
      nodeById: v.graph.nodes.length,
      edgesFrom: v.graph.nodes.length,
      edgeById: v.graph.edges.length,
      openingById: v.openings.length,
    }
    for (const [key, size] of Object.entries(sizes)) {
      expect(index[key], key).toBeInstanceOf(Map)
      expect(index[key].size, key).toBe(size)
    }
    expect(index.occupantById.get('occ-oud-house').name).toEqual({ en: 'Oud House', ar: 'بيت العود' })
  })

  it('lists a oneWay escalator edge only under its from node', () => {
    const up = index.connectorById.get('esc-1-up')
    const [bottom, top] = up.stops
    expect(bottom.levelId).toBe('G')
    expect(top.levelId).toBe('L1')
    const edge = v.graph.edges.find((e) => e.connectorId === 'esc-1-up')
    expect(edge.oneWay).toBe(true)
    expect(edge.stepFree).toBe(false)
    expect(index.edgesFrom.get(bottom.nodeId)).toContain(edge)
    expect(index.edgesFrom.get(top.nodeId)).not.toContain(edge)
    expect(otherNodeId(edge, bottom.nodeId)).toBe(top.nodeId)

    const down = index.connectorById.get('esc-2-down')
    const downEdge = v.graph.edges.find((e) => e.connectorId === 'esc-2-down')
    expect(down.stops[0].levelId).toBe('L1')
    expect(index.edgesFrom.get(down.stops[0].nodeId)).toContain(downEdge)
    expect(index.edgesFrom.get(down.stops[1].nodeId)).not.toContain(downEdge)
  })

  it('lists two-way edges under both ends (same object)', () => {
    for (const e of v.graph.edges) {
      expect(index.edgesFrom.get(e.from)).toContain(e)
      if (e.oneWay) expect(index.edgesFrom.get(e.to)).not.toContain(e)
      else expect(index.edgesFrom.get(e.to)).toContain(e)
    }
    const total = [...index.edgesFrom.values()].reduce((s, list) => s + list.length, 0)
    const oneWay = v.graph.edges.filter((e) => e.oneWay).length
    expect(total).toBe(2 * v.graph.edges.length - oneWay)
  })

  it('only escalators are one-way; lifts are two-way step-free and serve all four levels', () => {
    for (const e of v.graph.edges) expect(e.oneWay).toBe(e.kind === 'escalator')
    for (const id of ['lift-a', 'lift-b']) {
      const lift = index.connectorById.get(id)
      expect(lift.stepFree).toBe(true)
      expect(lift.stops.map((s) => s.levelId)).toEqual(['B2', 'B1', 'G', 'L1'])
      expect(lift.stops.map((s) => s.buttonLabel.en)).toEqual(['B2', 'B1', 'G', '1'])
      expect(lift.stops.map((s) => s.buttonLabel.ar)).toEqual(['ب٢', 'ب١', 'أ', '١'])
    }
    expect(index.connectorById.get('stairs-1').stops.map((s) => s.levelId)).toEqual(['B2', 'B1', 'G'])
  })

  it('resolves every entity to a node on its own level', () => {
    const check = (levelId, nodeId) => {
      const n = index.nodeById.get(nodeId)
      expect(n, nodeId).toBeDefined()
      expect(n.levelId).toBe(levelId)
    }
    for (const o of v.occupants) {
      expect(o.unitIds.length).toBeGreaterThan(0)
      const unit = index.unitById.get(o.unitIds[0])
      for (const nid of o.entranceNodeIds) check(unit.levelId, nid)
    }
    for (const a of v.amenities) check(a.levelId, a.nodeId)
    for (const a of v.anchors) check(a.levelId, a.nodeId)
    for (const b of v.parking.bays) check(b.levelId, b.nodeId)
    for (const c of v.connectors) for (const s of c.stops) check(s.levelId, s.nodeId)
  })

  it('has the planned mall programme', () => {
    const retailUnits = (levelId) => v.units.filter((u) => u.levelId === levelId && u.occupantId).length
    expect(retailUnits('G')).toBeGreaterThanOrEqual(22)
    expect(retailUnits('G')).toBeLessThanOrEqual(28)
    expect(retailUnits('L1')).toBeGreaterThanOrEqual(22)
    expect(retailUnits('L1')).toBeLessThanOrEqual(28)
    for (const levelId of ['B1', 'B2']) {
      const bays = v.parking.bays.filter((b) => b.levelId === levelId)
      expect(bays.length).toBeGreaterThanOrEqual(130)
      expect(bays.length).toBeLessThanOrEqual(170)
      expect(bays.some((b) => b.accessible)).toBe(true)
      expect(v.parking.zones.filter((z) => z.levelId === levelId)).toHaveLength(4)
    }
    const categories = new Set(v.amenities.map((a) => a.category))
    for (const c of ['restroom_men', 'restroom_women', 'restroom_accessible', 'restroom_family', 'musalla_men', 'musalla_women', 'wudu_men', 'wudu_women', 'atm', 'info_desk', 'taxi_pickup']) {
      expect(categories.has(c), c).toBe(true)
    }
    const foodCourt = v.occupants.filter((o) => ['food', 'cafe'].includes(o.category) && index.unitById.get(o.unitIds[0]).kind === 'food')
    expect(foodCourt.length).toBeGreaterThanOrEqual(6)
    expect(foodCourt.length).toBeLessThanOrEqual(8)
  })

  it('rejects a wrong schema, duplicate ids and dangling edges', () => {
    expect(() => indexVenue(null)).toThrow(TypeError)
    expect(() => indexVenue({ ...fresh(), schema: 'other/1' })).toThrow(/unsupported schema/)
    const dup = fresh()
    dup.units[1].id = dup.units[0].id
    expect(() => indexVenue(dup)).toThrow(/duplicate unit id/)
    const dangling = fresh()
    dangling.graph.edges[0].to = 'n-missing'
    expect(() => indexVenue(dangling)).toThrow(/unknown node/)
  })
})

describe('loadVenue', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fetches and indexes the venue', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => fresh() }))
    vi.stubGlobal('fetch', fetchMock)
    const index = await loadVenue('venues/demo-muscat/venue.json')
    expect(fetchMock).toHaveBeenCalledWith('venues/demo-muscat/venue.json')
    expect(index.levels).toHaveLength(4)
    expect(index.anchorById.get('A-G-ENT-S').code).toBe('G01')
  })

  it('reports HTTP failures clearly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })))
    await expect(loadVenue('missing.json')).rejects.toThrow(/HTTP 404/)
  })
})
