// Color science: sRGB <-> linear <-> XYZ (D65) <-> CIELAB, CIEDE2000, ITA, Monk Skin Tone.
// Pure functions, no DOM. Used by analysis, the renderer, Swatch Scan and the reports.

export const D65 = [0.95047, 1.0, 1.08883];
const EPS = 216 / 24389;
const KAPPA = 24389 / 27;

export const RGB2XYZ = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
];
export const XYZ2RGB = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252],
];

export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
export function linearToSrgb(c) {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, v));
}

export function mul3(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}
export function matMul(a, b) {
  const r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) for (let k = 0; k < 3; k += 1) r[i][j] += a[i][k] * b[k][j];
  return r;
}
export function inv3(m) {
  const [a, b, c] = m[0];
  const [d, e, f] = m[1];
  const [g, h, i] = m[2];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}

const f = (t) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
const finv = (t) => (t ** 3 > EPS ? t ** 3 : (116 * t - 16) / KAPPA);

export function xyzToLab([x, y, z], white = D65) {
  const fx = f(x / white[0]);
  const fy = f(y / white[1]);
  const fz = f(z / white[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export function labToXyz([L, a, b], white = D65) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const yr = L > KAPPA * EPS ? fy ** 3 : L / KAPPA;
  return [finv(fx) * white[0], yr * white[1], finv(fz) * white[2]];
}

/** rgb in 0..255 (sRGB) -> Lab */
export function rgbToLab([r, g, b]) {
  const lin = [srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)];
  return xyzToLab(mul3(RGB2XYZ, lin));
}
/** linear rgb 0..1 -> Lab */
export function linearToLab(lin) {
  return xyzToLab(mul3(RGB2XYZ, lin));
}
export function labToLinear(lab) {
  return mul3(XYZ2RGB, labToXyz(lab));
}
/** Lab -> sRGB 0..255 (clamped) */
export function labToRgb(lab) {
  return labToLinear(lab).map((c) => Math.round(linearToSrgb(c) * 255));
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}
export const hexToLab = (hex) => rgbToLab(hexToRgb(hex));
export const labToHex = (lab) => rgbToHex(labToRgb(lab));

export function chroma([, a, b]) {
  return Math.hypot(a, b);
}
export function hueDeg([, a, b]) {
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return h < 0 ? h + 360 : h;
}

/** CIEDE2000 (Sharma, Wu, Dalal 2005), kL = kC = kH = 1. */
export function deltaE2000(lab1, lab2) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const Cbar7 = Cbar ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hp = (b, ap) => {
    if (b === 0 && ap === 0) return 0;
    const h = Math.atan2(b, ap) / rad;
    return h >= 0 ? h : h + 360;
  };
  const h1p = hp(b1, a1p);
  const h2p = hp(b2, a2p);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbarp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
    else hbarp = (h1p + h2p - 360) / 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hbarp - 30) * rad) +
    0.24 * Math.cos(2 * hbarp * rad) +
    0.32 * Math.cos((3 * hbarp + 6) * rad) -
    0.2 * Math.cos((4 * hbarp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Cbarp7 = Cbarp ** 7;
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT = -Math.sin(2 * dTheta * rad) * RC;
  return Math.sqrt(
    (dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH),
  );
}

/** Individual Typology Angle in degrees. */
export function ita([L, , b]) {
  return (Math.atan2(L - 50, b) * 180) / Math.PI;
}
export function itaBand(angle) {
  if (angle > 55) return 'very-light';
  if (angle > 41) return 'light';
  if (angle > 28) return 'intermediate';
  if (angle > 10) return 'tan';
  if (angle > -30) return 'brown';
  return 'dark';
}

// Monk Skin Tone scale (Google, CC BY 4.0), MST 1..10.
export const MST_HEX = ['#f6ede4', '#f3e7db', '#f7ead0', '#eadaba', '#d7bd96', '#a07e56', '#825c43', '#604134', '#3a312a', '#292420'];
const MST_LAB = MST_HEX.map(hexToLab);
export function nearestMst(lab) {
  let best = 0;
  let bestD = Infinity;
  MST_LAB.forEach((m, i) => {
    const d = deltaE2000(lab, m);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return { mst: best + 1, deltaE: bestD };
}

/** Undertone from hue angle (PRD 5.5, starting thresholds). */
export function undertone(lab) {
  const [, a, b] = lab;
  const h = hueDeg(lab);
  if (a < 9 && b > 14 && h > 58) return 'olive';
  if (h > 62) return 'warm';
  if (h < 52) return 'cool';
  return 'neutral';
}

export function median(arr) {
  if (!arr.length) return NaN;
  const s = Float64Array.from(arr).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function medianLab(labs) {
  return [median(labs.map((x) => x[0])), median(labs.map((x) => x[1])), median(labs.map((x) => x[2]))];
}

export function meanLab(labs) {
  const s = [0, 0, 0];
  for (const l of labs) {
    s[0] += l[0];
    s[1] += l[1];
    s[2] += l[2];
  }
  const n = labs.length || 1;
  return [s[0] / n, s[1] / n, s[2] / n];
}

/** Keep values between the given lower/upper quantiles of key(x). */
export function trimByQuantile(items, key, lowQ, highQ) {
  if (items.length < 5) return items;
  const sorted = [...items].sort((p, q) => key(p) - key(q));
  const lo = Math.floor(sorted.length * lowQ);
  const hi = Math.ceil(sorted.length * (1 - highQ));
  return sorted.slice(lo, Math.max(lo + 1, hi));
}
