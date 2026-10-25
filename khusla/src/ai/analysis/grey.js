// Grey % (PRD 5.6): hair pixels with chroma C* < 8 and L* more than 15 above the natural root level,
// measured in the first 4 cm from the root. Interior hair only (no edge pixels blended with the
// background) and no specular shine (shine is bright and achromatic too, but local: > Lbar + 2 sigma).
import { boxMean } from './imageOps.js';

// absolute floor: grey and white strands read L* 45+ even on dark hair (shine on black hair stays below)
export const GREY_MIN_L = 45;

export function greyPercent(lab, alpha, distPx, n, { naturalL, mmPerPx, width, height }) {
  const limitPx = mmPerPx ? 40 / mmPerPx : Infinity;
  const w = width;
  const h = height || n / w;
  const r = Math.max(3, Math.round(Math.min(w, h) * 0.008));
  const Lbar = boxMean(lab.L, w, h, r);
  const L2 = new Float32Array(n);
  for (let i = 0; i < n; i += 1) L2[i] = lab.L[i] * lab.L[i];
  const L2bar = boxMean(L2, w, h, r);
  const e = Math.max(2, Math.round(r / 2)); // erosion offset
  const threshold = Math.max(naturalL + 15, GREY_MIN_L);
  let total = 0;
  let grey = 0;
  for (let i = 0; i < n; i += 1) {
    if (alpha[i] < 0.9 || distPx[i] < 0 || distPx[i] > limitPx) continue;
    const x = i % w;
    const y = (i / w) | 0;
    if (x < e || y < e || x >= w - e || y >= h - e) continue;
    if (alpha[i - e] < 0.8 || alpha[i + e] < 0.8 || alpha[i - e * w] < 0.8 || alpha[i + e * w] < 0.8) continue;
    total += 1;
    const L = lab.L[i];
    if (L <= threshold) continue;
    const C = Math.hypot(lab.A[i], lab.B[i]);
    if (C >= 8) continue;
    const sigma = Math.sqrt(Math.max(0, L2bar[i] - Lbar[i] * Lbar[i]));
    const shine = L > Lbar[i] + 2 * sigma && Lbar[i] < threshold;
    if (!shine) grey += 1;
  }
  if (total < 50) return { pct: 0, confidence: 0.3 };
  return { pct: Math.round((grey / total) * 100), confidence: Math.min(0.85, 0.5 + total / 40000) };
}
