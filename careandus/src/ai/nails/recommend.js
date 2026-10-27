// ISOLATED AI MODULE — explainable recommendation engine (deterministic rules, no paid API, no data leaves the phone).
// Inputs: skin analysis, hand shape, occasion, style persona, the salon's real catalog.
// Output: ranked shades + shapes + finishes, each with human-readable reasons (EN/AR keys).
import { hexToLab, labToLch, polishTemperature, deltaE2000 } from './lib/color.js'
import { COLLECTIONS } from '../../data/nails/library.js'

const TREND_IDS = new Set(COLLECTIONS.flatMap((c) => c.ids))
const TREND_HEX_FAMILIES = new Set(['milky', 'browns', 'metallics'])

// Family affinity by depth group (industry consensus; −2 avoid … +2 great)
const AFFINITY = {
  fair: {
    mauves: 2, teals: 0,
    nudes: 1, whites: 0, milky: 2, pastels: 2, pinks: 2, corals: 1, oranges: -1, reds: 2, berries: 2, purples: 1,
    blues: 1, greens: 0, yellows: -1, browns: 0, greys: 1, blacks: 0, metallics: 1, neons: -1,
  },
  medium: {
    mauves: 2, teals: 1,
    nudes: 2, whites: 1, milky: 1, pastels: 1, pinks: 1, corals: 2, oranges: 1, reds: 2, berries: 2, purples: 1,
    blues: 1, greens: 2, yellows: 1, browns: 2, greys: 0, blacks: 1, metallics: 2, neons: 1,
  },
  deep: {
    mauves: 1, teals: 2,
    nudes: 1, whites: 2, milky: 0, pastels: 1, pinks: 2, corals: 2, oranges: 2, reds: 2, berries: 2, purples: 2,
    blues: 2, greens: 1, yellows: 2, browns: 1, greys: -1, blacks: 1, metallics: 2, neons: 2,
  },
}
const DEPTH_GROUP = { veryLight: 'fair', light: 'fair', medium: 'medium', tan: 'medium', deep: 'deep', veryDeep: 'deep' }

const OCCASION_FAMILIES = {
  daily: ['nudes', 'milky', 'pinks', 'greys', 'browns', 'pastels'],
  office: ['nudes', 'milky', 'greys', 'browns', 'berries', 'reds'],
  wedding: ['whites', 'milky', 'nudes', 'reds', 'metallics', 'berries'],
  eid: ['reds', 'berries', 'metallics', 'purples', 'greens', 'browns'],
  vacation: ['corals', 'oranges', 'yellows', 'blues', 'neons', 'pastels', 'pinks'],
}
const OCCASION_FINISHES = {
  daily: ['creme', 'gloss', 'milky', 'sheer'],
  office: ['creme', 'gloss', 'milky', 'satin'],
  wedding: ['pearl', 'milky', 'gloss', 'chrome', 'shimmer'],
  eid: ['glitter', 'cateye', 'velvet', 'chrome', 'metallic', 'gloss'],
  vacation: ['creme', 'neon', 'gloss', 'holo'],
}
const PERSONA_FINISHES = {
  classic: ['creme', 'gloss'],
  minimal: ['milky', 'sheer', 'satin', 'creme'],
  bold: ['creme', 'gloss', 'neon', 'matte'],
  trendy: ['chrome', 'cateye', 'pearl', 'milky', 'velvet', 'duochrome'],
  glam: ['glitter', 'chrome', 'cateye', 'velvet', 'holo', 'metallic'],
}
const PERSONA_FAMILIES = {
  classic: ['reds', 'nudes', 'berries', 'whites'],
  minimal: ['nudes', 'milky', 'whites', 'greys', 'pastels'],
  bold: ['reds', 'blues', 'neons', 'oranges', 'purples', 'blacks', 'greens'],
  trendy: ['milky', 'browns', 'yellows', 'metallics', 'greens', 'pastels'],
  glam: ['metallics', 'reds', 'berries', 'blacks', 'purples'],
}

/**
 * @param catalog  array of polish objects {id, hex, family, finish, stock?, ...}
 * @param ctx      { skin?: analyzeSkin result, undertone?, depth?, occasion?, persona?, preferInStock? }
 */
export function recommendShades(catalog, ctx = {}) {
  const depth = ctx.depth || ctx.skin?.depth || 'medium'
  const undertone = ctx.undertone || ctx.skin?.undertone || 'neutral'
  const group = DEPTH_GROUP[depth] || 'medium'
  const skinLab = ctx.skin?.lab || null
  const occ = ctx.occasion || null
  const persona = ctx.persona || null

  const scored = catalog.map((p) => {
    const reasons = []
    let score = 0
    const aff = AFFINITY[group][p.family] ?? 0
    score += aff * 1.2
    if (aff >= 2) reasons.push({ k: 'r_depth_great', p: { depth } })

    const temp = polishTemperature(p.hex)
    const u = undertone === 'olive' ? 'warm' : undertone
    if (u !== 'neutral' && temp !== 'neutral') {
      if (temp === u) {
        score += 1.1
        reasons.push({ k: 'r_undertone_match', p: { undertone } })
      } else {
        score -= 0.6
      }
    } else score += 0.3
    // Olive skin: jewel tones (emerald, burgundy, plum, teal) are the classic flatterers
    if (undertone === 'olive' && ['greens', 'berries', 'purples'].includes(p.family)) {
      const [, C] = labToLch(hexToLab(p.hex))
      if (C > 18) {
        score += 0.9
        reasons.push({ k: 'r_olive_jewel' })
      }
    }

    // The "perfect nude": close in hue to the skin, 1–2 shades lighter (fair) or richer (deep)
    if (skinLab && (p.family === 'nudes' || p.family === 'milky')) {
      const lab = hexToLab(p.hex)
      const targetDL = group === 'fair' ? 4 : group === 'medium' ? -3 : -6
      const dL = lab[0] - skinLab[0]
      const lFit = 1 - Math.min(1, Math.abs(dL - targetDL) / 14)
      const hueDiff = Math.abs(labToLch(lab)[2] - labToLch(skinLab)[2])
      const hFit = 1 - Math.min(1, hueDiff / 40)
      const nude = lFit * 1.6 + hFit * 0.8
      score += nude
      if (nude > 1.6) reasons.push({ k: 'r_perfect_nude' })
    }

    // Contrast against the skin: bold persona loves it, minimal persona avoids it
    if (skinLab) {
      const contrast = deltaE2000(hexToLab(p.hex), skinLab)
      if (persona === 'bold' && contrast > 45) {
        score += 1
        reasons.push({ k: 'r_high_contrast' })
      }
      if (persona === 'minimal' && contrast < 18) score += 0.8
    }

    if (occ) {
      if (OCCASION_FAMILIES[occ]?.includes(p.family)) {
        score += 1
        reasons.push({ k: 'r_occasion', p: { occasion: occ } })
      }
      if (OCCASION_FINISHES[occ]?.includes(p.finish)) score += 0.5
    }
    if (persona) {
      if (PERSONA_FAMILIES[persona]?.includes(p.family)) {
        score += 0.8
        reasons.push({ k: 'r_persona', p: { persona } })
      }
      if (PERSONA_FINISHES[persona]?.includes(p.finish)) score += 0.6
    }
    if (TREND_IDS.has(p.id) || TREND_IDS.has('lib-' + p.code) || (TREND_HEX_FAMILIES.has(p.family) && persona === 'trendy')) {
      score += 0.35
      reasons.push({ k: 'r_trend' })
    }
    if (typeof p.stock === 'number') {
      if (p.stock > 0) score += 0.3
      else score -= ctx.preferInStock ? 3 : 0.5
    }
    return { polish: p, score, reasons: reasons.slice(0, 3) }
  })

  scored.sort((a, b) => b.score - a.score)
  // diversity: max 3 per family in the top list
  const perFamily = {}
  const out = []
  for (const s of scored) {
    const f = s.polish.family
    perFamily[f] = (perFamily[f] || 0) + 1
    if (perFamily[f] > 3) continue
    out.push(s)
    if (out.length >= (ctx.limit || 12)) break
  }
  return out
}

/** Recommended finishes for the context */
export function recommendFinishes(ctx = {}) {
  const set = new Map()
  const add = (k, w) => set.set(k, (set.get(k) || 0) + w)
  ;(OCCASION_FINISHES[ctx.occasion] || ['creme', 'gloss']).forEach((k, i) => add(k, 3 - i * 0.4))
  ;(PERSONA_FINISHES[ctx.persona] || []).forEach((k, i) => add(k, 2.5 - i * 0.4))
  return [...set.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k)
}

// ---------------------------------------------------------------- Hand proportions → shape & length

function dist3(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0))
}

/**
 * @param hand    {landmarks, world}
 * @param nails   fitted nails for that hand (2D px)
 */
export function analyzeHandShape(hand, nails = []) {
  const P = hand.world && hand.world.length === 21 ? hand.world : hand.landmarks
  const palm = dist3(P[5], P[17])
  const middle = dist3(P[9], P[10]) + dist3(P[10], P[11]) + dist3(P[11], P[12])
  const ring = dist3(P[13], P[14]) + dist3(P[14], P[15]) + dist3(P[15], P[16])
  const fingerRatio = palm > 0 ? (middle + ring) / 2 / palm : 1.2
  const fingerType = fingerRatio < 1.12 ? 'short' : fingerRatio > 1.42 ? 'long' : 'balanced'

  const beds = nails
    .filter((n) => ['index', 'middle', 'ring'].includes(n.finger) && n.wid > 0)
    .map((n) => n.len / n.wid)
  const bedRatio = beds.length ? beds.reduce((a, b) => a + b, 0) / beds.length : 1.15
  const nailBed = bedRatio < 1.02 ? 'wide' : bedRatio > 1.4 ? 'narrow' : 'balanced'

  const shapeScore = { natural: 0, round: 0, squoval: 0, square: 0, oval: 0, almond: 0, coffin: 0, stiletto: 0 }
  const reasons = []
  if (fingerType === 'short') {
    shapeScore.almond += 3
    shapeScore.oval += 2.5
    shapeScore.stiletto += 1
    shapeScore.square -= 1.5
    reasons.push('rs_short_fingers')
  } else if (fingerType === 'long') {
    shapeScore.square += 2
    shapeScore.coffin += 2
    shapeScore.squoval += 1.5
    shapeScore.almond += 1
    reasons.push('rs_long_fingers')
  } else {
    shapeScore.squoval += 2
    shapeScore.almond += 2
    shapeScore.oval += 1.5
    shapeScore.coffin += 1
    reasons.push('rs_balanced_fingers')
  }
  if (nailBed === 'wide') {
    shapeScore.oval += 1.5
    shapeScore.almond += 1.5
    shapeScore.square -= 1
    reasons.push('rs_wide_beds')
  } else if (nailBed === 'narrow') {
    shapeScore.squoval += 1.5
    shapeScore.square += 1
    reasons.push('rs_narrow_beds')
  }
  const shapes = Object.entries(shapeScore)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k)
  // short fingers gain length from a medium free edge; long slender fingers carry long sets well
  const length = fingerType === 'long' ? 'long' : 'medium'
  return {
    fingerRatio: Math.round(fingerRatio * 100) / 100,
    fingerType,
    bedRatio: Math.round(bedRatio * 100) / 100,
    nailBed,
    shapes,
    length,
    reasons,
  }
}
