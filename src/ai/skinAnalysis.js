// ISOLATED AI MODULE — skin depth + undertone from the back of the hand, fully on-device.
// Method: robust CIELAB median of the dorsal hand between the knuckles and the wrist,
// with specular / shadow / henna / vein rejection, then ITA° (depth) + hue angle (undertone)
// and nearest Monk Skin Tone orb. Optional white-reference calibration (von Kries).
import { lin8, linearToLab, labToLch, itaDegrees, deltaE2000, hexToLab, median, percentile, linearToSrgb, rgbToHex, clamp } from '../lib/color'
import { MONK_SCALE } from '../data/taxonomy'

const MONK_LAB = MONK_SCALE.map((m) => ({ ...m, lab: hexToLab(m.hex) }))

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/**
 * @param img ImageData of the frame (any scale)
 * @param lm  normalized landmarks of the hand
 * @param opts { white: [r,g,b] linear white reference or null, dorsal: number (dorsal score) }
 */
export function analyzeSkin(img, lm, opts = {}) {
  const W = img.width
  const H = img.height
  const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H })
  const p0 = P(0)
  // Quad on the back of the hand: from just below the knuckles toward the wrist
  const qA = lerp(P(5), p0, 0.18)
  const qB = lerp(P(17), p0, 0.18)
  const qC = lerp(P(17), p0, 0.62)
  const qD = lerp(P(5), p0, 0.62)
  // shrink sideways 12% to avoid the hand edges
  const A2 = lerp(qA, qB, 0.12)
  const B2 = lerp(qB, qA, 0.12)
  const C2 = lerp(qC, qD, 0.12)
  const D2 = lerp(qD, qC, 0.12)

  let wb = [1, 1, 1]
  const whiteRef = opts.white || opts.autoWhite
  if (whiteRef) {
    const [wr, wg, wbb] = whiteRef
    // von Kries: make the reference neutral AND bring it to paper-white level (~0.88 linear ≈ L* 95),
    // which corrects both the color cast and the exposure of the skin.
    const PAPER = 0.88
    if (wr > 0.02 && wg > 0.02 && wbb > 0.02) wb = [PAPER / wr, PAPER / wg, PAPER / wbb].map((k) => clamp(k, 0.4, 3.5))
  }

  const samples = []
  const N = 22
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const u = (i + 0.5) / N
      const v = (j + 0.5) / N
      const top = lerp(A2, B2, u)
      const bot = lerp(D2, C2, u)
      const p = lerp(top, bot, v)
      const x = p.x | 0
      const y = p.y | 0
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue
      // 3x3 box average to beat sensor noise
      let r = 0
      let g = 0
      let b = 0
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const o = ((y + dy) * W + (x + dx)) * 4
          r += lin8(img.data[o])
          g += lin8(img.data[o + 1])
          b += lin8(img.data[o + 2])
        }
      r = (r / 9) * wb[0]
      g = (g / 9) * wb[1]
      b = (b / 9) * wb[2]
      samples.push({ lin: [r, g, b], lab: linearToLab(r, g, b) })
    }
  }
  const warnings = []
  if (samples.length < 40) return { ok: false, reason: 'hand_too_small', warnings: ['hand_too_small'] }

  // --- rejection: specular highlights, deep shadows, then chroma outliers (henna, veins, tattoos)
  const Ls = samples.map((s) => s.lab[0])
  const lLo = percentile(Ls, 0.12)
  const lHi = percentile(Ls, 0.88)
  let kept = samples.filter((s) => s.lab[0] >= lLo && s.lab[0] <= lHi && s.lab[0] > 6 && s.lab[0] < 95)
  const Cs = kept.map((s) => Math.hypot(s.lab[1], s.lab[2]))
  const cMed = median(Cs)
  const cMad = median(Cs.map((c) => Math.abs(c - cMed))) || 1
  let hennaLike = 0
  kept = kept.filter((s) => {
    const C = Math.hypot(s.lab[1], s.lab[2])
    const [, , h] = labToLch(s.lab)
    const henna = C > cMed + 10 && h > 28 && h < 65
    if (henna) hennaLike++
    return !henna && Math.abs(C - cMed) < 3.2 * cMad + 2
  })
  if (hennaLike > samples.length * 0.08) warnings.push('henna')
  if (kept.length < 25) return { ok: false, reason: 'unclear', warnings }

  const lab = [median(kept.map((s) => s.lab[0])), median(kept.map((s) => s.lab[1])), median(kept.map((s) => s.lab[2]))]
  const lin = [median(kept.map((s) => s.lin[0])), median(kept.map((s) => s.lin[1])), median(kept.map((s) => s.lin[2]))]
  const hex = rgbToHex(linearToSrgb(lin[0]), linearToSrgb(lin[1]), linearToSrgb(lin[2]))
  const [L, a, b] = lab
  const [, C, h] = labToLch(lab)
  const ita = itaDegrees(L, b)

  // Depth / Monk level. ITA° is only stable when b* is healthy: real skin of every depth has b* ≳ 8 under neutral
  // light, so a low b* means a grey / washed-out photo. Then we fall back to L*, lower confidence and ask to calibrate.
  const monkFromL = L >= 72 ? 2.5 : L >= 64 ? 4 : L >= 56 ? 5 : L >= 47 ? 6 : L >= 38 ? 7 : L >= 30 ? 8 : L >= 22 ? 9 : 10
  const monkFromIta = ita > 55 ? 1.5 : ita > 41 ? 3 : ita > 28 ? 4.5 : ita > 10 ? 6 : ita > -30 ? 7.5 : 9.5
  const washedOut = b < 7
  const monkRaw = washedOut ? monkFromL : (monkFromL + monkFromIta) / 2
  const monk = clamp(Math.round(monkRaw), 1, 10)
  const depth = monkToDepth(monk)
  const nearestOrbs = MONK_LAB.map((m) => ({ level: m.level, d: Math.abs(m.level - monkRaw) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, 3)
    .map((m) => m.level)
    .sort((x, y) => x - y)

  // Undertone from hue angle h(ab): lower = pink/red (cool), higher = yellow/golden (warm).
  // Olive = golden-green cast: high hue with comparatively low redness.
  let undertone
  if (h >= 62 && a < 11 && L > 35 && L < 75) undertone = 'olive'
  else if (h >= 57) undertone = 'warm'
  else if (h < 47) undertone = 'cool'
  else undertone = 'neutral'

  // Confidence: spread of kept samples + calibration + hand orientation + colorfulness
  const spread = median(kept.map((s) => deltaE2000(s.lab, lab)))
  let confidence = clamp(1 - (spread - 2) / 8, 0.2, 1)
  if (!opts.white) confidence *= opts.autoWhite ? 0.92 : 0.85
  if (typeof opts.dorsal === 'number' && opts.dorsal < 0) {
    confidence *= 0.7
    warnings.push('palm_side')
  }
  if (L > 88 || L < 12) {
    confidence *= 0.6
    warnings.push('exposure')
  }
  if (washedOut) {
    confidence *= 0.6
    if (!opts.white) warnings.push('washed_out')
  }
  const undertoneMargin = Math.min(Math.abs(h - 47), Math.abs(h - 57))
  const chromaFactor = clamp((C - 6) / 10, 0.25, 1) // hue is meaningless on near-grey samples
  const undertoneConfidence = clamp(confidence * chromaFactor * (0.55 + undertoneMargin / 12), 0.15, 0.95)
  if (undertoneConfidence < 0.35) undertone = 'neutral'

  return {
    ok: true,
    lab: lab.map((v) => Math.round(v * 10) / 10),
    hex,
    ita: Math.round(ita * 10) / 10,
    hue: Math.round(h * 10) / 10,
    chroma: Math.round(C * 10) / 10,
    depth,
    monk,
    nearestOrbs,
    undertone,
    confidence: Math.round(confidence * 100) / 100,
    undertoneConfidence: Math.round(undertoneConfidence * 100) / 100,
    calibrated: !!opts.white,
    autoBalanced: !opts.white && !!opts.autoWhite,
    samples: kept.length,
    warnings,
  }
}

export function monkToDepth(level) {
  return level <= 2 ? 'veryLight' : level === 3 ? 'light' : level <= 5 ? 'medium' : level === 6 ? 'tan' : level <= 8 ? 'deep' : 'veryDeep'
}

/** Lab of a Monk orb — used when the customer corrects her level by tapping an orb. */
export function monkLab(level) {
  return (MONK_LAB.find((m) => m.level === level) || MONK_LAB[4]).lab
}

/**
 * Auto white reference: a bright, near-neutral, NOT clipped surface in the frame (white table, tissue, wall).
 * Conservative: needs ≥ 0.6% of pixels; cream/colored surfaces are rejected by the chroma limit.
 * Returns linear [r,g,b] or null.
 */
export function findAutoWhite(img) {
  const { data, width, height } = img
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 40000)))
  const cands = []
  let total = 0
  for (let y = 0; y < height; y += step)
    for (let x = 0; x < width; x += step) {
      total++
      const o = (y * width + x) * 4
      const r8 = data[o]
      const g8 = data[o + 1]
      const b8 = data[o + 2]
      if (r8 > 250 || g8 > 250 || b8 > 250) continue // clipped = unknown true color
      const mx = Math.max(r8, g8, b8)
      if (mx < 170) continue
      const lab = linearToLab(lin8(r8), lin8(g8), lin8(b8))
      if (lab[0] < 75 || Math.hypot(lab[1], lab[2]) > 7) continue
      cands.push([lin8(r8), lin8(g8), lin8(b8), lab[0]])
    }
  if (cands.length < total * 0.006) return null
  cands.sort((p, q) => q[3] - p[3])
  const top = cands.slice(0, Math.max(10, Math.floor(cands.length * 0.25)))
  const avg = [0, 1, 2].map((i) => top.reduce((acc, p) => acc + p[i], 0) / top.length)
  return avg
}

/** Average linear RGB in a small disc — used for tap-to-calibrate on a white tissue / paper. */
export function sampleWhite(img, x, y, radius = 6) {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue
      const xi = (x + dx) | 0
      const yi = (y + dy) | 0
      if (xi < 0 || yi < 0 || xi >= img.width || yi >= img.height) continue
      const o = (yi * img.width + xi) * 4
      r += lin8(img.data[o])
      g += lin8(img.data[o + 1])
      b += lin8(img.data[o + 2])
      n++
    }
  if (!n) return null
  const out = [r / n, g / n, b / n]
  const lum = 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2]
  const chroma = Math.max(...out) - Math.min(...out)
  // a real white reference is bright and near-neutral; refuse saturated picks
  if (lum < 0.18 || chroma / Math.max(...out) > 0.35) return { ok: false, rgb: out }
  return { ok: true, rgb: out, lum }
}
