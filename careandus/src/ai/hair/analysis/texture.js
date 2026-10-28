// Texture (orientation coherence + silhouette waviness) and density (scalp near the part). PRD 5.6.
import { boxMean } from './imageOps.js';

/**
 * Structure tensor on L* (Sobel), smoothed; returns per-pixel orientation (strand direction, radians)
 * and coherence 0..1. Run on a working-resolution L map.
 */
export function structureTensor(L, w, h, radius = 4) {
  const n = w * h;
  const Jxx = new Float32Array(n);
  const Jyy = new Float32Array(n);
  const Jxy = new Float32Array(n);
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const gx =
        L[i - w + 1] + 2 * L[i + 1] + L[i + w + 1] - L[i - w - 1] - 2 * L[i - 1] - L[i + w - 1];
      const gy =
        L[i + w - 1] + 2 * L[i + w] + L[i + w + 1] - L[i - w - 1] - 2 * L[i - w] - L[i - w + 1];
      Jxx[i] = gx * gx;
      Jyy[i] = gy * gy;
      Jxy[i] = gx * gy;
    }
  }
  const sxx = boxMean(Jxx, w, h, radius);
  const syy = boxMean(Jyy, w, h, radius);
  const sxy = boxMean(Jxy, w, h, radius);
  const angle = new Float32Array(n);
  const coherence = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const a = sxx[i];
    const b = syy[i];
    const c = sxy[i];
    const tr = a + b;
    const diff = Math.sqrt((a - b) * (a - b) + 4 * c * c);
    coherence[i] = tr > 1e-6 ? diff / tr : 0;
    // gradient direction; strands run perpendicular to it
    angle[i] = 0.5 * Math.atan2(2 * c, a - b) + Math.PI / 2;
  }
  return { angle, coherence };
}

/** Waviness of the left and right outer hair edges below the ears, normalized by face width. */
export function silhouetteWaviness(alpha, w, h, { fromY, toY, faceW }) {
  const left = [];
  const right = [];
  for (let y = Math.max(0, Math.round(fromY)); y < Math.min(h, Math.round(toY)); y += 1) {
    let l = -1;
    let r = -1;
    for (let x = 0; x < w; x += 1) if (alpha[y * w + x] > 0.5) { l = x; break; }
    for (let x = w - 1; x >= 0; x -= 1) if (alpha[y * w + x] > 0.5) { r = x; break; }
    if (l >= 0) left.push(l);
    if (r >= 0) right.push(r);
  }
  const wav = (arr) => {
    if (arr.length < 12) return 0;
    let s = 0;
    const k = 6;
    for (let i = k; i < arr.length - k; i += 1) {
      let m = 0;
      for (let j = -k; j <= k; j += 1) m += arr[i + j];
      s += Math.abs(arr[i] - m / (2 * k + 1));
    }
    return s / (arr.length - 2 * k);
  };
  return (wav(left) + wav(right)) / 2 / Math.max(1, faceW);
}

export function classifyTexture(meanCoherence, waviness) {
  // starting thresholds; the stylist always confirms with one tap
  let texture = 'straight';
  if (meanCoherence < 0.28 || waviness > 0.05) texture = 'coily';
  if (meanCoherence >= 0.28 && waviness <= 0.05) texture = 'curly';
  if (meanCoherence >= 0.4 && waviness <= 0.03) texture = 'wavy';
  if (meanCoherence >= 0.55 && waviness <= 0.015) texture = 'straight';
  const margin = Math.min(Math.abs(meanCoherence - 0.55), Math.abs(meanCoherence - 0.4), Math.abs(meanCoherence - 0.28));
  return { texture, confidence: Math.round(Math.min(0.85, 0.45 + margin * 2) * 100) / 100 };
}

export function meanOver(values, alpha, n, t = 0.6) {
  let s = 0;
  let c = 0;
  for (let i = 0; i < n; i += 1) {
    if (alpha[i] >= t) {
      s += values[i];
      c += 1;
    }
  }
  return c ? s / c : 0;
}

/** Scalp visibility near the part: share of skin-like pixels in the hair band around the part. */
export function density(lab, alpha, labels, w, h, { midX, topY, faceW, skinLab, mmPerPx }) {
  const bandH = mmPerPx ? 30 / mmPerPx : faceW * 0.25;
  const bandW = faceW * 0.12;
  let hair = 0;
  let scalp = 0;
  for (let y = Math.max(0, Math.round(topY)); y < Math.min(h, Math.round(topY + bandH)); y += 1) {
    for (let x = Math.max(0, Math.round(midX - bandW)); x < Math.min(w, Math.round(midX + bandW)); x += 1) {
      const i = y * w + x;
      const isHair = alpha[i] > 0.4;
      const skinLike =
        labels[i] === 3 ||
        (skinLab && Math.hypot(lab.L[i] - skinLab[0], lab.A[i] - skinLab[1], lab.B[i] - skinLab[2]) < 12);
      if (isHair || skinLike) hair += 1;
      if (skinLike && alpha[i] < 0.8) scalp += 1;
    }
  }
  if (hair < 30) return { density: 'medium', confidence: 0.3, scalpPct: 0 };
  const pct = scalp / hair;
  const d = pct > 0.12 ? 'fine' : pct > 0.05 ? 'medium' : 'thick';
  return { density: d, confidence: 0.55, scalpPct: Math.round(pct * 100) };
}
