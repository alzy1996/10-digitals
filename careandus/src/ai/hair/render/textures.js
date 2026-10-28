// Precomputes the renderer's auxiliary textures from the on-device analysis (once per photo).
// Everything stays in memory on this device.
import { boxMean, downscale, resample } from '../analysis/imageOps.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Deterministic hash noise. */
function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Chamfer distance (in px) to the nearest pixel where `isSource(i)` is true. */
export function chamfer(w, h, isSource) {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) d[i] = isSource(i) ? 0 : INF;
  const a = 1;
  const b = Math.SQRT2;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + a);
      if (y > 0) {
        v = Math.min(v, d[i - w] + a);
        if (x > 0) v = Math.min(v, d[i - w - 1] + b);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + b);
      }
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y -= 1) {
    for (let x = w - 1; x >= 0; x -= 1) {
      const i = y * w + x;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + a);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + a);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + b);
        if (x > 0) v = Math.min(v, d[i + w - 1] + b);
      }
      d[i] = v;
    }
  }
  return d;
}

/** Rank-normalize values over a mask so a threshold t covers (1 - t) of the hair. */
function rankNormalize(values, weight, n) {
  const hist = new Float64Array(256);
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    if (weight[i] < 0.3) continue;
    hist[Math.min(255, Math.max(0, Math.floor(values[i] * 255)))] += 1;
    total += 1;
  }
  if (!total) return values;
  const cdf = new Float32Array(256);
  let acc = 0;
  for (let k = 0; k < 256; k += 1) {
    acc += hist[k];
    cdf[k] = acc / total;
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = cdf[Math.min(255, Math.max(0, Math.floor(values[i] * 255)))];
  return out;
}

/**
 * Line-integral convolution of several noise fields along the strand flow in ONE streamline trace
 * (each channel stops at its own length). dx/dy are precomputed unit flow vectors.
 */
function licMulti(noises, steps, dx, dy, w, h, mask) {
  const n = w * h;
  const C = noises.length;
  const maxSteps = Math.max(...steps);
  const outs = noises.map(() => new Float32Array(n));
  const sums = new Float64Array(C);
  const cnts = new Int32Array(C);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i0 = y * w + x;
      for (let c = 0; c < C; c += 1) {
        sums[c] = noises[c][i0];
        cnts[c] = 1;
      }
      for (let dir = -1; dir <= 1; dir += 2) {
        let px = x + 0.5;
        let py = y + 0.5;
        let ix = x;
        let iy = y;
        for (let k = 0; k < maxSteps; k += 1) {
          const j = iy * w + ix;
          px += dx[j] * dir;
          py += dy[j] * dir;
          if (px < 0 || py < 0 || px >= w || py >= h) break;
          ix = px | 0;
          iy = py | 0;
          const q = iy * w + ix;
          if (mask && mask[q] < 0.3 && mask[i0] >= 0.3) break; // stay inside the hair
          for (let c = 0; c < C; c += 1) {
            if (k < steps[c]) {
              sums[c] += noises[c][q];
              cnts[c] += 1;
            }
          }
        }
      }
      for (let c = 0; c < C; c += 1) outs[c][i0] = sums[c] / cnts[c];
    }
  }
  return outs;
}

/** Blocky white noise: one random value per cell of `cell` px (cell 1 = per pixel). */
function cellNoise(w, h, cell, rng) {
  const c = Math.max(1, Math.round(cell));
  const cw = Math.ceil(w / c);
  const ch = Math.ceil(h / c);
  const g = new Float32Array(cw * ch);
  for (let i = 0; i < g.length; i += 1) g[i] = rng();
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const gy = Math.floor(y / c) * cw;
    for (let x = 0; x < w; x += 1) out[y * w + x] = g[gy + Math.floor(x / c)];
  }
  return out;
}

function smoothNoise(w, h, cell, rng) {
  const cw = Math.max(2, Math.ceil(w / cell) + 1);
  const ch = Math.max(2, Math.ceil(h / cell) + 1);
  const g = new Float32Array(cw * ch);
  for (let i = 0; i < g.length; i += 1) g[i] = rng();
  return resample(g, cw, ch, w, h);
}

function pack(channels, n) {
  const out = new Uint8Array(n * 4);
  for (let c = 0; c < 4; c += 1) {
    const ch = channels[c];
    if (!ch) continue;
    for (let i = 0; i < n; i += 1) out[i * 4 + c] = Math.round(clamp01(ch[i]) * 255);
  }
  return out;
}

/**
 * @param {object} rd renderData from analysis/profile.js
 * @param {number} mmPerPx
 * @returns {{width, height, aux1, aux2, aux3, aux4, hairMeanL, maxCm, partX}}
 */
export function buildAux(rd, mmPerPx) {
  const { width: w, height: h, alpha, r, lab, labels, pts } = rd;
  const n = w * h;
  const pxPerCm = mmPerPx ? 10 / mmPerPx : w / 40;
  const scale = Math.max(w, h) / 1080;

  // local mean and sigma of L* (15 px box at 1080p)
  const rad = Math.max(3, Math.round(7 * scale));
  const Lbar = boxMean(lab.L, w, h, rad);
  const L2 = new Float32Array(n);
  for (let i = 0; i < n; i += 1) L2[i] = lab.L[i] * lab.L[i];
  const L2bar = boxMean(L2, w, h, rad);
  const sigma = new Float32Array(n);
  let sumL = 0;
  let cntL = 0;
  for (let i = 0; i < n; i += 1) {
    sigma[i] = Math.sqrt(Math.max(0, L2bar[i] - Lbar[i] * Lbar[i])) / 40;
    if (alpha[i] > 0.6) {
      sumL += lab.L[i];
      cntL += 1;
    }
  }
  const hairMeanL = cntL ? sumL / cntL : 30;
  const LbarN = Lbar.map((v) => v / 100);

  // geometry
  const chinY = pts[152][1];
  const faceW = Math.hypot(pts[234][0] - pts[454][0], pts[234][1] - pts[454][1]);
  const browY = (pts[105][1] + pts[334][1]) / 2;
  const hairlineY = rd.hairlineY ?? pts[10][1];
  const topY = rd.topY ?? 0;
  const tipY = rd.tipY || h;

  // distance to face-skin (for face frame, money piece, hijab visible zone) at half res
  const k = 2;
  const hw = Math.floor(w / k);
  const hh = Math.floor(h / k);
  const isFace = (i) => {
    const x = (i % hw) * k;
    const y = Math.floor(i / hw) * k;
    return labels[y * w + x] === 3;
  };
  const dFaceSmall = chamfer(hw, hh, isFace);
  const dFace = resample(dFaceSmall.map((v) => v * k), hw, hh, w, h);
  const isOutside = (i) => {
    const x = (i % hw) * k;
    const y = Math.floor(i / hw) * k;
    return alpha[y * w + x] < 0.4;
  };
  const dEdge = resample(chamfer(hw, hh, isOutside).map((v) => v * k), hw, hh, w, h);

  const frame = new Float32Array(n);
  const outer = new Float32Array(n);
  const lower = new Float32Array(n);
  const hijabVisible = new Float32Array(n);
  const money = new Float32Array(n);
  const partial = new Float32Array(n);
  const hairH = Math.max(1, tipY - topY);
  const jawY = (pts[172][1] + pts[397][1]) / 2;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (alpha[i] < 0.05) continue;
      const dc = dFace[i] / pxPerCm;
      const inBand = y > hairlineY - 2.5 * pxPerCm && y < chinY + 8 * pxPerCm;
      frame[i] = inBand ? 1 - smooth(1.5, 3.5, dc) : 0;
      outer[i] = Math.max(frame[i], 1 - smooth(0.5, 4, dEdge[i] / pxPerCm));
      outer[i] = 0.35 + 0.65 * outer[i];
      const yn = (y - topY) / hairH;
      lower[i] = smooth(0.6, 0.7, yn) * (1 - frame[i]);
      // shayla worn loosely: front hair around the hairline and temples stays visible down to the jaw
      const nearFront = 1 - smooth(2.0, 3.5, dc);
      hijabVisible[i] = y < jawY ? nearFront : nearFront * (1 - smooth(jawY, jawY + 2 * pxPerCm, y));
      money[i] = (y > hairlineY - 1.5 * pxPerCm ? 1 : 0) * (1 - smooth(2.0, 3.0, dc)) * (Math.abs(x - pts[10][0]) > faceW * 0.18 || y > browY ? 1 : 0.4);
      partial[i] = Math.max(frame[i], 1 - smooth(jawY - pxPerCm, jawY + 2 * pxPerCm, y));
    }
  }

  // streak textures: noise advected along the strand flow (computed at half res)
  const flowAngle = rd.flow ? resample(rd.flow, rd.flowW, rd.flowH, hw, hh) : new Float32Array(hw * hh).fill(Math.PI / 2);
  const rng = makeRng(1234567);
  const s = scale / k;
  const aSmall = downscale(alpha, w, h, k);
  const fdx = new Float32Array(hw * hh);
  const fdy = new Float32Array(hw * hh);
  for (let i = 0; i < hw * hh; i += 1) {
    fdx[i] = Math.cos(flowAngle[i]);
    fdy[i] = Math.sin(flowAngle[i]);
  }
  const [fine, med, chunky, sweep] = licMulti(
    [
      cellNoise(hw, hh, Math.max(1, Math.round(2 * s)), rng),
      cellNoise(hw, hh, Math.max(1, Math.round(4 * s)), rng),
      cellNoise(hw, hh, Math.max(2, Math.round(12 * s)), rng),
      smoothNoise(hw, hh, Math.round(hw * 0.07), rng),
    ],
    [Math.round(22 * scale), Math.round(18 * scale), Math.round(24 * scale), Math.round(20 * scale)],
    fdx,
    fdy,
    hw,
    hh,
    aSmall.data,
  );
  const up = (m) => resample(rankNormalize(m, aSmall.data, hw * hh), hw, hh, w, h);
  const fineN = up(fine);
  const medN = up(med);
  const chunkyN = up(chunky);
  const sweepN = up(sweep);

  return {
    width: w,
    height: h,
    aux1: pack([alpha, r, frame, outer], n),
    aux2: pack([LbarN, sigma, lower, hijabVisible], n),
    aux3: pack([fineN, medN, chunkyN, sweepN], n),
    aux4: pack([money, partial, null, null], n),
    hairMeanL,
    maxCm: (rd.maxDistPx * (mmPerPx || 0.1)) / 10,
    partX: pts[10][0] / w,
    lbar: Lbar,
  };
}

/** Live mode: cheap aux from a hair confidence mask (no root field). */
export function buildLiveAux(conf, mw, mh, { topFrac = 0.1, bottomFrac = 0.95 } = {}) {
  const n = mw * mh;
  let minY = mh;
  let maxY = 0;
  for (let y = 0; y < mh; y += 1) for (let x = 0; x < mw; x += 1) if (conf[y * mw + x] > 0.5) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (minY >= maxY) {
    minY = topFrac * mh;
    maxY = bottomFrac * mh;
  }
  const r = new Float32Array(n);
  const ones = new Float32Array(n).fill(0.6);
  for (let y = 0; y < mh; y += 1) for (let x = 0; x < mw; x += 1) r[y * mw + x] = clamp01((y - minY) / (maxY - minY));
  return { aux1: pack([conf, r, null, ones], n), width: mw, height: mh };
}
