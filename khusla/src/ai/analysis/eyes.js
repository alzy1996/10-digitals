// Eye color from the iris ring between pupil and iris edge (PRD 5.5).
import { chroma, hueDeg, medianLab } from './color.js';

export function sampleIris(lab, w, h, pts) {
  const samples = [];
  for (const [center, contour] of [
    [468, [469, 470, 471, 472]],
    [473, [474, 475, 476, 477]],
  ]) {
    const c = pts[center];
    const radius = contour.reduce((s, id) => s + Math.hypot(pts[id][0] - c[0], pts[id][1] - c[1]), 0) / contour.length;
    if (radius < 3) continue;
    const ring = [];
    for (let y = Math.floor(c[1] - radius); y <= Math.ceil(c[1] + radius); y += 1) {
      for (let x = Math.floor(c[0] - radius); x <= Math.ceil(c[0] + radius); x += 1) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const d = Math.hypot(x - c[0], y - c[1]) / radius;
        if (d < 0.38 || d > 0.85) continue; // skip pupil and the limbal edge
        const i = y * w + x;
        ring.push([lab.L[i], lab.A[i], lab.B[i]]);
      }
    }
    // skip specular highlights: drop the brightest 15%
    ring.sort((a, b) => a[0] - b[0]);
    samples.push(...ring.slice(0, Math.floor(ring.length * 0.85)));
  }
  return samples;
}

export function classifyEye(lab) {
  const [L, a, b] = lab;
  const C = chroma(lab);
  const h = hueDeg(lab);
  if (b < -2 && C > 4) return 'blue';
  if (C < 6 && L > 38) return 'grey';
  if (a < 1 && b > 4 && h > 95) return 'green';
  if (L > 36 && h > 70 && h <= 95 && C > 8) return 'hazel';
  if (L < 30 || (C < 10 && L < 36)) return 'dark-brown';
  return 'brown';
}

export function eyeColor(lab, w, h, pts) {
  const s = sampleIris(lab, w, h, pts);
  if (s.length < 15) return { color: 'dark-brown', confidence: 0.3 };
  const m = medianLab(s);
  const color = classifyEye(m);
  const confidence = Math.min(0.92, 0.55 + s.length / 600);
  return { color, confidence: Math.round(confidence * 100) / 100, lab: m.map((v) => Math.round(v * 10) / 10) };
}
