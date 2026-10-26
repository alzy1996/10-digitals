// Quick shorten (PRD 7.7): remove the hair below the new line with on-device inpainting, then feather
// the new ends with a strand-tip alpha. Result is labelled "Quick preview".
import { inpaint } from '../models/inpaint.js';

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * @param {{width,height,data}} src display RGBA
 * @param {Float32Array} alpha hair alpha
 * @param {Uint8Array} aux3 streak texture (RGBA, R = fine streaks) for tip variation
 * @param {number} lineY new length line (image px)
 * @param {number} pxPerCm
 * @returns {Promise<{data: Uint8ClampedArray, alpha: Float32Array, method: string}>}
 */
export async function quickShorten(src, alpha, aux3, lineY, pxPerCm) {
  const { width: w, height: h } = src;
  const tipBand = 1.2 * pxPerCm;
  const keep = new Float32Array(w * h).fill(1);
  const hole = new Uint8Array(w * h);
  let minX = w;
  let maxX = 0;
  let minY = h;
  let maxY = 0;
  for (let y = Math.max(0, Math.floor(lineY - tipBand)); y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (alpha[i] < 0.2) continue;
      const tipVar = aux3 ? aux3[i * 4] / 255 : 0.5;
      const tipEnd = lineY - tipVar * tipBand * 0.8;
      const k = 1 - smooth(tipEnd - 0.25 * pxPerCm, tipEnd + 0.1 * pxPerCm, y);
      keep[i] = k;
      if (k < 0.999) {
        hole[i] = 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (minX > maxX) return { data: src.data, alpha, method: 'none' };
  // dilate the hole by 2 px so no hair fringe remains around it
  const dil = Uint8Array.from(hole);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!hole[y * w + x]) continue;
      for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
        const yy = y + dy;
        const xx = x + dx;
        if (yy >= 0 && xx >= 0 && yy < h && xx < w && alpha[yy * w + xx] > 0.05) dil[yy * w + xx] = 1;
      }
    }
  }
  const m = 24;
  const cx0 = Math.max(0, minX - m);
  const cy0 = Math.max(0, minY - m);
  const cx1 = Math.min(w, maxX + m + 1);
  const cy1 = Math.min(h, maxY + m + 1);
  const cw = cx1 - cx0;
  const ch = cy1 - cy0;
  const crop = new Uint8ClampedArray(cw * ch * 4);
  const cropHole = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      const si = (cy0 + y) * w + cx0 + x;
      const di = y * cw + x;
      crop.set(src.data.subarray(si * 4, si * 4 + 4), di * 4);
      cropHole[di] = dil[si];
    }
  }
  const filled = await inpaint({ width: cw, height: ch, data: crop }, cropHole);
  const out = new Uint8ClampedArray(src.data);
  const newAlpha = Float32Array.from(alpha);
  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      const si = (cy0 + y) * w + cx0 + x;
      const di = y * cw + x;
      if (!cropHole[di]) continue;
      const k = hole[si] ? keep[si] : 0.6; // dilated rim: blend lightly
      for (let c = 0; c < 3; c += 1) out[si * 4 + c] = src.data[si * 4 + c] * k + filled.data[di * 4 + c] * (1 - k);
      newAlpha[si] = alpha[si] * (hole[si] ? keep[si] : 0.6);
    }
  }
  return { data: out, alpha: newAlpha, method: filled.method };
}
