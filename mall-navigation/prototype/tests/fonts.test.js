import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { coverageRanges } from '../tools/font-coverage.mjs'
import { validateVenue } from '../tools/validate-venue.mjs'
import { ARABIC_RANGES, LATIN_RANGES } from '../src/engine/fontCoverage.js'
import { drawableText, isDrawable, undrawableChars } from '../src/engine/textGuard.js'

const VENUE_PATH = fileURLToPath(new URL('../public/venues/demo-muscat/venue.json', import.meta.url))
const fresh = () => JSON.parse(readFileSync(VENUE_PATH, 'utf8'))

describe('3D font coverage (no CDN fallback, CONTRACT section 3)', () => {
  it('src/engine/fontCoverage.js matches the bundled woff files (run node tools/font-coverage.mjs after changing them)', () => {
    const cov = coverageRanges()
    expect(LATIN_RANGES).toEqual(cov.latin)
    expect(ARABIC_RANGES).toEqual(cov.arabic)
  })

  it('keeps drawable text unchanged, in both languages', () => {
    for (const [s, lang] of [['OUD HOUSE', 'en'], ['Café Ñ', 'en'], ['Al’s – Café', 'en'], ['بيت العود', 'ar'], ['قهوة · ١٢', 'ar'], ['ڤيرساتشي', 'ar']]) {
      expect(drawableText(s, lang), s).toBe(s)
      expect(undrawableChars(s, lang), s).toEqual([])
    }
  })

  it('maps letters the fonts lack to their closest drawable letter, never leaving one for troika to fetch', () => {
    expect(drawableText('Çiğköfte', 'en')).toBe('Çigköfte')
    expect(drawableText('Beşiktaş', 'en')).toBe('Besiktas')
    expect(drawableText('پيتزا', 'ar')).toBe('بيتزا')
    expect(drawableText('گلف', 'ar')).toBe('كلف')
    expect(drawableText('چاي', 'ar')).toBe('جاي')
    expect(drawableText('⁦B1-43⁩', 'en')).toBe('B1-43')
    for (const [s, lang] of [['Çiğköfte', 'en'], ['پيتزا گلف چاي ژ', 'ar'], ['漢字 OUD', 'en'], ['Łódź', 'en']]) {
      for (const ch of drawableText(s, lang)) expect(isDrawable(ch.codePointAt(0), lang) || /\s/.test(ch), `${s}: ${ch}`).toBe(true)
    }
  })

  it('the validator refuses venue text the 3D fonts cannot draw (names, signs, labels)', () => {
    const v = fresh()
    v.occupants[0].name.ar = 'پيتزا'
    v.occupants[1].sign.en = 'ÇIĞKÖFTE'
    v.landmarks[0].name.ar = 'گلف'
    const { errors } = validateVenue(v)
    expect(errors.some((e) => e.includes(v.occupants[0].id) && e.includes('U+067E'))).toBe(true)
    expect(errors.some((e) => e.includes(v.occupants[1].id) && e.includes('U+011E'))).toBe(true)
    expect(errors.some((e) => e.includes(v.landmarks[0].id) && e.includes('U+06AF'))).toBe(true)
  })
})
