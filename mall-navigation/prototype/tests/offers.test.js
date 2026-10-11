import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { indexVenue } from '../src/data/venue.js'
import { dealCategories, dealFor, effectiveYmd, isNewBrand, liveDeals, newBrands, resolveOfferDates, sortDeals } from '../src/offers/offers.js'

const read = (p) => JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'))
const index = indexVenue(read('../public/venues/demo-muscat/venue.json'))
const raw = read('../public/venues/demo-muscat/offers.json')
const data = resolveOfferDates(index, raw, '2026-10-11')
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
    expect(brands.map((b) => b.occupant.name.en)).toEqual(['Strivano', 'Maison Lumel', 'Hoshikaze Ramen Lab', 'Nova Arcade'])
    expect(brands.every((b) => b.levelId === 'G' || b.levelId === 'L1')).toBe(true)
    expect(isNewBrand(data, 'occ-hoshikaze-ramen')).toBe(true)
    expect(live.find((d) => d.occupantId === 'occ-strivano').isNew).toBe(true)
  })
})

describe('demo offer dates follow today (v0.5 review: fixed dates would empty the demo after October)', () => {
  it('resolves fromDays / toDays against today, Ramadan deals to the special, openedDaysAgo to a date', async () => {
    const { resolveOfferDates } = await import('../src/offers/offers.js')
    const raw = {
      deals: [
        { id: 'a', occupantId: 'occ-sahil-fashion', figure: { en: '1', ar: '١' }, title: { en: 'x', ar: 'س' }, fromDays: -10, toDays: 20 },
        { id: 'r', occupantId: 'occ-muttrah-kitchen', figure: { en: '1', ar: '١' }, title: { en: 'x', ar: 'س' }, special: 'ramadan-2027' },
      ],
      newBrands: [{ occupantId: 'occ-strivano', origin: { en: 'From X', ar: 'من س' }, openedDaysAgo: 26 }],
    }
    const d = resolveOfferDates(index, raw, '2027-01-15')
    expect(d.deals[0]).toMatchObject({ from: '2027-01-05', to: '2027-02-04' })
    expect(d.deals[1]).toMatchObject({ from: '2027-02-08', to: '2027-03-09' })
    expect(d.newBrands[0].openedOn).toBe('2026-12-20')
  })
  it('the demo file has live deals on any day of the year', async () => {
    const { resolveOfferDates } = await import('../src/offers/offers.js')
    for (const day of ['2026-10-11', '2026-12-31', '2027-06-01', '2028-01-20']) {
      const live = liveDeals(index, resolveOfferDates(index, raw, day), { date: new Date(`${day}T08:00:00Z`) })
      expect(live.length, day).toBeGreaterThanOrEqual(6)
    }
  })
})
