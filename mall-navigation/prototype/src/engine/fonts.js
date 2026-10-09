/**
 * Self-hosted sign fonts for troika-three-text (CONTRACT.md §3: never let troika fetch from a CDN).
 *
 * - Latin: Readex Pro SemiBold Latin subset. Also set as troika's defaultFontURL, so punctuation the
 *   Arabic subset lacks (for example "·") falls back to it instead of the unicode-font-resolver CDN.
 * - Arabic: Readex Pro SemiBold Arabic subset.
 * - A character neither font has would send troika to its unicode-font-resolver, which in the stock library tries
 *   `unicodeFontsURL` and then, when that has no data, its default CDN: setting the URL alone does NOT prevent a
 *   third-party request. Three layers keep it out:
 *   1. every string passes through textGuard.drawableText() before it reaches troika (only code points listed in
 *      fontCoverage.js, generated from the two .woff files);
 *   2. tools/validate-venue.mjs refuses venue text the fonts cannot draw;
 *   3. the build replaces troika's resolver with a stub (vite.config.js `dallni-troika-no-cdn`) that maps any
 *      leftover character to the font at `unicodeFontsURL`, our own Latin sign font: a blank glyph, never a fetch.
 */
import { configureTextBuilder } from 'troika-three-text'

export const FONT_LATIN = new URL('../assets/fonts/readex-latin-600.woff', import.meta.url).href
export const FONT_ARABIC = new URL('../assets/fonts/readex-arabic-600.woff', import.meta.url).href
/** What troika's (stubbed) fallback resolver hands back for a character no sign font has: our own Latin font. */
export const UNICODE_FONTS_URL = FONT_LATIN

let configured = false

/** Configure troika once, before the first text request. Safe to call repeatedly. */
export function configureFonts() {
  if (configured) return
  configured = true
  configureTextBuilder({
    defaultFontURL: FONT_LATIN,
    unicodeFontsURL: UNICODE_FONTS_URL,
    sdfGlyphSize: 64,
    useWorker: true,
  })
}

/**
 * Font for a language.
 * @param {'en'|'ar'} lang
 */
export function fontFor(lang) {
  return lang === 'ar' ? FONT_ARABIC : FONT_LATIN
}

/** True when the string contains Arabic script. */
export function hasArabic(s) {
  return /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(s)
}
