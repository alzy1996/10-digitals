import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { indexVenue } from '../src/data/venue.js'
import { MIN_SHOWN, buildStats, heatShown, plateOk, toCsv } from '../src/dashboard/stats.js'

const read = (p) => JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'))
const index = indexVenue(read('../public/venues/demo-muscat/venue.json'))
const offers = read('../public/venues/demo-muscat/offers.json')

describe('dashboard stats', () => {
  const s = buildStats(index, offers, { today: '2026-10-11' })
  it('is deterministic for a seed', () => {
    expect(buildStats(index, offers, { today: '2026-10-11' })).toEqual(s)
    expect(buildStats(index, offers, { today: '2026-10-11', seed: 7 }).kpis.journeys).not.toBe(s.kpis.journeys)
  })
  it('covers 30 days ending today, busier on Thursday and Friday', () => {
    expect(s.daily).toHaveLength(30)
    expect(s.daily.at(-1).ymd).toBe('2026-10-11')
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
    const weekend = s.daily.filter((d) => d.dow === 'thu' || d.dow === 'fri').map((d) => d.journeys)
    const week = s.daily.filter((d) => ['sun', 'mon', 'tue', 'wed'].includes(d.dow)).map((d) => d.journeys)
    expect(mean(weekend)).toBeGreaterThan(mean(week))
    expect(s.kpis.journeys).toBe(s.daily.reduce((a, d) => a + d.journeys, 0))
    expect(s.hourly).toHaveLength(24)
  })
  it('hides small counts and flags weak plates', () => {
    expect(heatShown(MIN_SHOWN - 1)).toBe(false)
    expect(heatShown(MIN_SHOWN)).toBe(true)
    expect(plateOk(19, 100)).toBe(false)
    expect(plateOk(20, 100)).toBe(true)
    expect(s.plates.filter((p) => !p.ok).length).toBeGreaterThanOrEqual(1)
    expect(s.plates.every((p) => p.ok === plateOk(p.actual, p.expected))).toBe(true)
    expect(s.heat.some((h) => !heatShown(h.count))).toBe(true)
  })
  it('shows a faster time to shop and to car than the baseline', () => {
    expect(s.kpis.toShopS).toBeLessThan(s.kpis.toShopBaseS)
    expect(s.kpis.toCarS).toBeLessThan(s.kpis.toCarBaseS)
    expect(s.kpis.share).toBeGreaterThan(0)
    expect(s.kpis.share).toBeLessThan(1)
  })
  it('writes CSV with quotes and commas escaped', () => {
    expect(toCsv([['term', 'count'], ['shoe, repair', '12'], ['say "hi"', '3']])).toBe('term,count\r\n"shoe, repair",12\r\n"say ""hi""",3\r\n')
  })
})
