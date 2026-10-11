import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { indexVenue } from '../src/data/venue.js'
import { DEFAULT_OPS, createOpsBus, mergeOps, validOps } from '../src/ops/opsBus.js'
import { nearestExits } from '../src/ops/exits.js'

const index = indexVenue(JSON.parse(readFileSync(fileURLToPath(new URL('../public/venues/demo-muscat/venue.json', import.meta.url)), 'utf8')))

class FakeChannel {
  static all = []
  constructor(name) { this.name = name; this.onmessage = null; FakeChannel.all.push(this) }
  postMessage(data) { for (const c of FakeChannel.all) if (c !== this && c.name === this.name && c.onmessage) c.onmessage({ data }) }
  close() { FakeChannel.all = FakeChannel.all.filter((c) => c !== this) }
}

describe('ops state', () => {
  it('validates messages', () => {
    expect(validOps({ type: 'hello' })).toBe(true)
    expect(validOps({ type: 'state', state: { rev: 2, emergency: { on: true, message: null }, hoursPreview: null } })).toBe(true)
    expect(validOps({ type: 'state', state: { rev: 'x' } })).toBe(false)
    expect(validOps(null)).toBe(false)
  })
  it('applies newer states only', () => {
    const s1 = mergeOps(DEFAULT_OPS, { type: 'state', state: { ...DEFAULT_OPS, rev: 3, emergency: { on: true, message: null } } })
    expect(s1.emergency.on).toBe(true)
    const s2 = mergeOps(s1, { type: 'state', state: { ...DEFAULT_OPS, rev: 2 } })
    expect(s2).toBe(s1)
  })
  it('a dashboard tab publishes; a shopper tab says hello and gets the current state', () => {
    FakeChannel.all = []
    const seen = []
    const dash = createOpsBus({ onState: () => {}, Channel: FakeChannel })
    dash.publish({ emergency: { on: true, message: null } })
    const shop = createOpsBus({ onState: (s) => seen.push(s), Channel: FakeChannel })
    shop.hello()
    expect(seen.at(-1).emergency.on).toBe(true)
    dash.publish({ emergency: { on: false, message: null } })
    expect(seen.at(-1).emergency.on).toBe(false)
    dash.close(); shop.close()
  })
  it('works without BroadcastChannel (single tab)', () => {
    const seen = []
    const bus = createOpsBus({ onState: (s) => seen.push(s), Channel: undefined })
    bus.publish({ hoursPreview: 'ramadan-2027' })
    expect(seen.at(-1).hoursPreview).toBe('ramadan-2027')
  })
})

describe('nearest exits', () => {
  it('on the ground floor: both entrances with straight distances, nearest first', () => {
    const you = { levelId: 'G', x: 61, y: 6 }
    const ex = nearestExits(index, you)
    expect(ex.map((e) => e.anchorId)).toEqual(['A-G-ENT-S', 'A-G-ENT-E'])
    expect(ex[0].distanceM).toBeLessThan(ex[1].distanceM)
  })
  it('on another level: no distance (ground level, stairs)', () => {
    expect(nearestExits(index, { levelId: 'L1', x: 50, y: 30 }).every((e) => e.distanceM === null)).toBe(true)
  })
})
