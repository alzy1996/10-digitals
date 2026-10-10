/**
 * Keep 3D text inside the bundled sign fonts (CONTRACT.md section 3: never let troika fetch fonts).
 *
 * troika resolves each character against the text's own font, then the default font (Latin), and asks its
 * unicode-font-resolver for anything still missing. That resolver retries on a third-party CDN when our
 * same-origin URL has no data, and offline (a basement car park) the text never finishes typesetting.
 * So every string goes through `drawableText()` before it reaches troika:
 * - English text must be drawable with the Latin font; Arabic text with the Arabic font or the Latin one
 *   (troika's fallback order);
 * - a missing letter becomes its closest drawable one: Gulf / Persian letters to their Arabic base
 *   (پ -> ب, گ -> ك, چ -> ج ...), accented Latin to its base letter (ğ -> g, ş -> s);
 * - invisible formatting characters are dropped; anything else missing is dropped too.
 * tools/validate-venue.mjs refuses such text in venue data, so this is a safety net for real malls' data.
 */
import { ARABIC_RANGES, LATIN_RANGES } from './fontCoverage.js'

/** Gulf / Persian / Urdu letters -> the Arabic letter they are built on. */
const ARABIC_FALLBACK = new Map(
  Object.entries({
    'پ': 'ب', // peh
    'چ': 'ج', // tcheh
    'ژ': 'ز', // jeh
    'گ': 'ك', // gaf
    'ک': 'ك', // keheh
    'ی': 'ي', // farsi yeh
    'ے': 'ي', // yeh barree
    'ۀ': 'ه',
    'ە': 'ه',
    'ہ': 'ه',
    'ھ': 'ه',
    'ۃ': 'ة',
    'ٹ': 'ت',
    'ڈ': 'د',
    'ڑ': 'ر',
    'ڨ': 'ق',
    'ڭ': 'ك',
    'ۆ': 'و',
    'ۇ': 'و',
    'ۈ': 'و',
    'ۋ': 'و',
    '۰': '٠',
    '۱': '١',
    '۲': '٢',
    '۳': '٣',
    '۴': '٤',
    '۵': '٥',
    '۶': '٦',
    '۷': '٧',
    '۸': '٨',
    '۹': '٩',
  }),
)

/** Punctuation the fonts may lack -> a plain stand-in. */
const PUNCT_FALLBACK = new Map(
  Object.entries({
    '‐': '-',
    '‑': '-',
    '‒': '-',
    '―': '-',
    '′': "'",
    '″': '"',
    '´': "'",
  }),
)

/** Default-ignorable formatting characters (bidi controls, joiners, BOM): troika needs none of them. */
const IGNORABLE = /[­؜​-‏‪-‮⁠-⁯︀-️﻿]/

function inRanges(cp, ranges) {
  let lo = 0
  let hi = ranges.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const [a, b] = ranges[mid]
    if (cp < a) hi = mid - 1
    else if (cp > b) lo = mid + 1
    else return true
  }
  return false
}

/**
 * Can the 3D text of this language draw this code point without troika's font resolver?
 * @param {number} cp
 * @param {'en'|'ar'} lang
 */
export function isDrawable(cp, lang) {
  if (inRanges(cp, LATIN_RANGES)) return true
  return lang === 'ar' && inRanges(cp, ARABIC_RANGES)
}

/**
 * The characters of a string the 3D text cannot draw (for checks and warnings).
 * @param {string} str
 * @param {'en'|'ar'} lang
 * @returns {string[]}
 */
export function undrawableChars(str, lang) {
  const out = new Set()
  for (const ch of String(str ?? '')) if (!/\s/.test(ch) && !isDrawable(ch.codePointAt(0), lang)) out.add(ch)
  return [...out]
}

function substitute(ch, lang) {
  const ar = ARABIC_FALLBACK.get(ch)
  if (ar && isDrawable(ar.codePointAt(0), lang)) return ar
  const p = PUNCT_FALLBACK.get(ch)
  if (p) return p
  // accented Latin -> base letter (ğ -> g + combining breve -> g); presentation forms -> their letters
  const base = ch.normalize('NFKD')
  let kept = ''
  for (const c of base) {
    const cp = c.codePointAt(0)
    if (cp >= 0x300 && cp <= 0x36f) continue // combining marks the fonts may not position: drop
    if (isDrawable(cp, lang)) kept += c
  }
  return kept
}

/**
 * A string the 3D text can draw with the bundled fonts only (see the module comment).
 * @param {string} str
 * @param {'en'|'ar'} lang  the font the text is set in (English: Latin; Arabic: Arabic, then Latin)
 * @returns {string}
 */
export function drawableText(str, lang) {
  const s = String(str ?? '')
  let out = ''
  let changed = false
  for (const ch of s) {
    if (/\s/.test(ch)) {
      out += ch === ' ' || ch === ' ' ? ch : ' '
      if (ch !== ' ' && ch !== ' ') changed = true
      continue
    }
    if (isDrawable(ch.codePointAt(0), lang)) {
      out += ch
      continue
    }
    changed = true
    if (IGNORABLE.test(ch)) continue
    out += substitute(ch, lang)
  }
  return changed ? out.replace(/ {2,}/g, ' ').trim() : s
}
