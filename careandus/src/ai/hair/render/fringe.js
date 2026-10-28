// Fringe overlay (PRD 7.7): procedural strands between hairline and brows, recolored to her hair.
// Drawn on a 2D canvas the size of the photo, composited above the WebGL render.
import { faceGeometry } from './silhouette.js';
import { labToRgb } from '../analysis/color.js';

function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const SPEC = {
  // [length (fraction of hairline->brow + below), spread (face widths), part style, waviness, opacity]
  curtain: [1.05, 0.95, 'center', 0.15, 0.9],
  birkin: [1.15, 0.8, 'none', 0.12, 0.75],
  airy: [0.95, 0.75, 'none', 0.1, 0.55],
  blunt: [1.0, 0.8, 'none', 0.0, 0.97],
  micro: [0.5, 0.7, 'none', 0.0, 0.95],
  'side-swept': [1.1, 0.85, 'side', 0.08, 0.9],
  bottleneck: [0.95, 0.8, 'bottle', 0.08, 0.85],
  'curly-fringe': [0.85, 0.85, 'none', 0.6, 0.92],
};

/**
 * @param {HTMLCanvasElement} canvas same size as the photo
 * @param {object} fringe catalog item
 * @param {object} rd renderData
 * @param {number[]} hairLab Lab of her (rendered) hair
 */
export function drawFringe(canvas, fringe, rd, hairLab) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const spec = SPEC[fringe?.id];
  if (!spec) return;
  const g = faceGeometry(rd);
  const p = rd.pts;
  const browY = Math.min(p[105][1], p[334][1]);
  const hairY = rd.hairlineY ?? p[10][1];
  const [lenF, spreadF, part, wav, op] = spec;
  const width = (g.rightX - g.leftX) * spreadF;
  const x0 = g.midX - width / 2;
  const rand = rng(97);
  const count = Math.round(width / 1.6);
  const [r, gg, b] = labToRgb(hairLab);
  const dark = labToRgb([Math.max(2, hairLab[0] - 10), hairLab[1], hairLab[2]]);
  const light = labToRgb([Math.min(95, hairLab[0] + 9), hairLab[1] * 0.9, hairLab[2] * 0.9]);
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i += 1) {
    const t = (i + rand()) / count; // 0..1 across
    const sx = x0 + t * width;
    let len = (browY - hairY) * lenF;
    if (part === 'center') len *= 0.75 + Math.abs(t - 0.5) * 0.9;
    if (part === 'bottle') len *= 0.82 + Math.abs(t - 0.5) * 0.7;
    if (part === 'side') len *= 0.7 + t * 0.6;
    if (fringe.id === 'blunt' || fringe.id === 'micro') len *= 0.98 + rand() * 0.04;
    else len *= 0.9 + rand() * 0.2;
    const sy = hairY - (browY - hairY) * 0.25;
    const ey = hairY + len;
    let ex = sx;
    if (part === 'center') ex = sx + (t < 0.5 ? -1 : 1) * width * 0.22 * Math.abs(t - 0.5) * 2;
    if (part === 'side') ex = sx - width * 0.25;
    const wob = wav * width * 0.05;
    const c1x = sx + (rand() - 0.5) * wob;
    const c2x = ex + (rand() - 0.5) * wob * 2;
    const tone = rand();
    const col = tone < 0.3 ? dark : tone > 0.85 ? light : [r, gg, b];
    ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${op * (0.55 + rand() * 0.45)})`;
    ctx.lineWidth = Math.max(1, width / 180) * (0.7 + rand() * 0.8);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    if (fringe.id === 'curly-fringe') {
      const loops = 3;
      let y = sy;
      const step = (ey - sy) / loops;
      for (let k = 0; k < loops; k += 1) {
        ctx.bezierCurveTo(sx + wob * 3, y + step * 0.3, sx - wob * 3, y + step * 0.7, sx + (rand() - 0.5) * wob, y + step);
        y += step;
      }
    } else {
      ctx.bezierCurveTo(c1x, sy + (ey - sy) * 0.4, c2x, sy + (ey - sy) * 0.75, ex, ey);
    }
    ctx.stroke();
  }
  // soften the top edge into her own hair
  ctx.globalCompositeOperation = 'destination-out';
  const grad = ctx.createLinearGradient(0, hairY - (browY - hairY) * 0.3, 0, hairY + (browY - hairY) * 0.1);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(x0 - width * 0.3, 0, width * 1.6, hairY + (browY - hairY) * 0.1);
  ctx.globalCompositeOperation = 'source-over';
}
