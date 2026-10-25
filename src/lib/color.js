// Color science helpers: sRGB <-> linear <-> XYZ (D65) <-> CIELAB, ΔE2000, ITA°, hue analysis.
// Everything the AI and the renderer agree on lives here so the numbers are consistent.

export function clamp(v, lo = 0, hi = 1) {
  return v < lo ? lo : v > hi ? hi : v
}

export function isHex(hex) {
  return typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex)
}

export function normalizeHex(input) {
  if (typeof input !== 'string') return null
  let h = input.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map((c) => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return '#' + h.toUpperCase()
}

export function hexToRgb(hex) {
  const h = normalizeHex(hex) || '#000000'
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex(r, g, b) {
  const to = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')
  return ('#' + to(r) + to(g) + to(b)).toUpperCase()
}

export function srgbToLinear(c8) {
  const c = c8 / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function linearToSrgb(l) {
  const c = l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055
  return clamp(c, 0, 1) * 255
}

// Precomputed LUT: 8-bit sRGB -> linear (hot path in skin/nail sampling)
const LIN_LUT = new Float32Array(256)
for (let i = 0; i < 256; i++) LIN_LUT[i] = srgbToLinear(i)
export function lin8(c8) {
  return LIN_LUT[c8 | 0]
}

export function hexToLinear(hex) {
  const [r, g, b] = hexToRgb(hex)
  return [lin8(r), lin8(g), lin8(b)]
}

export function luminanceLinear(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const Xn = 0.95047
const Yn = 1.0
const Zn = 1.08883
function fLab(t) {
  return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116
}

/** linear RGB (0..1) -> CIELAB (D65) */
export function linearToLab(r, g, b) {
  const X = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b
  const Z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b
  const fx = fLab(X / Xn)
  const fy = fLab(Y / Yn)
  const fz = fLab(Z / Zn)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

export function rgb8ToLab(r, g, b) {
  return linearToLab(lin8(r), lin8(g), lin8(b))
}

export function hexToLab(hex) {
  const [r, g, b] = hexToRgb(hex)
  return rgb8ToLab(r, g, b)
}

export function labToLch([L, a, b]) {
  const C = Math.sqrt(a * a + b * b)
  let h = (Math.atan2(b, a) * 180) / Math.PI
  if (h < 0) h += 360
  return [L, C, h]
}

/** CIEDE2000 color difference. ΔE < 1 ≈ invisible, < 2 ≈ only experts notice, < 3.5 ≈ close match. */
export function deltaE2000(lab1, lab2) {
  const [L1, a1, b1] = lab1
  const [L2, a2, b2] = lab2
  const rad = Math.PI / 180
  const C1 = Math.hypot(a1, b1)
  const C2 = Math.hypot(a2, b2)
  const Cm = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cm, 7) / (Math.pow(Cm, 7) + Math.pow(25, 7))))
  const a1p = (1 + G) * a1
  const a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1)
  const C2p = Math.hypot(a2p, b2)
  const h = (bb, ap) => {
    if (bb === 0 && ap === 0) return 0
    const v = Math.atan2(bb, ap) / rad
    return v < 0 ? v + 360 : v
  }
  const h1p = h(b1, a1p)
  const h2p = h(b2, a2p)
  const dLp = L2 - L1
  const dCp = C2p - C1p
  let dhp = 0
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p
    if (dhp > 180) dhp -= 360
    else if (dhp < -180) dhp += 360
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad)
  const Lpm = (L1 + L2) / 2
  const Cpm = (C1p + C2p) / 2
  let hpm = h1p + h2p
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hpm = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2
    else hpm = (h1p + h2p) / 2
  }
  const T =
    1 -
    0.17 * Math.cos((hpm - 30) * rad) +
    0.24 * Math.cos(2 * hpm * rad) +
    0.32 * Math.cos((3 * hpm + 6) * rad) -
    0.2 * Math.cos((4 * hpm - 63) * rad)
  const dTheta = 30 * Math.exp(-Math.pow((hpm - 275) / 25, 2))
  const Rc = 2 * Math.sqrt(Math.pow(Cpm, 7) / (Math.pow(Cpm, 7) + Math.pow(25, 7)))
  const Sl = 1 + (0.015 * Math.pow(Lpm - 50, 2)) / Math.sqrt(20 + Math.pow(Lpm - 50, 2))
  const Sc = 1 + 0.045 * Cpm
  const Sh = 1 + 0.015 * Cpm * T
  const Rt = -Math.sin(2 * dTheta * rad) * Rc
  return Math.sqrt(
    Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2) + Rt * (dCp / Sc) * (dHp / Sh),
  )
}

/** Individual Typology Angle (Chardon 1991): ITA° = atan((L* − 50) / b*) in degrees */
export function itaDegrees(L, b) {
  return (Math.atan2(L - 50, Math.max(b, 0.0001)) * 180) / Math.PI
}

export function hexToHsl(hex) {
  const [r8, g8, b8] = hexToRgb(hex)
  const r = r8 / 255
  const g = g8 / 255
  const b = b8 / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return [h, s, l]
}

/** Classify a POLISH color's own temperature (warm / cool / neutral) from its LCh hue. */
export function polishTemperature(hex) {
  const [L, C, h] = labToLch(hexToLab(hex))
  if (C < 8) return 'neutral' // greys, whites, blacks, very muted nudes
  // warm: orange/yellow/coral/brick (h ≈ 30°–110°); cool: blue/violet/fuchsia/blue-red (h > 200° or < 15°)
  if (h >= 30 && h <= 110) return 'warm'
  if (h > 110 && h < 200) return C < 20 ? 'neutral' : 'cool' // greens/teals read cool except muted olives
  if (h >= 200 || h < 15) return 'cool'
  return L > 70 ? 'neutral' : 'warm' // 15°–30°: true reds / rose nudes sit in the middle
}

/** Readable text color on top of a swatch */
export function textOn(hex) {
  const [L] = hexToLab(hex)
  return L > 62 ? '#1D1A18' : '#FFFFFF'
}

/** Mix two hex colors in linear light (t = 0 → a, 1 → b) */
export function mixHex(a, b, t) {
  const A = hexToLinear(a)
  const B = hexToLinear(b)
  const m = A.map((v, i) => v + (B[i] - v) * t)
  return rgbToHex(linearToSrgb(m[0]), linearToSrgb(m[1]), linearToSrgb(m[2]))
}

/** Scale a color's light intensity in linear space (factor < 1 darker, > 1 lighter) — swatch shading. */
export function shadeHex(hex, factor) {
  const [r, g, b] = hexToLinear(hex)
  const f = Math.max(0, factor)
  return rgbToHex(linearToSrgb(r * f), linearToSrgb(g * f), linearToSrgb(b * f))
}

/** Robust statistic helpers */
export function median(arr) {
  if (!arr.length) return NaN
  const s = Float64Array.from(arr).sort()
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function percentile(arr, p) {
  if (!arr.length) return NaN
  const s = Float64Array.from(arr).sort()
  const idx = clamp(Math.round((s.length - 1) * p), 0, s.length - 1)
  return s[idx]
}
