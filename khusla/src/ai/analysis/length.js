// Length band and cm (PRD 5.6): lowest hair point vs chin and shoulder line; strand length from the root field.
import { quantile } from './imageOps.js';
import { roundLengthCm } from './scale.js';

/** Shoulder line: topmost clothes/body-skin row in two columns beside the neck. */
export function shoulderY(labels, w, h, { midX, faceW, chinY, faceLen }) {
  const ys = [];
  for (const dx of [-1.25, 1.25]) {
    const x = Math.round(midX + dx * faceW);
    if (x < 0 || x >= w) continue;
    for (let y = Math.round(chinY); y < h; y += 1) {
      const c = labels[y * w + x];
      if (c === 2 || c === 4) {
        ys.push(y);
        break;
      }
    }
  }
  if (!ys.length) return chinY + faceLen * 0.55;
  return ys.reduce((a, b) => a + b, 0) / ys.length;
}

export function lowestHairY(alpha, w, h) {
  const ys = [];
  for (let y = 0; y < h; y += 1) {
    let c = 0;
    for (let x = 0; x < w; x += 1) if (alpha[y * w + x] > 0.5) c += 1;
    if (c >= 3) ys.push(y);
  }
  return ys.length ? quantile(ys, 0.99) : 0;
}

export function lengthBandFor({ tipY, chinY, jawY, shoulder, faceLen, lengthCm }) {
  if (lengthCm !== null && lengthCm < 8) return 'very-short';
  const d = (tipY - chinY) / faceLen;
  const s = (shoulder - chinY) / faceLen;
  if (tipY < jawY - faceLen * 0.05) return 'short';
  if (d < -0.05) return 'jaw';
  if (d < 0.15) return 'chin';
  if (d < s - 0.08) return 'collarbone';
  if (d < s + 0.25) return 'shoulder';
  if (d < s + 1.3) return 'long';
  return 'very-long';
}

export function measureLength({ alpha, dist, labels, w, h, pts, mmPerPx, faceLen }) {
  const chinY = pts[152][1];
  const jawY = (pts[172][1] + pts[397][1]) / 2;
  const faceW = Math.hypot(pts[234][0] - pts[454][0], pts[234][1] - pts[454][1]);
  const midX = pts[10][0];
  const tipY = lowestHairY(alpha, w, h);
  const shoulder = shoulderY(labels, w, h, { midX, faceW, chinY, faceLen });
  const ds = [];
  for (let i = 0; i < dist.length; i += 1) if (dist[i] > 0 && alpha[i] > 0.6) ds.push(dist[i]);
  const strandPx = ds.length ? quantile(ds, 0.95) : 0;
  const lengthCm = mmPerPx ? roundLengthCm((strandPx * mmPerPx) / 10) : null;
  return {
    tipY,
    shoulderY: shoulder,
    lengthCm,
    lengthBand: lengthBandFor({ tipY, chinY, jawY, shoulder, faceLen, lengthCm }),
    strandPx,
  };
}
