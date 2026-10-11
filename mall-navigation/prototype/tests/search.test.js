import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { indexVenue } from '../src/data/venue.js'
import { deArabizi, editDistance, maxEditsFor, normalize, tokenize } from '../src/search/normalize.js'
import { createSearch, TILES, TILE_IDS } from '../src/search/search.js'

const VENUE_PATH = fileURLToPath(new URL('../public/venues/demo-muscat/venue.json', import.meta.url))
const index = indexVenue(JSON.parse(readFileSync(VENUE_PATH, 'utf8')))
const search = createSearch(index)

const amenity = (id) => index.amenityById.get(id)
const isRestroom = (r) => r.type === 'amenity' && amenity(r.id).category.startsWith('restroom_')

describe('normalize', () => {
  it('strips Arabic tashkeel and tatweel', () => {
    expect(normalize('مُصَلَّى')).toBe(normalize('مصلى'))
    expect(normalize('مـــول')).toBe('مول')
  })

  it('unifies alef, taa marbuta, alef maksura, hamza carriers', () => {
    expect(normalize('أحمد')).toBe('احمد')
    expect(normalize('إسلام')).toBe('اسلام')
    expect(normalize('آيس')).toBe('ايس')
    expect(normalize('ٱلقهوة')).toBe(normalize('القهوة'))
    expect(normalize('صيدلية')).toBe('صيدليه')
    expect(normalize('مصلى')).toBe('مصلي')
    expect(normalize('مؤسسة')).toBe('موسسه')
    expect(normalize('بيئة')).toBe('بييه')
    expect(normalize('عباءة')).toBe(normalize('عباية'))
  })

  it('turns Arabic-Indic and Persian digits into ASCII', () => {
    expect(normalize('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789')
    expect(normalize('۴۵')).toBe('45')
    expect(normalize('ب٢-١٤')).toBe('ب214')
  })

  it('strips a leading article from each Arabic word when enough is left', () => {
    expect(tokenize('بيت العود')).toEqual(['بيت', 'عود'])
    expect(tokenize('دورة المياه')).toEqual(['دوره', 'مياه'])
    expect(tokenize('وصل للاتصالات')).toEqual(['وصل', 'اتصالات'])
    expect(tokenize('العناية بالبشرة')).toEqual(['عنايه', 'بشره'])
    expect(tokenize('صراف آلي')).toEqual(['صراف', 'الي']) // "الي" is too short to be article + word
  })

  it('lowercases Latin, strips accents, & -> and, drops apostrophes, compacts spaces', () => {
    expect(normalize('Oud House')).toBe('oudhouse')
    expect(normalize('  OUD   house ')).toBe('oudhouse')
    expect(normalize('Café')).toBe('cafe')
    expect(normalize('Qalam Books & Stationery')).toBe('qalambooksandstationery')
    expect(normalize("Men's restroom")).toBe('mensrestroom')
    expect(normalize('Men’s restroom')).toBe('mensrestroom')
    expect(normalize('Oud House', { compact: false })).toBe('oud house')
    expect(tokenize('Family room · baby change')).toEqual(['family', 'room', 'baby', 'change'])
  })

  it('is safe on empty input', () => {
    expect(normalize('')).toBe('')
    expect(normalize(null)).toBe('')
    expect(normalize(undefined)).toBe('')
    expect(tokenize('···')).toEqual([])
  })

  it('counts typos the contract way', () => {
    expect(maxEditsFor('oud')).toBe(0)
    expect(maxEditsFor('sahl')).toBe(1)
    expect(maxEditsFor('pharmcy')).toBe(2)
    expect(editDistance('sahl', 'sahil', 1)).toBe(1)
    expect(editDistance('oudh', 'oduh', 1)).toBe(1) // swapped neighbours = 1
    expect(editDistance('abcdef', 'uvwxyz', 2)).toBe(3) // gives up past the limit
  })

  it('reads Arabizi without touching codes', () => {
    expect(deArabizi('7alwa')).toBe('halwa')
    expect(deArabizi('3ood')).toBe('aood')
    expect(deArabizi('B2-14 L1')).toBe('B2-14 L1')
  })
})

describe('createSearch', () => {
  it('returns contract-shaped results', () => {
    const results = search('oud', 'en')
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(['occupant', 'amenity', 'category', 'anchor']).toContain(r.type)
      expect(typeof r.id).toBe('string')
      expect(typeof r.name.en).toBe('string')
      expect(typeof r.name.ar).toBe('string')
      expect(typeof r.score).toBe('number')
      expect('levelId' in r).toBe(true)
    }
  })

  it('ranks an exact name first', () => {
    expect(search('Oud House', 'en')[0]).toMatchObject({ type: 'occupant', id: 'occ-oud-house', levelId: 'G' })
    expect(search('بيت العود', 'ar')[0]).toMatchObject({ id: 'occ-oud-house' })
    expect(search('OUDHOUSE', 'en')[0].id).toBe('occ-oud-house')
  })

  it('exact > prefix > keyword > fuzzy', () => {
    const exact = search('Oud House', 'en')[0].score
    const prefix = search('nakh', 'en')[0]
    const keyword = search('saffron', 'en').find((r) => r.id === 'occ-dhofar-spices')
    const fuzzy = search('sahl', 'en')[0]
    expect(prefix.id).toBe('occ-nakhla-pharmacy')
    expect(exact).toBeGreaterThan(prefix.score)
    expect(prefix.score).toBeGreaterThan(keyword.score)
    expect(keyword.score).toBeGreaterThan(fuzzy.score)
    // "saffron": the shop named Saffron Threads (prefix) beats the spice shop that sells saffron (keyword)
    expect(search('saffron', 'en')[0].id).toBe('occ-saffron-threads')
  })

  it('forgives typos in a fictional shop name, like "zara" for Zara', () => {
    expect(search('sahl', 'en')[0].id).toBe('occ-sahil-fashion') // 1 typo, 4 letters
    expect(search('khanjr', 'en')[0].id).toBe('occ-khanjar-jewellers')
    expect(search('oud hose', 'en')[0].id).toBe('occ-oud-house')
    expect(search('farmacy', 'en')[0].id).toBe('occ-nakhla-pharmacy') // 2 typos, 7 letters
    expect(search('oyd', 'en').map((r) => r.id)).not.toContain('occ-oud-house') // 3 letters: no typos allowed
  })

  it('finds the perfume shop for «عطور»', () => {
    const results = search('عطور', 'ar')
    expect(results[0]).toMatchObject({ type: 'occupant', id: 'occ-oud-house' })
    const occ = results.filter((r) => r.type === 'occupant')
    for (const r of occ) expect(index.occupantById.get(r.id).keywords.ar).toContain('عطور')
    expect(results.map((r) => r.id)).not.toContain('occ-burger-bandar') // «فطور» is one typo away
  })

  it('finds restrooms for «حمام» and "toilet"', () => {
    for (const q of ['حمام', 'toilet', 'toilets', 'washroom', 'دورة مياه', 'WC']) {
      const results = search(q, /[a-z]/i.test(q) ? 'en' : 'ar')
      expect(results.length, q).toBeGreaterThanOrEqual(8)
      expect(results.slice(0, 8).every(isRestroom), q).toBe(true)
      expect(new Set(results.slice(0, 8).map((r) => r.levelId))).toEqual(new Set(['G', 'L1']))
    }
  })

  it('puts the nearest level first when given a level hint', () => {
    for (const hint of ['G', 'L1']) {
      const results = search('restroom', 'en', hint)
      const levels = results.filter(isRestroom).map((r) => r.levelId)
      expect(levels.slice(0, 4)).toEqual([hint, hint, hint, hint])
    }
    // From the car park (B2), G is nearer than L1.
    const fromB2 = search('toilet', 'en', { levelId: 'B2' }).filter(isRestroom)
    expect(fromB2[0].levelId).toBe('G')
  })

  it('finds the musalla for «اماكن الصلاه», «مصلى» and "prayer"', () => {
    for (const q of ['اماكن الصلاه', 'أماكن الصلاة', 'مصلى', 'prayer room', 'musalla', 'mosque']) {
      const results = search(q, /[a-z]/i.test(q) ? 'en' : 'ar')
      expect(results.length, q).toBeGreaterThanOrEqual(2)
      for (const r of results.slice(0, 2)) {
        expect(r.type, q).toBe('amenity')
        expect(amenity(r.id).category, q).toMatch(/^musalla_/)
      }
    }
    expect(search('wudu', 'en')[0].id).toMatch(/wudu/)
  })

  it('handles the other contract synonyms', () => {
    expect(search('atm', 'en')[0]).toMatchObject({ type: 'amenity', id: 'am-G-atm' })
    expect(search('صراف', 'ar').map((r) => r.id)).toContain('am-G-atm')
    expect(search('pharmacy', 'en')[0].id).toBe('occ-nakhla-pharmacy')
    expect(search('صيدلية', 'ar')[0].id).toBe('occ-nakhla-pharmacy')
    expect(search('cinema', 'en')[0].id).toBe('occ-majlis-cinemas')
    expect(search('سينما', 'ar')[0].id).toBe('occ-majlis-cinemas')
    expect(search('parking', 'en')[0]).toMatchObject({ type: 'category', id: 'parking' })
    expect(search('مواقف', 'ar')[0]).toMatchObject({ type: 'category', id: 'parking' })
    expect(search('موقف', 'ar').map((r) => r.id)).toContain('parking')
    const food = search('food', 'en')
    expect(food[0]).toMatchObject({ type: 'category', id: 'food' })
    expect(food.filter((r) => r.type === 'occupant').every((r) => index.occupantById.get(r.id).category === 'food')).toBe(true)
    const mataam = search('مطاعم', 'ar')
    expect(mataam.filter((r) => r.type === 'occupant').length).toBeGreaterThanOrEqual(8)
    expect(search('مطعم', 'ar').some((r) => r.id === 'occ-muttrah-kitchen')).toBe(true)
    const exits = search('exit', 'en').map((r) => r.id)
    expect(exits).toEqual(expect.arrayContaining(['A-G-ENT-S', 'A-G-ENT-E', 'am-G-taxi']))
    expect(search('تاكسي', 'ar')[0].id).toBe('am-G-taxi')
  })

  it('drops filler words and reads Arabizi', () => {
    expect(search('where is the nearest toilet', 'en').slice(0, 8).every(isRestroom)).toBe(true)
    expect(search('وين اقرب حمام', 'ar').slice(0, 8).every(isRestroom)).toBe(true)
    expect(search('7alwa', 'en')[0].id).toBe('occ-halwa-muscat')
  })

  it('matches words in any order and across languages', () => {
    expect(search('house oud', 'ar')[0].id).toBe('occ-oud-house')
    expect(search('women restroom', 'en')[0]).toMatchObject({ id: expect.stringMatching(/wc-w$/) })
    expect(search('عباية', 'ar')[0].id).toBe('occ-abaya-atelier')
  })

  it('returns nothing for empty or unknown queries', () => {
    expect(search('', 'en')).toEqual([])
    expect(search('   ', 'ar')).toEqual([])
    expect(search('xyzzyq', 'en')).toEqual([])
  })

  it('respects the limit', () => {
    expect(search('a', 'en', { limit: 3 }).length).toBeLessThanOrEqual(3)
    expect(search('fashion', 'en', { limit: 2 })).toHaveLength(2)
  })
})

describe('search.tile', () => {
  it('knows the six home tiles', () => {
    expect(TILE_IDS).toEqual(['food', 'restrooms', 'prayer', 'pharmacy', 'kids', 'exit'])
    // tileIds.js (no search engine import, for the first screen) lists the search engine's tiles in their order
    expect(TILE_IDS).toEqual(Object.keys(TILES))
    expect(search.tile('nope')).toEqual([])
  })

  it('lists what each tile should show, nearest level first', () => {
    const rest = search.tile('restrooms', { levelId: 'L1' })
    expect(rest).toHaveLength(8)
    expect(rest.every(isRestroom)).toBe(true)
    expect(rest.slice(0, 4).every((r) => r.levelId === 'L1')).toBe(true)

    const prayer = search.tile('prayer', { levelId: 'G' })
    expect(prayer.map((r) => amenity(r.id).category).slice(0, 2).every((c) => c.startsWith('musalla_'))).toBe(true)
    expect(prayer).toHaveLength(4)

    expect(search.tile('pharmacy').map((r) => r.id)).toEqual(['occ-nakhla-pharmacy'])

    const food = search.tile('food', { levelId: 'G' })
    expect(food.every((r) => r.type === 'occupant' && ['food', 'cafe'].includes(index.occupantById.get(r.id).category))).toBe(true)
    expect(food[0].levelId).toBe('G')
    expect(food.length).toBe([...index.occupantById.values()].filter((o) => ['food', 'cafe'].includes(o.category)).length)

    const kids = search.tile('kids')
    expect(kids.every((r) => index.occupantById.get(r.id).category === 'kids')).toBe(true)

    const exit = search.tile('exit').map((r) => r.id)
    expect(exit).toEqual(expect.arrayContaining(['A-G-ENT-S', 'A-G-ENT-E', 'am-G-taxi']))
  })
})

describe('goods, singular and plural (Arabic broken plurals share no prefix)', () => {
  const ids = (q, lang) => search(q, lang).map((r) => r.id)
  const PAIRS = [
    ['perfume', ['عطر', 'عطور', 'perfume', 'fragrance'], ['occ-oud-house', 'occ-frankincense-trail', 'occ-rose-petal']],
    ['shoes', ['حذاء', 'أحذية', 'shoes'], ['occ-sandal-street']],
    ['glasses', ['نظارة', 'نظارات', 'glasses', 'optician'], ['occ-clear-sight']],
    ['gifts', ['هدية', 'هدايا', 'gift'], ['occ-batinah-dates']],
    ['watches', ['ساعة', 'ساعات', 'watch'], ['occ-khanjar-jewellers']],
  ]
  for (const [name, queries, expected] of PAIRS) {
    it(`finds ${name} for every spelling`, () => {
      for (const q of queries) {
        const found = ids(q, /[a-z]/i.test(q) ? 'en' : 'ar')
        expect(found, q).toEqual(expect.arrayContaining(expected))
      }
    })
  }

  it('does not let a near-miss win: «ساعات» (watches) is not «سماعات» (headphones)', () => {
    expect(ids('ساعات', 'ar')).not.toContain('occ-falaj-tech')
  })
})

describe('getting between floors', () => {
  it('lift / elevator / مصعد find the lifts', () => {
    for (const q of ['lift', 'elevator', 'مصعد', 'مصاعد']) {
      const r = search(q, /[a-z]/.test(q) ? 'en' : 'ar')
      expect(r.length, q).toBeGreaterThanOrEqual(2)
      expect(r.slice(0, 2).every((x) => x.type === 'connector' && index.connectorById.get(x.id).type === 'lift'), q).toBe(true)
      expect(r[0].levelId).toBeNull()
    }
  })

  it('escalator / سلم متحرك find the escalators, stairs / درج the stairs', () => {
    for (const q of ['escalator', 'سلم متحرك']) {
      const r = search(q, /[a-z]/.test(q) ? 'en' : 'ar')
      expect(r.slice(0, 2).every((x) => x.type === 'connector' && index.connectorById.get(x.id).type === 'escalator'), q).toBe(true)
    }
    for (const q of ['stairs', 'درج']) {
      const r = search(q, /[a-z]/.test(q) ? 'en' : 'ar')
      expect(index.connectorById.get(r[0].id)?.type, q).toBe('stairs')
    }
  })
})

describe('synonym ranking', () => {
  it('«موقف» (a parking synonym) puts Parking above a place whose name starts with it', () => {
    const r = search('موقف', 'ar')
    expect(r[0]).toMatchObject({ type: 'category', id: 'parking' })
  })
})

describe('multi-word synonyms and names that contain a filler word', () => {
  it('"my car" and "find my car" put Parking first (not a shop with a "car…" keyword)', () => {
    expect(search('my car', 'en')[0]).toMatchObject({ type: 'category', id: 'parking' })
    expect(search('find my car', 'en')[0]).toMatchObject({ type: 'category', id: 'parking' })
  })

  it('"lost and found" finds the information desk', () => {
    expect(search('lost and found', 'en').map((r) => r.id)).toContain('am-G-info')
  })

  it('«صراف آلي» (the ATM\'s own Arabic name) and «أين الصراف الآلي» put the ATM first, as an exact name', () => {
    expect(amenity('am-G-atm').name.ar).toBe('صراف آلي')
    for (const q of ['صراف آلي', 'أين الصراف الآلي']) {
      const r = search(q, 'ar')
      expect(r[0]?.id, q).toBe('am-G-atm')
      expect(r[0]?.score, q).toBe(1000)
    }
  })

  it('"where is the atm" still ranks the ATM as an exact name', () => {
    expect(search('where is the atm', 'en')[0]).toMatchObject({ id: 'am-G-atm', score: 1000 })
  })
})
