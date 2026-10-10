/**
 * Text normalisation for search (CONTRACT.md section 3, `src/search/`). Pure JS, no DOM.
 *
 * Arabic: strip tashkeel and tatweel; أ إ آ ٱ -> ا; ة -> ه; ى -> ي; ؤ -> و; ئ -> ي; «اءة» -> «اية» (Gulf
 *   spelling, عباءة = عباية); drop the lone hamza ء;
 *   Arabic-Indic and Persian digits -> ASCII; a leading article "ال" (and "وال" "بال" "فال" "كال" "لل") is
 *   stripped from each word when enough of the word is left.
 * Latin: lowercase, strip accents, "&" -> "and", apostrophes removed.
 * Everything else that is not a letter or digit becomes a word break.
 *
 * `normalize(str)` returns the COMPACT form (all words joined, no spaces) so "Oud House", "oud-house" and
 * "OudHouse" all compare equal. Use `tokenize(str)` (or `normalize(str, { compact: false })`) when you need
 * the separate words.
 */

const ARABIC_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭ]/g
const LATIN_MARKS = /[̀-ͯ]/g
const APOSTROPHES = /['’‘`´ʼ]/g

const CHAR_MAP = new Map([
  ['ـ', ''], // tatweel
  ['أ', 'ا'],
  ['إ', 'ا'],
  ['آ', 'ا'],
  ['ٱ', 'ا'],
  ['ٲ', 'ا'],
  ['ٳ', 'ا'],
  ['ة', 'ه'],
  ['ۀ', 'ه'],
  ['ى', 'ي'],
  ['ی', 'ي'],
  ['ې', 'ي'],
  ['ؤ', 'و'],
  ['ئ', 'ي'],
  ['ء', ''],
  ['ک', 'ك'],
  ['گ', 'ك'],
  ['٠', '0'],
  ['١', '1'],
  ['٢', '2'],
  ['٣', '3'],
  ['٤', '4'],
  ['٥', '5'],
  ['٦', '6'],
  ['٧', '7'],
  ['٨', '8'],
  ['٩', '9'],
  ['۰', '0'],
  ['۱', '1'],
  ['۲', '2'],
  ['۳', '3'],
  ['۴', '4'],
  ['۵', '5'],
  ['۶', '6'],
  ['۷', '7'],
  ['۸', '8'],
  ['۹', '9'],
  ['ß', 'ss'],
  ['æ', 'ae'],
  ['œ', 'oe'],
  ['ø', 'o'],
  ['ł', 'l'],
  ['ı', 'i'],
])

/** Article-like prefixes and how many letters must remain after stripping. */
const ARABIC_PREFIXES = [
  ['وال', 3],
  ['بال', 3],
  ['فال', 3],
  ['كال', 3],
  ['لل', 3],
  ['ال', 2],
]

function stripArticle(word) {
  for (const [prefix, minRest] of ARABIC_PREFIXES) {
    if (word.startsWith(prefix) && word.length - prefix.length >= minRest) return word.slice(prefix.length)
  }
  return word
}

/**
 * Normalised words of a string.
 * @param {string} str
 * @returns {string[]}
 */
export function tokenize(str) {
  let s = String(str ?? '')
  // NFKD splits Arabic presentation forms and hamza/madda carriers (أ -> ا + hamza mark) and Latin accents.
  s = s.normalize('NFKD').replace(ARABIC_MARKS, '').replace(LATIN_MARKS, '')
  s = s.toLowerCase()
  // Gulf spelling: «عباية» for «عباءة», «عبايات» for «عباءات» (hamza after alif before taa marbuta / -at).
  s = s.replace(/اء(?=ة|ات)/g, 'اي')
  let out = ''
  for (const ch of s) out += CHAR_MAP.has(ch) ? CHAR_MAP.get(ch) : ch
  out = out.replace(/&/g, ' and ').replace(APOSTROPHES, '')
  return out
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => (/[؀-ۿ]/.test(w) ? stripArticle(w) : w))
}

/**
 * Normalise a string for matching.
 * @param {string} str
 * @param {{ compact?: boolean }} [options] compact (default true): join the words without spaces
 * @returns {string}
 */
export function normalize(str, { compact = true } = {}) {
  return tokenize(str).join(compact ? '' : ' ')
}

/**
 * Edit distance (optimal string alignment: insert, delete, substitute, swap two neighbours), giving up as soon
 * as it must exceed `max` (returns max + 1 then).
 * @param {string} a
 * @param {string} b
 * @param {number} max
 * @returns {number}
 */
export function editDistance(a, b, max = Infinity) {
  if (a === b) return 0
  const la = a.length
  const lb = b.length
  if (Math.abs(la - lb) > max) return max + 1
  if (la === 0) return lb
  if (lb === 0) return la
  let prev2 = null
  let prev = new Array(lb + 1)
  for (let j = 0; j <= lb; j++) prev[j] = j
  for (let i = 1; i <= la; i++) {
    const cur = new Array(lb + 1)
    cur[0] = i
    let rowMin = cur[0]
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1)
      cur[j] = v
      if (v < rowMin) rowMin = v
    }
    if (rowMin > max) return max + 1
    prev2 = prev
    prev = cur
  }
  return prev[lb]
}

/**
 * Typos allowed for a search term: 1 for terms of 4+ characters, 2 for 7+ (contract), none below 4.
 * @param {string} term normalised term
 */
export function maxEditsFor(term) {
  const n = [...term].length
  if (n >= 7) return 2
  if (n >= 4) return 1
  return 0
}

/**
 * Latin "Arabizi" chat spelling -> plain Latin (7 -> h, 3 -> a, 5 -> kh, 6 -> t, 8 -> gh, 9 -> q, 2 -> a), so
 * "7alwa" finds "Halwa". Only words that mix letters and those digits are touched (codes like B2-14 stay).
 * @param {string} str
 * @returns {string}
 */
export function deArabizi(str) {
  return String(str ?? '').replace(/[a-z0-9]+/gi, (word) => {
    const letters = (word.match(/[a-z]/gi) ?? []).length
    if (letters < 2 || !/[235-9]/.test(word)) return word
    return word
      .replace(/7/g, 'h')
      .replace(/3/g, 'a')
      .replace(/5/g, 'kh')
      .replace(/6/g, 't')
      .replace(/8/g, 'gh')
      .replace(/9/g, 'q')
      .replace(/2/g, 'a')
  })
}
