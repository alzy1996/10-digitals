import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { indexVenue } from '../src/data/venue.js'
import { entryChoices, firstScreen } from '../src/ui/firstScreen.js'
import { readUrlParams } from '../src/ui/urlState.js'

const index = indexVenue(JSON.parse(readFileSync(fileURLToPath(new URL('../public/venues/demo-muscat/venue.json', import.meta.url)), 'utf8')))

describe('first screen', () => {
  it('opens Find me by default', () => {
    expect(firstScreen(readUrlParams(''), { kiosk: false })).toEqual({ screen: 'welcome', found: false })
  })
  it('a plate link opens home with "Found you"', () => {
    expect(firstScreen(readUrlParams('?from=A-G-ENT-E'), { kiosk: false })).toEqual({ screen: 'home', found: true })
  })
  it('an explicit screen wins; a kiosk never shows Find me', () => {
    expect(firstScreen(readUrlParams('?screen=search&from=A-G-ENT-E'), { kiosk: false })).toEqual({ screen: 'search', found: false })
    expect(firstScreen(readUrlParams(''), { kiosk: true })).toEqual({ screen: 'home', found: false })
  })
  it('reads the new URL params', () => {
    const p = readUrlParams('?screen=offers&kiosk=A-G-ENT-S&kioskIdle=5&emergency=1')
    expect(p.screen).toBe('offers')
    expect(p.kiosk).toBe('A-G-ENT-S')
    expect(p.kioskIdle).toBe(5)
    expect(p.emergency).toBe(true)
  })
})

describe('entry choices', () => {
  it('lists the two entrances, then the first lift lobby of each parking level (top first)', () => {
    expect(entryChoices(index).map((c) => c.anchorId)).toEqual(['A-G-ENT-S', 'A-G-ENT-E', 'A-B1-LA', 'A-B2-LA'])
    expect(entryChoices(index)[2]).toMatchObject({ kind: 'parking', levelId: 'B1' })
  })
})
