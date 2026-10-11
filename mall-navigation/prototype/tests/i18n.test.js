import { describe, it, expect } from 'vitest'
import { dirFor, formatDistance, formatDuration, hasString, LANGS, STRINGS, t, toArabicDigits } from '../src/i18n/strings.js'

const ARABIC_LETTER = /[؀-ۿ]/
// Keys whose Arabic value is deliberately Latin: the language switch is labelled in the target language.
const LATIN_IN_ARABIC_OK = new Set(['lang.toggle', 'lang.toggleLabel'])

describe('string table', () => {
  it('has English and Arabic for every key', () => {
    expect(LANGS).toEqual(['en', 'ar'])
    for (const [key, entry] of Object.entries(STRINGS)) {
      expect(entry.en, key).toBeTruthy()
      expect(entry.ar, key).toBeTruthy()
    }
  })

  it('keeps Arabic in Arabic script with Arabic-Indic digits, and English free of Arabic letters', () => {
    const text = (s) => s.replace(/\{\w+\}/g, '') // placeholders are code, not text
    for (const [key, entry] of Object.entries(STRINGS)) {
      if (LATIN_IN_ARABIC_OK.has(key)) continue
      expect(text(entry.ar), key).not.toMatch(/[A-Za-z]/)
      expect(text(entry.ar), key).not.toMatch(/[0-9]/)
      expect(entry.ar, key).toMatch(ARABIC_LETTER)
      expect(entry.en, key).not.toMatch(ARABIC_LETTER)
    }
  })

  it('uses the same placeholders in both languages', () => {
    const names = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const [key, entry] of Object.entries(STRINGS)) expect(names(entry.ar), key).toEqual(names(entry.en))
  })

  it('covers the screens and the six home tiles', () => {
    const required = [
      'app.name', 'app.badge', 'lang.toggle', 'lang.toggleLabel',
      'home.title', 'home.youAreHere', 'home.searchPlaceholder', 'home.myCar',
      'tile.food', 'tile.restrooms', 'tile.prayer', 'tile.pharmacy', 'tile.kids', 'tile.exit',
      'search.noResults',
      'place.go', 'place.stepFreeToggle', 'place.noRoute',
      'nav.step', 'nav.next', 'nav.prev', 'nav.lost', 'nav.remaining',
      'arrived.title', 'arrived.foundIt', 'arrived.backToCar', 'arrived.anotherShop',
      'car.title', 'car.scanPlate', 'car.save', 'car.takeMeThere', 'car.bay',
      'scan.title', 'scan.subtitle', 'scan.imHere',
      'sim.label', 'sim.play', 'sim.pause', 'sim.speed', 'sim.notLive',
      'view.overview', 'view.floor', 'view.top',
    ]
    for (const key of required) expect(hasString(key), key).toBe(true)
    expect(t('tile.food', 'en')).toBe('Food')
    expect(t('tile.restrooms', 'en')).toBe('Restrooms')
    expect(t('tile.prayer', 'en')).toBe('Prayer')
    expect(t('tile.pharmacy', 'en')).toBe('Pharmacy')
    expect(t('tile.kids', 'en')).toBe('Kids')
    expect(t('tile.exit', 'en')).toBe('Exit / Taxi')
    expect(t('tile.prayer', 'ar')).toBe('المصلى')
    expect(t('app.badge', 'en')).toBe('PROTOTYPE · SIMULATION')
  })
})

describe('t()', () => {
  it('looks up, falls back and fills placeholders', () => {
    expect(t('nav.next', 'en')).toBe('Next')
    expect(t('nav.next', 'ar')).toBe('التالي')
    expect(t('nav.next', 'ar-OM')).toBe('التالي')
    expect(t('nav.next', 'fr')).toBe('Next')
    expect(t('no.such.key', 'en')).toBe('no.such.key')
    expect(t('nav.step', 'en', { n: 2, total: 6 })).toBe('Step 2 of 6')
    expect(t('nav.step', 'ar', { n: 2, total: 6 })).toBe('الخطوة ٢ من ٦')
    expect(t('home.youAreHere', 'ar', { place: 'المدخل الجنوبي' })).toBe('أنت عند المدخل الجنوبي')
    expect(t('nav.step', 'en', { n: 1 })).toBe('Step 1 of {total}')
  })
})

describe('dirFor', () => {
  it('maps locales to writing direction', () => {
    expect(dirFor('ar')).toBe('rtl')
    expect(dirFor('ar-OM')).toBe('rtl')
    expect(dirFor('ur')).toBe('rtl')
    expect(dirFor('en')).toBe('ltr')
    expect(dirFor('en-GB')).toBe('ltr')
    expect(dirFor(undefined)).toBe('ltr')
  })
})

describe('toArabicDigits', () => {
  it('replaces ASCII digits only', () => {
    expect(toArabicDigits('0123456789')).toBe('٠١٢٣٤٥٦٧٨٩')
    expect(toArabicDigits('Level 1 - 40 m')).toBe('Level ١ - ٤٠ m')
    expect(toArabicDigits(2026)).toBe('٢٠٢٦')
    expect(toArabicDigits('')).toBe('')
  })
})

describe('formatDistance', () => {
  it('rounds like a person would and writes Arabic digits in Arabic', () => {
    expect(formatDistance(40, 'en')).toBe('40 m')
    expect(formatDistance(40, 'ar')).toBe('٤٠ م')
    expect(formatDistance(7.4, 'en')).toBe('7 m')
    expect(formatDistance(17.6, 'ar')).toBe('١٨ م')
    expect(formatDistance(43, 'en')).toBe('45 m')
    expect(formatDistance(126.86, 'en')).toBe('125 m')
    expect(formatDistance(234, 'en')).toBe('230 m')
    expect(formatDistance(0, 'en')).toBe('0 m')
    expect(formatDistance(-5, 'en')).toBe('0 m')
    expect(formatDistance(Number.NaN, 'ar')).toBe('٠ م')
    expect(formatDistance(1234, 'en')).toBe('1.2 km')
    expect(formatDistance(1234, 'ar')).toBe('١٫٢ كم')
    expect(formatDistance(2000, 'en')).toBe('2 km')
  })
})

describe('formatDuration', () => {
  it('writes English minutes', () => {
    expect(formatDuration(10, 'en')).toBe('under 1 min')
    expect(formatDuration(60, 'en')).toBe('about 1 min')
    expect(formatDuration(124.7, 'en')).toBe('about 2 min')
    expect(formatDuration(600, 'en')).toBe('about 10 min')
  })

  it('uses correct Arabic number agreement: 1, 2, 3-10, 11+', () => {
    expect(formatDuration(10, 'ar')).toBe('أقل من دقيقة')
    expect(formatDuration(45, 'ar')).toBe('حوالي دقيقة')
    expect(formatDuration(60, 'ar')).toBe('حوالي دقيقة')
    expect(formatDuration(120, 'ar')).toBe('حوالي دقيقتين')
    expect(formatDuration(180, 'ar')).toBe('حوالي ٣ دقائق')
    expect(formatDuration(600, 'ar')).toBe('حوالي ١٠ دقائق')
    expect(formatDuration(660, 'ar')).toBe('حوالي ١١ دقيقة')
    expect(formatDuration(1500, 'ar')).toBe('حوالي ٢٥ دقيقة')
    expect(formatDuration(6000, 'ar')).toBe('حوالي ١٠٠ دقيقة')
  })
})

describe('addStrings', () => {
  it('registers extra keys that t() and hasString() see, with Arabic and params', async () => {
    const { addStrings } = await import('../src/i18n/strings.js')
    addStrings({ 'test.extra': { en: 'Hello {name}', ar: 'مرحبا {name}' } })
    expect(hasString('test.extra')).toBe(true)
    expect(t('test.extra', 'en', { name: 'Sam' })).toBe('Hello Sam')
    expect(t('test.extra', 'ar', { name: 'سام' })).toBe('مرحبا سام')
  })
})

describe('strings for the lazy screens (strings-more.js)', () => {
  it('has English and Arabic for every key, the same placeholders, Arabic in Arabic script, no clash with the main table', async () => {
    const { MORE } = await import('../src/i18n/strings-more.js')
    const names = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    const text = (s) => s.replace(/\{\w+\}/g, '')
    for (const [key, entry] of Object.entries(MORE)) {
      expect(entry.en, key).toBeTruthy()
      expect(entry.ar, key).toBeTruthy()
      expect(names(entry.ar), key).toEqual(names(entry.en))
      expect(text(entry.ar), key).not.toMatch(/[A-Za-z0-9]/)
      expect(entry.ar, key).toMatch(ARABIC_LETTER)
      expect(entry.en, key).not.toMatch(ARABIC_LETTER)
      expect(STRINGS[key], `${key} is also in the main table`).toBeUndefined()
    }
  })
})
