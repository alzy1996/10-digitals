// Small, allocation-aware image helpers shared by the analysis modules. Pure JS, no DOM.
import { srgbToLinear } from './color.js';

// sRGB byte -> linear LUT
export const LIN = new Float32Array(256);
for (let i = 0; i < 256; i += 1) LIN[i] = srgbToLinear(i / 255);

const Xn = 0.95047;
const Zn = 1.08883;
const EPS = 216 / 24389;
const KAPPA = 24389 / 27;
const fLab = (t) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);

/** Per-pixel CIELAB of an RGBA image (D65). Returns {L, A, B} Float32Arrays. */
export function imageToLab(img) {
  const n = img.width * img.height;
  const L = new Float32Array(n);
  const A = new Float32Array(n);
  const B = new Float32Array(n);
  const d = img.data;
  for (let i = 0, p = 0; i < n; i += 1, p += 4) {
    const r = LIN[d[p]];
    const g = LIN[d[p + 1]];
    const b = LIN[d[p + 2]];
    const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / Xn;
    const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
    const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / Zn;
    const fx = fLab(x);
    const fy = fLab(y);
    const fz = fLab(z);
    L[i] = 116 * fy - 16;
    A[i] = 500 * (fx - fy);
    B[i] = 200 * (fy - fz);
  }
  return { L, A, B };
}

export function gray(img) {
  const n = img.width * img.height;
  const out = new Float32Array(n);
  const d = img.data;
  for (let i = 0, p = 0; i < n; i += 1, p += 4) out[i] = (0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]) / 255;
  return out;
}

/** Box mean with radius r (window 2r+1) using an integral image. */
export function boxMean(src, w, h, r) {
  const W = w + 1;
  const integral = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y += 1) {
    let row = 0;
    for (let x = 0; x < w; x += 1) {
      row += src[y * w + x];
      integral[(y + 1) * W + x + 1] = integral[y * W + x + 1] + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r) + 1;
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r) + 1;
      const s = integral[y1 * W + x1] - integral[y0 * W + x1] - integral[y1 * W + x0] + integral[y0 * W + x0];
      out[y * w + x] = s / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

/** Guided filter (He et al.) to refine a coarse alpha p using guide I (both Float32, same size). */
export function guidedFilter(I, p, w, h, r = 8, eps = 1e-3) {
  const n = w * h;
  const II = new Float32Array(n);
  const Ip = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    II[i] = I[i] * I[i];
    Ip[i] = I[i] * p[i];
  }
  const mI = boxMean(I, w, h, r);
  const mp = boxMean(p, w, h, r);
  const mII = boxMean(II, w, h, r);
  const mIp = boxMean(Ip, w, h, r);
  const a = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const varI = mII[i] - mI[i] * mI[i];
    const cov = mIp[i] - mI[i] * mp[i];
    a[i] = cov / (varI + eps);
    b[i] = mp[i] - a[i] * mI[i];
  }
  const ma = boxMean(a, w, h, r);
  const mb = boxMean(b, w, h, r);
  const q = new Float32Array(n);
  for (let i = 0; i < n; i += 1) q[i] = Math.min(1, Math.max(0, ma[i] * I[i] + mb[i]));
  return q;
}

/** Bilinear resample of a single-channel Float32 map. */
export function resample(src, sw, sh, dw, dh) {
  if (sw === dw && sh === dh) return Float32Array.from(src);
  const out = new Float32Array(dw * dh);
  const sx = sw / dw;
  const sy = sh / dh;
  for (let y = 0; y < dh; y += 1) {
    const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < dw; x += 1) {
      const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = fx - x0;
      const a = src[y0 * sw + x0] * (1 - tx) + src[y0 * sw + x1] * tx;
      const b = src[y1 * sw + x0] * (1 - tx) + src[y1 * sw + x1] * tx;
      out[y * dw + x] = a * (1 - ty) + b * ty;
    }
  }
  return out;
}

/** Nearest-neighbour resample of a Uint8 label map. */
export function resampleLabels(src, sw, sh, dw, dh) {
  if (sw === dw && sh === dh) return Uint8Array.from(src);
  const out = new Uint8Array(dw * dh);
  for (let y = 0; y < dh; y += 1) {
    const sy = Math.min(sh - 1, Math.floor(((y + 0.5) * sh) / dh));
    for (let x = 0; x < dw; x += 1) {
      const sx = Math.min(sw - 1, Math.floor(((x + 0.5) * sw) / dw));
      out[y * dw + x] = src[sy * sw + sx];
    }
  }
  return out;
}

/** Downscale a Float32 map by an integer factor (area average). */
export function downscale(src, w, h, k) {
  const dw = Math.max(1, Math.floor(w / k));
  const dh = Math.max(1, Math.floor(h / k));
  const out = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y += 1) {
    for (let x = 0; x < dw; x += 1) {
      let s = 0;
      for (let j = 0; j < k; j += 1) for (let i = 0; i < k; i += 1) s += src[(y * k + j) * w + x * k + i];
      out[y * dw + x] = s / (k * k);
    }
  }
  return { data: out, width: dw, height: dh };
}

export function quantile(values, q) {
  if (!values.length) return NaN;
  const s = Float32Array.from(values).sort();
  const idx = Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))));
  return s[idx];
}

export function lmPx(landmarks, w, h) {
  return landmarks.map((p) => [p.x * w, p.y * h, (p.z || 0) * w]);
}

export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
