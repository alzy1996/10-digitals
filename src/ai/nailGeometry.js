// ISOLATED AI MODULE — turns 21 hand landmarks into 5 oriented nail ellipses per hand,
// then "Smart Fit" refines width / centering / free-edge from the real pixels around each finger.
import { rgb8ToLab, deltaE2000, median, clamp } from '../lib/color'
import { OneEuroBundle } from './oneEuro'

export const FINGER_CHAINS = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
}
export const FINGER_KEYS = ['thumb', 'index', 'middle', 'ring', 'pinky']

// Where the nail plate sits on the distal segment (DIP→TIP), as fractions of that segment.
// Tuned on salon-style photos (hand flat, back of hand to camera).
const PLATE = {
  thumb: { start: 0.38, end: 1.08, widthOfSpacing: 0.86 },
  index: { start: 0.44, end: 1.06, widthOfSpacing: 0.66 },
  middle: { start: 0.44, end: 1.06, widthOfSpacing: 0.68 },
  ring: { start: 0.44, end: 1.06, widthOfSpacing: 0.64 },
  pinky: { start: 0.46, end: 1.07, widthOfSpacing: 0.6 },
}

function px(lm, i, W, H) {
  const p = lm[i]
  return { x: p.x * W, y: p.y * H, z: p.z * W }
}
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) })
const len2 = (v) => Math.hypot(v.x, v.y)
const lerpP = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

/**
 * Is the BACK of the hand (nail side) facing the camera?
 * Uses the palm normal sign and handedness. Verified on MediaPipe's own test photos: for raw
 * (non-mirrored) frames the label matches the real hand ("Right" = right hand).
 * Right hand with its back to the camera → palm normal z > 0 (image coords: x right, y down).
 * Returns a score in [-1, 1]: > 0 means nails visible.
 */
export function dorsalScore(lm, handedness, W, H, mirrored = false) {
  if (handedness !== 'Left' && handedness !== 'Right') return 1 // unknown → assume nails visible
  const p0 = px(lm, 0, W, H)
  const a = sub(px(lm, 5, W, H), p0)
  const b = sub(px(lm, 17, W, H), p0)
  const nx = a.y * b.z - a.z * b.y
  const ny = a.z * b.x - a.x * b.z
  const nz = a.x * b.y - a.y * b.x
  const n = Math.hypot(nx, ny, nz) || 1
  let realRight = handedness === 'Right'
  if (mirrored) realRight = !realRight
  return (realRight ? 1 : -1) * (nz / n)
}

export function fingerSpacing(lm, W, H) {
  const d = (i, j) => len2(sub(px(lm, i, W, H), px(lm, j, W, H)))
  const s59 = d(5, 9)
  const s913 = d(9, 13)
  const s1317 = d(13, 17)
  return {
    index: s59,
    middle: (s59 + s913) / 2,
    ring: (s913 + s1317) / 2,
    pinky: s1317 * 0.92,
    thumb: s59 * 1.18,
  }
}

const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Landmark-only nail estimate for one hand.
 * Returns [{key, finger, cx, cy, ux, uy, len, wid, alpha, side}]
 */
export function estimateNails(hand, W, H, opts = {}) {
  const { landmarks: lm, handedness } = hand
  const forceVisible = !!opts.forceVisible
  const side = dorsalScore(lm, handedness, W, H, !!opts.mirrored)
  const spacing = fingerSpacing(lm, W, H)
  const nails = []
  for (const finger of FINGER_KEYS) {
    const chain = FINGER_CHAINS[finger]
    const D = px(lm, chain[2], W, H)
    const T = px(lm, chain[3], W, H)
    const seg = sub(T, D)
    const L = len2(seg)
    if (L < 3) continue
    const ux = seg.x / L
    const uy = seg.y / L
    const cal = opts.calib && opts.calib[finger]
    const P = cal ? { ...PLATE[finger], ...cal } : PLATE[finger]
    const start = { x: D.x + ux * L * P.start, y: D.y + uy * L * P.start }
    const end = { x: D.x + ux * L * P.end, y: D.y + uy * L * P.end }
    const len = Math.hypot(end.x - start.x, end.y - start.y)
    let wid = spacing[finger] * P.widthOfSpacing
    // when a finger points at the camera the plate looks shorter; keep width sane relative to length
    wid = clamp(wid, len * 0.45, len * 1.45)
    if (finger === 'thumb' && !cal) wid *= 1 - 0.3 * clamp(side, 0, 1) // thumb is seen side-on on a flat hand
    let alpha
    if (forceVisible) alpha = 1
    else if (finger === 'thumb') alpha = smoothstep(-0.55, -0.1, side)
    else alpha = smoothstep(-0.12, 0.22, side)
    nails.push({
      key: (opts.handKey || 'h0') + ':' + finger,
      finger,
      cx: (start.x + end.x) / 2,
      cy: (start.y + end.y) / 2,
      ux,
      uy,
      len,
      wid,
      alpha,
      side,
    })
  }
  return nails
}

// ---------------------------------------------------------------- Smart Fit (pixel refinement)

function sampleRGB(img, x, y) {
  const xi = x | 0
  const yi = y | 0
  if (xi < 0 || yi < 0 || xi >= img.width || yi >= img.height) return null
  const o = (yi * img.width + xi) * 4
  return [img.data[o], img.data[o + 1], img.data[o + 2]]
}

function sampleLab(img, x, y) {
  const c = sampleRGB(img, x, y)
  return c ? rgb8ToLab(c[0], c[1], c[2]) : null
}

function medianLab(list) {
  if (!list.length) return null
  return [median(list.map((l) => l[0])), median(list.map((l) => l[1])), median(list.map((l) => l[2]))]
}

/**
 * Refines one nail using the pixels of a (downscaled) frame.
 * img: ImageData of the frame scaled by `scale` (img px = full px * scale)
 * lm: landmarks of that hand (normalized), W/H: full frame size.
 */
export function refineNail(nail, img, lm, W, H, scale) {
  const chain = FINGER_CHAINS[nail.finger]
  const s = scale
  // --- skin reference: middle phalanx (PIP→DIP), dorsal side
  const Pp = px(lm, chain[1], W, H)
  const D = px(lm, chain[2], W, H)
  const skin = []
  for (let t = 0.25; t <= 0.75; t += 0.1) {
    const p = lerpP(Pp, D, t)
    const l = sampleLab(img, p.x * s, p.y * s)
    if (l) skin.push(l)
  }
  const skinLab = medianLab(skin)
  if (!skinLab) return nail
  // --- nail reference: center of plate
  const nailRef = []
  for (let k = -1; k <= 1; k++) {
    const l = sampleLab(img, (nail.cx + nail.ux * nail.len * 0.15 * k) * s, (nail.cy + nail.uy * nail.len * 0.15 * k) * s)
    if (l) nailRef.push(l)
  }
  const nailLab = medianLab(nailRef) || skinLab

  // --- background reference: well outside the finger, both sides near the tip
  const vx = -nail.uy
  const vy = nail.ux
  const isFinger = (x, y) => {
    const l = sampleLab(img, x * s, y * s)
    if (!l) return false
    return deltaE2000(l, skinLab) < 14 || deltaE2000(l, nailLab) < 12
  }

  // --- width + lateral centering at 3 levels along the plate
  const maxReach = nail.wid * 1.25
  const step = Math.max(1 / s, nail.wid / 28)
  const widths = []
  const offsets = []
  for (const tl of [-0.2, 0.0, 0.2]) {
    const bx = nail.cx + nail.ux * nail.len * tl
    const by = nail.cy + nail.uy * nail.len * tl
    const edge = (dir) => {
      let misses = 0
      for (let r = step; r <= maxReach; r += step) {
        if (!isFinger(bx + vx * r * dir, by + vy * r * dir)) {
          if (++misses >= 2) return r - step * 1.5
        } else misses = 0
      }
      return null // ran out: background too similar to skin
    }
    const left = edge(-1)
    const right = edge(1)
    if (left !== null && right !== null && left > step && right > step) {
      widths.push(left + right)
      offsets.push((right - left) / 2)
    }
  }
  const out = { ...nail, fit: 0 }
  if (widths.length >= 2) {
    const fingerW = median(widths)
    const measured = fingerW * (nail.finger === 'thumb' ? 0.84 : 0.8)
    const blended = clamp(measured, nail.wid * 0.7, nail.wid * 1.4) * 0.7 + nail.wid * 0.3
    const off = clamp(median(offsets), -nail.wid * 0.25, nail.wid * 0.25)
    out.wid = blended
    out.cx = nail.cx + vx * off
    out.cy = nail.cy + vy * off
    out.fit += 0.5
  }

  // --- free edge: walk along the axis past the landmark tip until we leave the finger/nail
  const tipX = out.cx + nail.ux * nail.len * 0.5
  const tipY = out.cy + nail.uy * nail.len * 0.5
  let lastIn = 0
  let misses = 0
  const tipStep = Math.max(1 / s, nail.len / 30)
  const back = -nail.len * 0.2
  const fwd = nail.len * 0.9
  for (let r = back; r <= fwd; r += tipStep) {
    if (isFinger(tipX + nail.ux * r, tipY + nail.uy * r)) {
      lastIn = r
      misses = 0
    } else if (r > 0 && ++misses >= 2) break
  }
  if (misses >= 2) {
    const ext = clamp(lastIn, back, fwd * 0.85)
    const newLen = nail.len + ext
    out.cx += nail.ux * ext * 0.5
    out.cy += nail.uy * ext * 0.5
    out.len = newLen
    out.fit += 0.5
  }
  out.skinLab = skinLab
  // bare-nail light level (linear luminance) → the polish follows the photo's exposure
  const fy = (nailLab[0] + 16) / 116
  out.nailL = nailLab[0] > 8 ? fy * fy * fy : nailLab[0] / 903.3
  out.nailLab = nailLab
  return out
}

// ---------------------------------------------------------------- Temporal tracker

/** Keeps nails stable across frames (One-Euro per nail) and fades nails that disappear. */
export class NailTracker {
  constructor() {
    this.filters = new Map()
    this.last = new Map()
  }

  reset() {
    this.filters.clear()
    this.last.clear()
  }

  update(nails, tMs) {
    const out = []
    const seen = new Set()
    for (const n of nails) {
      seen.add(n.key)
      let f = this.filters.get(n.key)
      if (!f || tMs - f.lastSeen > 400) {
        f = new OneEuroBundle(['cx', 'cy', 'ux', 'uy', 'len', 'wid', 'alpha'], 1.4, 0.015)
        this.filters.set(n.key, f)
      }
      const sm = f.filter(n, tMs)
      const ul = Math.hypot(sm.ux, sm.uy) || 1
      sm.ux /= ul
      sm.uy /= ul
      this.last.set(n.key, { ...sm, t: tMs })
      out.push(sm)
    }
    // short fade-out for nails lost this frame (prevents flicker on a missed detection)
    for (const [key, n] of this.last) {
      if (seen.has(key)) continue
      const age = tMs - n.t
      if (age > 180) {
        this.last.delete(key)
        continue
      }
      out.push({ ...n, alpha: n.alpha * (1 - age / 180) })
    }
    return out
  }
}

/** Stable key per hand across frames: handedness label + left-to-right order. */
export function handKeys(hands) {
  const counts = {}
  return hands.map((h) => {
    const base = h.handedness || 'U'
    counts[base] = (counts[base] || 0) + 1
    return base + (counts[base] > 1 ? counts[base] : '')
  })
}
