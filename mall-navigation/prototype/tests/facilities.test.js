import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { indexVenue } from '../src/data/venue.js'
import { FACILITY_GROUPS, facilityGroups } from '../src/ui/facilities.js'

const index = indexVenue(JSON.parse(readFileSync(fileURLToPath(new URL('../public/venues/demo-muscat/venue.json', import.meta.url)), 'utf8')))

describe('facility groups', () => {
  it('puts every amenity in exactly one group', () => {
    const groups = facilityGroups(index, () => null)
    const all = groups.flatMap((g) => g.items.map((i) => i.amenity.id))
    expect(new Set(all).size).toBe(all.length)
    expect(all.length).toBe(index.venue.amenities.length)
    expect(groups.map((g) => g.id)).toEqual(FACILITY_GROUPS.map((g) => g.id).filter((id) => groups.some((x) => x.id === id)))
  })
  it('orders a group nearest first', () => {
    const eta = (nodeId) => (nodeId.endsWith('2') ? 10 : 100)
    const rest = facilityGroups(index, eta).find((g) => g.id === 'restrooms')
    expect(rest.items[0].etaS).toBeLessThanOrEqual(rest.items[rest.items.length - 1].etaS)
  })
})
