import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { indexVenue } from '../src/data/venue.js'
import { dealCategories, dealFor, effectiveYmd, isNewBrand, liveDeals, newBrands, sortDeals } from '../src/offers/offers.js'

const read = (p) => JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'))
const index = indexVenue(read('../public/venues/demo-muscat/venue.json'))
const data = read('../public/venues/demo-muscat/offers.json')
const OCT = new Date('2026-10-11T08:00:00Z')

describe('offers', () => {
  it('live deals: inside their dates, known shops, no parking levels', () => {
    const ids = liveDeals(index, data, { date: OCT }).map((d) => d.id)
    expect(ids).toContain('d-sahil-autumn')
    expect(ids).not.toContain('d-toy-summer')
    expect(ids).not.toContain('d-muttrah-iftar')
    const junk = { deals: [{ id: 'x', occupantId: 'occ-nope', figure: { en: '1', ar: '١' }, title: { en: 'x', ar: 'x' }, from: '2026-01-01', to: '2027-01-01' }], newBrands: [] }
    expect(liveDeals(index, junk, { date: OCT })).toEqual([])
  })
  it('the Ramadan preview shows the Ramadan deals and hides October ones', () => {
    expect(effectiveYmd(index, OCT, 'ramadan-2027')).toBe('2027-02-08')
    const ids = liveDeals(index, data, { date: OCT, previewId: 'ramadan-2027' }).map((d) => d.id)
    expect(ids).toEqual(expect.arrayContaining(['d-muttrah-iftar', 'd-luqaimat-ramadan']))
    expect(ids).not.toContain('d-sahil-autumn')
  })
  it('sorts nearest first, ties by the soonest end, unknown times last', () => {
    const deals = [
      { id: 'a', occupantId: 'o1', to: '2026-12-01' },
      { id: 'b', occupantId: 'o2', to: '2026-10-20' },
      { id: 'c', occupantId: 'o3', to: '2026-10-15' },
      { id: 'd', occupantId: 'o4', to: '2026-10-01' },
    ]
    const eta = { o1: 60, o2: 60, o3: 30, o4: null }
    expect(sortDeals(deals, (id) => eta[id]).map((d) => d.id)).toEqual(['c', 'b', 'a', 'd'])
  })
  it('lists categories, finds a shop deal, resolves the new brands', () => {
    const live = liveDeals(index, data, { date: OCT })
    expect(dealCategories(live)[0]).toBeTypeOf('string')
    expect(dealFor(live, 'occ-sahil-fashion').id).toBe('d-sahil-autumn')
    expect(dealFor(live, 'occ-toy-souq')).toBeNull()
    const brands = newBrands(index, data)
    expect(brands.map((b) => b.occupant.name.en)).toEqual(['Strideline', 'Maison Lumel', 'Kaze Ramen Lab', 'Nova Arcade'])
    expect(brands.every((b) => b.levelId === 'G' || b.levelId === 'L1')).toBe(true)
    expect(isNewBrand(data, 'occ-kaze-ramen')).toBe(true)
    expect(live.find((d) => d.occupantId === 'occ-strideline').isNew).toBe(true)
  })
})
