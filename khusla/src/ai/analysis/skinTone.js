// Skin tone, ITA°, Monk Skin Tone, undertone, contrast (PRD 5.5).
import { ita, itaBand, meanLab, nearestMst, trimByQuantile, undertone } from './color.js';

const FACE_SKIN = 3;

/** Collect face-skin Lab samples in circles around cheek and forehead landmarks. */
export function sampleSkin(lab, labels, w, h, pts) {
  const faceW = Math.hypot(pts[234][0] - pts[454][0], pts[234][1] - pts[454][1]);
  const regions = [
    { c: pts[50], r: faceW * 0.09, side: 'left' },
    { c: pts[280], r: faceW * 0.09, side: 'right' },
    { c: pts[151], r: faceW * 0.07, side: 'forehead' },
  ];
  const out = { all: [], left: [], right: [] };
  for (const reg of regions) {
    const [cx, cy] = reg.c;
    const r = Math.max(2, reg.r);
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y += 1) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x += 1) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
        const i = y * w + x;
        if (labels && labels[i] !== FACE_SKIN) continue;
        const s = [lab.L[i], lab.A[i], lab.B[i]];
        out.all.push(s);
        if (reg.side === 'left') out.left.push(s);
        if (reg.side === 'right') out.right.push(s);
      }
    }
  }
  return out;
}

/** Drop the brightest 5% (shine) and darkest 10% (shadow) by L*. */
export function trimSkin(samples) {
  return trimByQuantile(samples, (s) => s[0], 0.1, 0.05);
}

export function skinFromSamples(samples, { whiteCard = false } = {}) {
  const kept = trimSkin(samples);
  if (kept.length < 20) return null;
  const lab = meanLab(kept);
  const angle = ita(lab);
  const { mst } = nearestMst(lab);
  const confidence = Math.min(0.95, (whiteCard ? 0.85 : 0.65) + Math.min(0.1, kept.length / 20000));
  return {
    lab: lab.map((v) => Math.round(v * 10) / 10),
    ita: Math.round(angle * 10) / 10,
    itaBand: itaBand(angle),
    mst,
    undertone: undertone(lab),
    confidence: Math.round(confidence * 100) / 100,
  };
}

/** Left vs right cheek L* difference (> 12 → "Turn to face the light"). */
export function cheekBalance(samples) {
  const l = meanLab(trimSkin(samples.left))[0];
  const r = meanLab(trimSkin(samples.right))[0];
  if (!Number.isFinite(l) || !Number.isFinite(r)) return 0;
  return Math.abs(l - r);
}

export function contrastBand(rootL, skinL) {
  const d = Math.abs(skinL - rootL);
  if (d < 25) return 'low';
  if (d < 45) return 'medium';
  return 'high';
}
