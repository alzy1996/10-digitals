/**
 * The bento home's numbers (v0.5, Sam's Stitch mock): food places and the nearest one, the nearest restroom, the
 * deals banner (count, largest % off) and the next new brand not stamped yet; all from data, nothing invented.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { indexVenue } from '../src/data/venue.js'
import { liveDeals, newBrands, resolveOfferDates } from '../src/offers/offers.js'
import { homeCards, maxPercent } from '../src/ui/homeModel.js'

const read = (p) => JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'))
const index = indexVenue(read('../public/venues/demo-muscat/venue.json'))
const offers = resolveOfferDates(index, read('../public/venues/demo-muscat/offers.json'), '2026-10-11')
const deals = liveDeals(index, offers, { date: new Date('2026-10-11T08:00:00Z') })
const brands = newBrands(index, offers)

describe('home cards', () => {
  // every node 600 s away except the entrances of two places
  const times = (near) => ({ get: (nodeId) => ({ etaS: near[nodeId] ?? 600 }) })

  it('counts food and cafe places and finds the nearest one', () => {
    const qahwa = index.occupantById.get('occ-qahwa-corner').entranceNodeIds[0]
    const c = homeCards(index, { times: times({ [qahwa]: 30 }), deals, brands, stamps: [] })
    expect(c.food.count).toBe(12)
    expect(c.food.nearest.id).toBe('occ-qahwa-corner')
    expect(c.food.nearest.etaS).toBe(30)
    expect(c.places).toBe(index.venue.occupants.length + index.venue.amenities.length)
  })

  it('finds the nearest restroom', () => {
    const am = index.venue.amenities.find((a) => a.category === 'restroom_women' && a.levelId === 'L1')
    const c = homeCards(index, { times: times({ [am.nodeId]: 45 }), deals, brands, stamps: [] })
    expect(c.restroom.nearest.id).toBe(am.id)
    expect(c.restroom.nearest.etaS).toBe(45)
  })

  it('sums up the deals: count and the largest % off', () => {
    const c = homeCards(index, { times: times({}), deals, brands, stamps: [] })
    expect(c.deals.count).toBe(deals.length)
    expect(c.deals.maxPct).toBe(40)
    expect(maxPercent([{ figure: { en: '2 for 1' } }, { figure: { en: 'FREE' } }])).toBeNull()
  })

  it('suggests the nearest new brand not stamped yet, none when all four are stamped', () => {
    // (a brand that is not a food place: the food card would take that one)
    const nova = index.occupantById.get('occ-nova-arcade').entranceNodeIds[0]
    const t = times({ [nova]: 20 })
    expect(homeCards(index, { times: t, deals, brands, stamps: [] }).newBrand.occupantId).toBe('occ-nova-arcade')
    expect(homeCards(index, { times: t, deals, brands, stamps: ['occ-nova-arcade'] }).newBrand.occupantId).not.toBe('occ-nova-arcade')
    expect(homeCards(index, { times: t, deals, brands, stamps: brands.map((b) => b.occupantId) }).newBrand).toBeNull()
  })

  it('never suggests the same place on the food card and the new-brand card', () => {
    const lumel = index.occupantById.get('occ-maison-lumel').entranceNodeIds[0]
    const c = homeCards(index, { times: times({ [lumel]: 10 }), deals, brands, stamps: [] })
    expect(c.food.nearest.id).toBe('occ-maison-lumel')
    expect(c.newBrand).not.toBeNull()
    expect(c.newBrand.occupantId).not.toBe('occ-maison-lumel')
  })

  it('works before offers load and without a position', () => {
    const c = homeCards(index, { times: null, deals: [], brands: [], stamps: [] })
    expect(c.deals).toEqual({ count: 0, maxPct: null })
    expect(c.newBrand).toBeNull()
    expect(c.food.count).toBe(12)
    expect(c.food.nearest).not.toBeNull()
  })
})
