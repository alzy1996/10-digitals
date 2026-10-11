/**
 * Venue search (CONTRACT.md section 3, `src/search/`). Pure JS, no DOM.
 *
 *   const search = createSearch(index)
 *   search('toilet', 'en')                    -> Result[] (best first)
 *   search('حمام', 'ar', 'L1')                -> restrooms on L1 first, then the nearest other levels
 *   search('food', 'en', { levelId: 'G', limit: 10 })
 *   search.tile('restrooms', { levelId })     -> what a home tile shows (food, restrooms, prayer, pharmacy,
 *                                                kids, exit), nearest level first
 *
 * Both languages are always searched (people type English in Arabic mode and the reverse), plus light Arabizi
 * ("7alwa"). `lang` only decides the alphabetical tie-break. Typo matches are dropped when the query also
 * matches something properly. Ranking tiers: exact name > name prefix / whole word > keyword, category or synonym > fuzzy
 * (1 typo for terms of 4+ letters, 2 for 7+). Ties go to the nearer level (when a level hint is given), then
 * the more prominent place (landmarkScore), then the name. With a level hint, amenity results are grouped by
 * level, nearest level first.
 *
 * Result = { type: 'occupant'|'amenity'|'category'|'anchor'|'connector', id, name: { en, ar }, levelId, score }
 * plus extras: `category` (occupant or amenity category), `matchedBy`, and `count` on category results.
 * ('anchor' results are entrances, returned for exit / taxi searches; 'connector' results are lifts, escalators
 * and stairs, with levelId null because they serve several levels.)
 *
 * Goods people ask for (perfume, shoes, glasses, gifts, watches) are concepts with singular AND plural forms in
 * both languages: Arabic broken plurals share no prefix with their singulars (عطر / عطور).
 */
import { STRINGS } from '../i18n/strings.js'
import { deArabizi, editDistance, maxEditsFor, normalize, tokenize } from './normalize.js'
import { TILE_IDS } from './tileIds.js'

/** Score tiers (higher is better). */
export const SCORES = Object.freeze({
  exactName: 1000,
  category: 900, // cap for category rows, so an exact shop name still wins
  namePrefix: 800,
  nameWord: 780,
  nameWordPrefix: 720,
  nameCompactPrefix: 700,
  concept: 560,
  keyword: 550,
  categoryTerm: 540,
  keywordPrefix: 450,
  conceptPrefix: 440,
  fuzzyName: 320,
  fuzzyKeyword: 260,
  perEdit: 40,
  secondary: 20, // e.g. wudu rooms when you searched for prayer rooms
  arabizi: 20,
  perLevel: 10, // per floor away from the level hint
})

/**
 * Synonym groups ("concepts"). A query that matches any term finds every place the concept targets.
 * Terms are normalised at start-up, so spelling variants with or without hamza / taa marbuta are covered.
 */
export const CONCEPTS = Object.freeze({
  restroom: {
    terms: ['toilet', 'toilets', 'washroom', 'washrooms', 'restroom', 'restrooms', 'wc', 'bathroom', 'bathrooms',
      'lavatory', 'loo', 'ladies', 'gents', 'hammam', 'hamam', 'حمام', 'حمامات', 'دورة مياه', 'دورات مياه',
      'دورة المياه', 'دورات المياه', 'مرحاض', 'مراحيض', 'تواليت'],
    amenityCategories: ['restroom_men', 'restroom_women', 'restroom_accessible', 'restroom_family'],
  },
  baby: {
    terms: ['baby change', 'baby changing', 'diaper', 'diapers', 'nappy', 'nappies', 'family room', 'حفاضات',
      'تغيير الحفاضات', 'غرفة العائلة', 'غرفة الرضاعة'],
    amenityCategories: ['restroom_family'],
  },
  accessible: {
    terms: ['accessible', 'wheelchair', 'disabled', 'handicap', 'ذوي الاعاقة', 'ذوي الإعاقة', 'كرسي متحرك', 'معاقين'],
    amenityCategories: ['restroom_accessible'],
  },
  prayer: {
    terms: ['prayer', 'prayers', 'prayer room', 'prayer rooms', 'pray', 'musalla', 'musallah', 'musala', 'mosque',
      'masjid', 'salah', 'salat', 'namaz', 'مصلى', 'مصليات', 'صلاة', 'صلاه', 'مكان الصلاة', 'أماكن الصلاة',
      'اماكن الصلاه', 'غرفة الصلاة', 'مسجد', 'جامع'],
    amenityCategories: ['musalla_men', 'musalla_women'],
    secondaryAmenityCategories: ['wudu_men', 'wudu_women'],
  },
  wudu: {
    terms: ['wudu', 'wudhu', 'wuzu', 'ablution', 'ablutions', 'وضوء', 'الوضوء', 'مكان الوضوء', 'ميضأة'],
    amenityCategories: ['wudu_men', 'wudu_women'],
  },
  atm: {
    terms: ['atm', 'atms', 'cash machine', 'cashpoint', 'cash', 'withdraw', 'صراف', 'صراف آلي', 'صراف الي',
      'صرافة آلية', 'سحب نقود'],
    amenityCategories: ['atm'],
    occupantKeywords: ['atm'],
  },
  pharmacy: {
    terms: ['pharmacy', 'pharmacies', 'chemist', 'drugstore', 'medicine', 'medicines', 'صيدلية', 'صيدليات', 'دواء',
      'أدوية', 'ادويه'],
    occupantKeywords: ['pharmacy'],
  },
  parking: {
    terms: ['parking', 'car park', 'carpark', 'garage', 'my car', 'park', 'موقف', 'مواقف', 'مواقف السيارات',
      'موقف السيارات', 'باركنج', 'سيارتي', 'كراج'],
    categoryId: 'parking',
  },
  cinema: {
    terms: ['cinema', 'cinemas', 'movie', 'movies', 'film', 'films', 'theatre', 'theater', 'imax', 'سينما',
      'سينيما', 'أفلام', 'افلام', 'فيلم'],
    occupantKeywords: ['cinema'],
  },
  food: {
    terms: ['food', 'foods', 'restaurant', 'restaurants', 'eat', 'eating', 'dining', 'food court', 'hungry',
      'lunch', 'dinner', 'breakfast', 'مطعم', 'مطاعم', 'أكل', 'اكل', 'طعام', 'وجبات', 'ساحة المطاعم',
      'فود كورت', 'غداء', 'عشاء', 'فطور'],
    occupantCategories: ['food'],
    categoryId: 'food',
  },
  cafe: {
    terms: ['cafe', 'cafes', 'coffee', 'coffee shop', 'tea', 'juice', 'drinks', 'قهوة', 'مقهى', 'مقاهي',
      'كافيه', 'كوفي', 'شاي', 'عصير', 'مشروبات'],
    occupantCategories: ['cafe'],
    categoryId: 'cafe',
  },
  kids: {
    terms: ['kids', 'kid', 'children', 'child', 'toys', 'toy', 'play area', 'playground', 'family fun',
      'أطفال', 'اطفال', 'طفل', 'ألعاب', 'العاب', 'ملاهي', 'ملعب'],
    occupantCategories: ['kids'],
    categoryId: 'kids',
  },
  exit: {
    terms: ['exit', 'exits', 'way out', 'entrance', 'entrances', 'entry', 'gate', 'gates', 'door', 'doors',
      'مخرج', 'مخارج', 'خروج', 'مدخل', 'مداخل', 'بوابة', 'باب'],
    anchorKinds: ['entrance'],
    secondaryAmenityCategories: ['taxi_pickup'],
  },
  taxi: {
    terms: ['taxi', 'taxis', 'cab', 'cabs', 'uber', 'careem', 'pickup', 'pick up', 'ride', 'تاكسي', 'تكسي',
      'سيارة أجرة', 'سيارات الأجرة', 'أجرة'],
    amenityCategories: ['taxi_pickup'],
  },
  info: {
    terms: ['information', 'info', 'help', 'help desk', 'customer service', 'concierge', 'lost and found',
      'استعلامات', 'مكتب الاستعلامات', 'خدمة العملاء', 'مساعدة', 'مفقودات'],
    amenityCategories: ['info_desk'],
  },
  // goods (singular + plural, both languages)
  perfume: {
    terms: ['perfume', 'perfumes', 'fragrance', 'fragrances', 'scent', 'scents', 'attar', 'عطر', 'عطور', 'عطورات',
      'العطور', 'دهن عود'],
    occupantKeywords: ['perfume'],
  },
  shoes: {
    terms: ['shoe', 'shoes', 'footwear', 'sandal', 'sandals', 'trainers', 'sneakers', 'حذاء', 'أحذية', 'احذيه',
      'جزمة', 'جزم', 'صندل', 'صنادل', 'نعال', 'نعل'],
    occupantKeywords: ['shoes', 'trainers'],
  },
  glasses: {
    terms: ['glasses', 'eyeglasses', 'spectacles', 'sunglasses', 'optician', 'opticians', 'optical', 'نظارة',
      'نظارات', 'نظارة شمسية', 'نظارات شمسية', 'بصريات', 'نظاراتي'],
    occupantKeywords: ['optician', 'glasses'],
  },
  gifts: {
    terms: ['gift', 'gifts', 'present', 'presents', 'souvenir', 'souvenirs', 'هدية', 'هدايا', 'تذكار', 'تذكارات'],
    occupantKeywords: ['gifts'],
  },
  watches: {
    // no watch shop in the demo mall: the jeweller sells watches
    terms: ['watch', 'watches', 'wristwatch', 'ساعة', 'ساعات', 'ساعة يد', 'ساعات يد'],
    occupantKeywords: ['jewellery'],
  },
  // getting between floors (connector documents)
  lift: {
    terms: ['lift', 'lifts', 'elevator', 'elevators', 'مصعد', 'مصاعد', 'اسانسير', 'أسانسير'],
    connectorTypes: ['lift'],
  },
  escalator: {
    terms: ['escalator', 'escalators', 'moving stairs', 'سلم متحرك', 'سلالم متحركة', 'السلم المتحرك',
      'درج كهربائي', 'درج متحرك'],
    connectorTypes: ['escalator'],
  },
  stairs: {
    terms: ['stairs', 'stair', 'staircase', 'stairway', 'steps', 'درج', 'سلم', 'سلالم', 'الدرج'],
    connectorTypes: ['stairs'],
  },
})

/** Words for each occupant category (in addition to the category label in the string table). */
const CATEGORY_TERMS = Object.freeze({
  fashion: ['fashion', 'clothes', 'clothing', 'wear', 'أزياء', 'ملابس'],
  food: ['food', 'restaurant', 'restaurants', 'مطاعم', 'مطعم', 'طعام'],
  cafe: ['cafe', 'cafes', 'coffee', 'مقهى', 'مقاهي', 'قهوة'],
  electronics: ['electronics', 'gadgets', 'tech', 'إلكترونيات', 'أجهزة'],
  beauty: ['beauty', 'perfume', 'perfumes', 'cosmetics', 'تجميل', 'عطور', 'مستحضرات'],
  kids: ['kids', 'children', 'أطفال'],
  grocery: ['grocery', 'groceries', 'supermarket', 'بقالة', 'سوبرماركت'],
  entertainment: ['entertainment', 'fun', 'ترفيه'],
  home: ['home', 'furniture', 'decor', 'منزل', 'أثاث', 'مفروشات'],
  health: ['health', 'صحة'],
  services: ['services', 'خدمات'],
  parking: ['parking', 'مواقف'],
})

/** Filler words dropped from queries ("where is the nearest toilet" -> "toilet"). */
const STOPWORDS = new Set(
  ['where', 'is', 'the', 'a', 'an', 'nearest', 'closest', 'near', 'me', 'find', 'to', 'go', 'i', 'want', 'need',
    'please', 'shop', 'store', 'of', 'in', 'at', 'for', 'and', 'my',
    'اين', 'أين', 'وين', 'فين', 'اقرب', 'أقرب', 'قريب', 'ابي', 'أبي', 'ابغى', 'أبغى', 'اريد', 'أريد', 'محل', 'متجر',
    'اماكن', 'أماكن', 'مكان', 'في', 'من', 'الى', 'إلى', 'لو', 'سمحت'].map((w) => normalize(w)),
)

/** Home tiles -> concepts. */
export const TILES = Object.freeze({
  food: ['food', 'cafe'],
  restrooms: ['restroom'],
  prayer: ['prayer'],
  pharmacy: ['pharmacy'],
  kids: ['kids'],
  exit: ['exit', 'taxi'],
})
export { TILE_IDS }

const CATEGORY_LABEL_KEYS = {
  fashion: 'category.fashion',
  food: 'category.food',
  cafe: 'category.cafe',
  electronics: 'category.electronics',
  beauty: 'category.beauty',
  kids: 'category.kids',
  grocery: 'category.grocery',
  entertainment: 'category.entertainment',
  home: 'category.home',
  health: 'category.health',
  services: 'category.services',
  parking: 'category.parking',
}

/** A list of terms -> { words: Set<string>, compacts: string[] } */
function termSet(terms) {
  const words = new Set()
  const compacts = new Set()
  for (const term of terms) {
    if (!term) continue
    const toks = tokenize(term)
    for (const w of toks) words.add(w)
    const c = toks.join('')
    if (c) compacts.add(c)
  }
  return { words, compacts: [...compacts] }
}

/**
 * Concepts with normalised terms. Single-word terms (`words`) can match any word of a query
 * ("women restroom"); every term (`compacts`) can match the whole query ("دورة المياه").
 */
const NORMALIZED_CONCEPTS = Object.fromEntries(
  Object.entries(CONCEPTS).map(([id, c]) => {
    const words = new Set()
    const compacts = new Set()
    // multi-word terms ("my car", "lost and found", «صراف آلي»): matched as a phrase anywhere in the query,
    // before filler words are dropped (they may contain one)
    const phrases = new Set()
    for (const term of c.terms) {
      const toks = tokenize(term)
      if (toks.length === 1) words.add(toks[0])
      if (toks.length) compacts.add(toks.join(''))
      if (toks.length > 1) phrases.add(toks.join(''))
    }
    return [id, { ...c, id, words, compacts: [...compacts], phrases }]
  }),
)

function levelOf(index, occ) {
  const node = index.nodeById.get(occ.entranceNodeIds?.[0])
  if (node) return node.levelId
  return index.unitById.get(occ.unitIds?.[0])?.levelId ?? null
}

/**
 * Build the searchable documents for a venue.
 * @param {import('../data/venue.js').VenueIndex} index
 */
function buildDocs(index) {
  const docs = []
  const categoryCounts = new Map()

  for (const occ of index.occupantById.values()) {
    const names = [occ.name?.en, occ.name?.ar, occ.sign?.en, occ.sign?.ar].filter(Boolean)
    const keywords = [...(occ.keywords?.en ?? []), ...(occ.keywords?.ar ?? [])]
    const kwSet = termSet(keywords)
    const concepts = new Map()
    for (const c of Object.values(NORMALIZED_CONCEPTS)) {
      if (c.occupantCategories?.includes(occ.category)) concepts.set(c.id, 0)
      if (c.occupantKeywords?.some((k) => kwSet.words.has(normalize(k)) || kwSet.compacts.includes(normalize(k)))) concepts.set(c.id, 0)
    }
    categoryCounts.set(occ.category, (categoryCounts.get(occ.category) ?? 0) + 1)
    docs.push({
      type: 'occupant',
      id: occ.id,
      name: occ.name,
      levelId: levelOf(index, occ),
      category: occ.category,
      landmarkScore: occ.landmarkScore ?? 0,
      names: termSet(names),
      keywords: kwSet,
      categoryTerms: termSet([...(CATEGORY_TERMS[occ.category] ?? []), ...labelsFor(occ.category)]),
      concepts,
    })
  }

  for (const am of index.amenityById.values()) {
    const concepts = new Map()
    for (const c of Object.values(NORMALIZED_CONCEPTS)) {
      if (c.amenityCategories?.includes(am.category)) concepts.set(c.id, 0)
      else if (c.secondaryAmenityCategories?.includes(am.category)) concepts.set(c.id, SCORES.secondary)
    }
    docs.push({
      type: 'amenity',
      id: am.id,
      name: am.name,
      levelId: am.levelId,
      category: am.category,
      landmarkScore: 0,
      names: termSet([am.name?.en, am.name?.ar]),
      keywords: termSet([]),
      categoryTerms: termSet([]),
      concepts,
    })
  }

  for (const anchor of index.anchorById.values()) {
    const concepts = new Map()
    for (const c of Object.values(NORMALIZED_CONCEPTS)) if (c.anchorKinds?.includes(anchor.kind)) concepts.set(c.id, 0)
    if (concepts.size === 0) continue // only entrances are search results; other plates are for "you are here"
    docs.push({
      type: 'anchor',
      id: anchor.id,
      name: anchor.label,
      levelId: anchor.levelId,
      category: anchor.kind,
      landmarkScore: 0,
      names: termSet([anchor.label?.en, anchor.label?.ar]),
      keywords: termSet([]),
      categoryTerms: termSet([]),
      concepts,
    })
  }

  // Lifts, escalators and stairs (they serve several levels: levelId null).
  for (const conn of index.connectorById?.values() ?? []) {
    const concepts = new Map()
    for (const c of Object.values(NORMALIZED_CONCEPTS)) if (c.connectorTypes?.includes(conn.type)) concepts.set(c.id, 0)
    if (!concepts.size) continue
    docs.push({
      type: 'connector',
      id: conn.id,
      name: conn.name,
      levelId: null,
      category: conn.type,
      landmarkScore: 0,
      names: termSet([conn.name?.en, conn.name?.ar]),
      keywords: termSet([]),
      categoryTerms: termSet([]),
      concepts,
    })
  }

  // Category rows: every occupant category present, plus parking when the venue has parking.
  const categories = [...categoryCounts.keys()]
  if ((index.bayById?.size ?? 0) > 0) categories.push('parking')
  for (const cat of categories) {
    const key = CATEGORY_LABEL_KEYS[cat]
    const name = key ? { en: STRINGS[key].en, ar: STRINGS[key].ar } : { en: cat, ar: cat }
    const concepts = new Map()
    for (const c of Object.values(NORMALIZED_CONCEPTS)) if (c.categoryId === cat) concepts.set(c.id, 0)
    docs.push({
      type: 'category',
      id: cat,
      name,
      levelId: null,
      category: cat,
      landmarkScore: 0,
      count: cat === 'parking' ? index.bayById.size : categoryCounts.get(cat),
      names: termSet([name.en, name.ar]),
      keywords: termSet([]),
      categoryTerms: termSet(CATEGORY_TERMS[cat] ?? []),
      concepts,
    })
  }
  return docs
}

function labelsFor(category) {
  const key = CATEGORY_LABEL_KEYS[category]
  return key ? [STRINGS[key].en, STRINGS[key].ar] : []
}

// ---------------------------------------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------------------------------------

function bestFuzzy(term, candidates) {
  const max = maxEditsFor(term)
  if (max === 0) return null
  let best = null
  for (const c of candidates) {
    if (Math.abs(c.length - term.length) > max) continue
    const d = editDistance(term, c, max)
    if (d <= max && (best === null || d < best)) best = d
  }
  return best
}

/** Score of one query word against a document (0 = no match). */
function wordScore(doc, word, conceptHits) {
  let best = 0
  let how = null
  const take = (score, label) => {
    if (score > best) {
      best = score
      how = label
    }
  }
  // Name words.
  if (doc.names.words.has(word)) take(SCORES.nameWord, 'name')
  if (word.length >= 2) {
    for (const w of doc.names.words) if (w.startsWith(word)) take(SCORES.nameWordPrefix, 'prefix')
    for (const c of doc.names.compacts) if (c.startsWith(word)) take(SCORES.nameCompactPrefix, 'prefix')
  }
  // Keywords and category words.
  if (doc.keywords.words.has(word) || doc.keywords.compacts.includes(word)) take(SCORES.keyword, 'keyword')
  if (doc.categoryTerms.words.has(word) || doc.categoryTerms.compacts.includes(word)) take(SCORES.categoryTerm, 'category')
  if (word.length >= 3) {
    for (const w of doc.keywords.words) if (w.startsWith(word)) take(SCORES.keywordPrefix, 'keyword')
    for (const c of doc.keywords.compacts) if (c.startsWith(word)) take(SCORES.keywordPrefix, 'keyword')
  }
  // Synonyms.
  for (const [conceptId, penalty] of doc.concepts) {
    const hit = conceptHits.get(conceptId)?.get(word)
    if (hit) take(hit - penalty, 'synonym')
  }
  // Typos.
  if (best < SCORES.fuzzyName) {
    const dName = bestFuzzy(word, [...doc.names.words, ...doc.names.compacts])
    if (dName !== null) take(SCORES.fuzzyName - SCORES.perEdit * dName, 'fuzzy')
    const dKw = bestFuzzy(word, [...doc.keywords.words, ...doc.categoryTerms.words])
    if (dKw !== null) take(SCORES.fuzzyKeyword - SCORES.perEdit * dKw, 'fuzzy')
  }
  return { score: best, how }
}

/** Whole-query checks (exact name, name prefix, multi-word synonym, whole-name typo). */
function wholeScore(doc, compact, conceptWhole, nameRuns) {
  let best = 0
  let how = null
  const take = (score, label) => {
    if (score > best) {
      best = score
      how = label
    }
  }
  if (!compact) return { score: 0, how: null }
  if (doc.names.compacts.includes(compact)) take(SCORES.exactName, 'name')
  // the query is a name plus filler words only ("where is the ATM", «أين الصراف الآلي»)
  else if (nameRuns && doc.names.compacts.some((c) => nameRuns.has(c))) take(SCORES.exactName, 'name')
  if (compact.length >= 2) for (const c of doc.names.compacts) if (c.startsWith(compact)) take(SCORES.namePrefix, 'prefix')
  if (doc.keywords.compacts.includes(compact)) take(SCORES.keyword, 'keyword')
  if (doc.categoryTerms.compacts.includes(compact)) take(SCORES.categoryTerm, 'category')
  for (const [conceptId, penalty] of doc.concepts) {
    let hit = conceptWhole.get(conceptId)
    // the whole query IS a synonym ("موقف" = parking): it outranks a place whose name merely starts with it
    if (hit === SCORES.concept) hit = SCORES.namePrefix + 10
    if (hit) take(hit - penalty, 'synonym')
  }
  if (best < SCORES.fuzzyName) {
    const d = bestFuzzy(compact, doc.names.compacts)
    if (d !== null) take(SCORES.fuzzyName - SCORES.perEdit * d, 'fuzzy')
  }
  return { score: best, how }
}

/** Which concepts a query hits: per word (single-word terms) and as a whole (multi-word terms). */
function conceptMatches(words, compact) {
  /** @type {Map<string, Map<string, number>>} concept -> word -> score */
  const perWord = new Map()
  /** @type {Map<string, number>} concept -> score */
  const whole = new Map()
  for (const c of Object.values(NORMALIZED_CONCEPTS)) {
    const wm = new Map()
    for (const w of words) {
      let s = 0
      if (c.words.has(w)) s = SCORES.concept
      else if (w.length >= 3 && [...c.words].some((t) => t.startsWith(w))) s = SCORES.conceptPrefix
      else {
        const d = bestFuzzy(w, c.words)
        if (d !== null) s = SCORES.fuzzyKeyword - SCORES.perEdit * d
      }
      if (s) wm.set(w, s)
    }
    if (wm.size) perWord.set(c.id, wm)
    if (compact) {
      let s = 0
      if (c.compacts.includes(compact)) s = SCORES.concept
      else if (compact.length >= 3 && c.compacts.some((t) => t.startsWith(compact))) s = SCORES.conceptPrefix
      else {
        const d = bestFuzzy(compact, c.compacts)
        if (d !== null) s = SCORES.fuzzyKeyword - SCORES.perEdit * d
      }
      if (s) whole.set(c.id, s)
    }
  }
  return { perWord, whole }
}

function scoreDoc(doc, variant) {
  const { words, compact, penalty } = variant
  const whole = wholeScore(doc, compact, variant.concepts.whole, variant.nameRuns)
  let tokens = { score: 0, how: null }
  if (words.length) {
    let min = Infinity
    let how = null
    for (const w of words) {
      const r = wordScore(doc, w, variant.concepts.perWord)
      if (r.score < min) {
        min = r.score
        how = r.how
      }
      if (min === 0) break
    }
    tokens = { score: min === Infinity ? 0 : min, how }
  }
  const best = whole.score >= tokens.score ? whole : tokens
  if (!best.score) return null
  let score = best.score - penalty
  if (doc.type === 'category') score = Math.min(score, SCORES.category)
  return { score, how: best.how }
}

/**
 * Phrases in the full token list (filler words included), found before filler words are dropped:
 * - `phraseConcepts`: concepts with a multi-word term that appears as a run of words ("find MY CAR",
 *   "LOST AND FOUND", «أين الصراف الآلي»: 'my', 'and' and «إلى» (= «آلي» once normalised) are filler words);
 * - `nameRuns`: compact runs whose words outside the run are all filler words, for exact-name checks.
 */
function phrasesOf(all) {
  const runs = new Set()
  const nameRuns = new Set()
  const isStop = (w) => STOPWORDS.has(w)
  for (let i = 0; i < all.length; i++) {
    for (let j = i; j < all.length; j++) {
      const c = all.slice(i, j + 1).join('')
      if (j > i) runs.add(c)
      if (all.slice(0, i).every(isStop) && all.slice(j + 1).every(isStop)) nameRuns.add(c)
    }
  }
  const phraseConcepts = new Set()
  for (const c of Object.values(NORMALIZED_CONCEPTS)) {
    for (const ph of c.phrases) {
      if (runs.has(ph)) {
        phraseConcepts.add(c.id)
        break
      }
    }
  }
  return { phraseConcepts, nameRuns }
}

function prepareQuery(query) {
  const variants = []
  const add = (text, penalty) => {
    const all = tokenize(text)
    const kept = all.filter((w) => !STOPWORDS.has(w))
    const words = kept.length ? kept : all
    const compact = words.join('')
    if (!compact || variants.some((v) => v.compact === compact)) return
    const concepts = conceptMatches(words, compact)
    const { phraseConcepts, nameRuns } = phrasesOf(all)
    // a multi-word synonym said in full counts as the whole query naming that concept
    for (const id of phraseConcepts) if ((concepts.whole.get(id) ?? 0) < SCORES.concept) concepts.whole.set(id, SCORES.concept)
    variants.push({ words, compact, penalty, concepts, nameRuns })
  }
  add(query, 0)
  const arabizi = deArabizi(query)
  if (arabizi !== query) add(arabizi, SCORES.arabizi)
  return variants
}

/**
 * @typedef {{ type: 'occupant'|'amenity'|'category'|'anchor'|'connector', id: string, name: { en: string, ar: string },
 *   levelId: string | null, score: number, category?: string, matchedBy?: string, count?: number }} Result
 */

/**
 * Create a search function for a venue (documents are built once).
 * @param {import('../data/venue.js').VenueIndex} index
 * @returns {((query: string, lang?: 'en'|'ar', levelOrOptions?: string | { levelId?: string, limit?: number })
 *   => Result[]) & { tile: (tileId: string, options?: { levelId?: string, limit?: number }, lang?: 'en'|'ar')
 *   => Result[] }}
 */
export function createSearch(index) {
  if (!index || !(index.occupantById instanceof Map)) throw new TypeError('createSearch: expected a VenueIndex')
  const docs = buildDocs(index)
  const ordinal = (levelId) => index.levelById.get(levelId)?.ordinal

  // Sort: score, then prominence (landmarkScore), then name in the reader's language.
  const finish = (scored, levelId, limit, lang = 'en') => {
    const nameLang = lang === 'ar' ? 'ar' : 'en'
    const hint = levelId != null ? ordinal(levelId) : undefined
    const out = scored.map(({ doc, score, how }) => {
      let s = score
      if (hint !== undefined && doc.levelId != null) {
        const o = ordinal(doc.levelId)
        if (o !== undefined) s -= SCORES.perLevel * Math.abs(o - hint)
      }
      const result = { type: doc.type, id: doc.id, name: doc.name, levelId: doc.levelId, score: s, category: doc.category, matchedBy: how }
      if (doc.type === 'category') result.count = doc.count
      return { result, doc }
    })
    const byName = (a, b) =>
      String(a.doc.name[nameLang] ?? '').localeCompare(String(b.doc.name[nameLang] ?? ''), nameLang) ||
      (a.doc.id < b.doc.id ? -1 : 1)
    out.sort((a, b) => b.result.score - a.result.score || b.doc.landmarkScore - a.doc.landmarkScore || byName(a, b))
    if (hint !== undefined) {
      // Amenities (restrooms, prayer rooms...) are grouped by level, nearest level first, in the slots the
      // amenities already hold in the list: "restroom" from L1 lists every L1 restroom before any on G.
      const slots = []
      const amenities = []
      out.forEach((x, i) => {
        if (x.doc.type === 'amenity') {
          slots.push(i)
          amenities.push(x)
        }
      })
      const away = (x) => Math.abs((ordinal(x.doc.levelId) ?? hint) - hint)
      amenities.sort((a, b) => away(a) - away(b) || b.result.score - a.result.score || byName(a, b))
      slots.forEach((slot, i) => {
        out[slot] = amenities[i]
      })
    }
    return out.slice(0, limit).map((x) => x.result)
  }

  const search = (query, lang = 'en', levelOrOptions) => {
    const opts = typeof levelOrOptions === 'string' ? { levelId: levelOrOptions } : (levelOrOptions ?? {})
    const limit = Number.isFinite(opts.limit) ? opts.limit : 30
    const variants = prepareQuery(String(query ?? ''))
    if (!variants.length) return []
    const scored = []
    for (const doc of docs) {
      let best = null
      for (const v of variants) {
        const r = scoreDoc(doc, v)
        if (r && (!best || r.score > best.score)) best = r
      }
      if (best) scored.push({ doc, score: best.score, how: best.how })
    }
    // Typo matches are a fallback: when the query really matches something, drop the near-misses
    // («عطور» must not bring up places that serve «فطور»).
    const hasRealMatch = scored.some((x) => x.score >= SCORES.keywordPrefix)
    const kept = hasRealMatch ? scored.filter((x) => x.score >= SCORES.fuzzyName) : scored
    return finish(kept, opts.levelId, limit, lang)
  }

  search.tile = (tileId, options = {}, lang = 'en') => {
    const concepts = TILES[tileId]
    if (!concepts) return []
    const scored = []
    for (const doc of docs) {
      if (doc.type === 'category') continue
      let best = 0
      for (const c of concepts) if (doc.concepts.has(c)) best = Math.max(best, SCORES.concept - doc.concepts.get(c))
      if (best) scored.push({ doc, score: best, how: 'tile' })
    }
    return finish(scored, options.levelId, Number.isFinite(options.limit) ? options.limit : 50, lang)
  }

  return search
}
