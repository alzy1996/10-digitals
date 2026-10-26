// Color science, no model: sRGB <-> linear RGB <-> XYZ (D65) <-> CIELAB, and CIEDE2000.
// Pure functions, shared by analysis (skin, beard color) and rendering (dyes, henna).

const D65 = [0.95047, 1.0, 1.08883];
const EPS = 216 / 24389; // (6/29)^3
const KAPPA = 24389 / 27;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 0..255 sRGB channel -> 0..1 linear. */
export function srgbToLinear(c255) {
  const c = c255 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** 0..1 linear -> 0..255 sRGB channel (not rounded, not clamped). */
export function linearToSrgb(lin) {
  const c = lin <= 0.0031308 ? 12.92 * lin : 1.055 * lin ** (1 / 2.4) - 0.055;
  return c * 255;
}

export function linearRgbToXyz([r, g, b]) {
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  ];
}

export function xyzToLinearRgb([x, y, z]) {
  return [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ];
}

function f(t) {
  return t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
}

function finv(t) {
  const t3 = t * t * t;
  return t3 > EPS ? t3 : (116 * t - 16) / KAPPA;
}

export function xyzToLab([x, y, z]) {
  const fx = f(x / D65[0]);
  const fy = f(y / D65[1]);
  const fz = f(z / D65[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToXyz([L, a, b]) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  return [finv(fx) * D65[0], (L > KAPPA * EPS ? fy ** 3 : L / KAPPA) * D65[1], finv(fz) * D65[2]];
}

/** [r,g,b] 0..255 sRGB -> [L,a,b]. */
export function rgbToLab([r, g, b]) {
  return xyzToLab(linearRgbToXyz([srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)]));
}

/** [r,g,b] 0..1 linear (for example after white-balance gains) -> [L,a,b]. */
export function linearRgbToLab(lin) {
  return xyzToLab(linearRgbToXyz(lin));
}

/** [L,a,b] -> [r,g,b] 0..255 sRGB, rounded and clamped to gamut. */
export function labToRgb(lab) {
  const lin = xyzToLinearRgb(labToXyz(lab));
  return lin.map((c) => Math.round(clamp(linearToSrgb(clamp(c, 0, 1)), 0, 255)));
}

/** [L,a,b] -> [r,g,b] 0..1 linear, clamped. */
export function labToLinearRgb(lab) {
  return xyzToLinearRgb(labToXyz(lab)).map((c) => clamp(c, 0, 1));
}

export function hexToRgb(hex) {
  const h = String(hex).replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}

export function hexToLab(hex) {
  return rgbToLab(hexToRgb(hex));
}

export function labToHex(lab) {
  return rgbToHex(labToRgb(lab));
}

/** Chroma and hue angle (degrees 0..360) of a Lab color. */
export function labToLch([L, a, b]) {
  const C = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return [L, C, h];
}

export function lchToLab([L, C, h]) {
  const r = (h * Math.PI) / 180;
  return [L, C * Math.cos(r), C * Math.sin(r)];
}

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const POW25_7 = 25 ** 7;

/** CIEDE2000 color difference (Sharma, Wu, Dalal 2005). */
export function deltaE2000(lab1, lab2, kL = 1, kC = 1, kH = 1) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const Cbar7 = Cbar ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + POW25_7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hp = (b, ap) => {
    if (b === 0 && ap === 0) return 0;
    const h = deg(Math.atan2(b, ap));
    return h < 0 ? h + 360 : h;
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
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbarp;
  if (C1p * C2p === 0) hbarp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
  else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
  else hbarp = (h1p + h2p - 360) / 2;

  const T =
    1 -
    0.17 * Math.cos(rad(hbarp - 30)) +
    0.24 * Math.cos(rad(2 * hbarp)) +
    0.32 * Math.cos(rad(3 * hbarp + 6)) -
    0.2 * Math.cos(rad(4 * hbarp - 63));
  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Cbarp7 = Cbarp ** 7;
  const Rc = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + POW25_7));
  const Sl = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;

  const tL = dLp / (kL * Sl);
  const tC = dCp / (kC * Sc);
  const tH = dHp / (kH * Sh);
  return Math.sqrt(tL * tL + tC * tC + tH * tH + Rt * tC * tH);
}

/** Median of a numeric array (copy-sorted). */
export function median(values) {
  if (!values.length) return NaN;
  const s = Float64Array.from(values).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
