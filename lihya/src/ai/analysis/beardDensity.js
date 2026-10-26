// Beard and stubble density per zone (PRD 5.5). Texture and darkness analysis
// inside the face-mesh zone polygons; no model.
//
// Reference skin: forehead and upper cheeks, face-skin class pixels only.
// Per pixel, after a small bilateral smoothing of L* (pores and acne spots fade,
// hair edges stay):
//   darkness   reference L* minus the pixel's smoothed L*
//   texture    local high-pass energy of L* (3 x 3 neighbourhood) above the
//              reference skin's own texture, damped where the local structure is a
//              single oriented edge (structure-tensor coherence): smile folds, the
//              jaw line and lip borders are edges, stubble is isotropic texture.
//              Only skin and hair pixels enter the filters, so the border against
//              background or clothes does not read as texture.
//   chroma     drop of chromatic saturation (1 - 3 min(r, g, b) of linear RGB
//              chromaticity) against the reference. Shading scales linear RGB and
//              keeps chromaticity; black, brown-black and grey hair pull it toward
//              neutral.
// Darkness only counts when texture or chroma drop backs it up, so a shadow under
// the jaw or the lower lip is not hair. Grey and white hairs (neutral, light,
// textured) count as hair; pixels the segmenter calls hair count as hair.
//
// Per zone: density 0..100 (mean soft hair score), confidence 0..1 (skin/hair
// contrast available, how decisive the pixels are, pixel count, lighting balance;
// under CONFIRM_BELOW the barber confirms with one tap), grey share, and length
// in mm from the silhouette thickness beyond the predicted skin contour where it
// can be seen (front and side shots), else a low-confidence estimate from density.

import { zonePolygonsPx, ZONE_IDS, FACE_OVAL } from '../mesh/zones.js';
import { CLASSES } from '../models/classes.js';
import {
  SRGB_TO_LINEAR,
  labAt,
  lstarFromY,
  boxFilter,
  convexHull,
  forEachPixelInPolygon,
  polygonBBox,
  percentile,
  smoothstep,
} from './pixels.js';
import { CHEEK_PATCH, FOREHEAD_PATCH } from '../capture/quality.js';
import { clamp, median } from './color.js';

export const CONFIRM_BELOW = 0.6;

/** Generic grow-ability weights (full-beard view); the recommend engine recomputes per style. */
export const GROW_WEIGHTS = Object.freeze({
  M: 0.14,
  S: 0.04,
  C: 0.16,
  J_L: 0.12,
  J_R: 0.12,
  K_L: 0.15,
  K_R: 0.15,
  B_L: 0.06,
  B_R: 0.06,
  N: 0,
});

/** Tuning constants (starting values, tuned in QA). */
export const DENSITY = Object.freeze({
  darkFrom: 4,
  darkTo: 20,
  texGain: 1.2,
  texFrom: 0.6,
  texTo: 4.5,
  coherenceDamp: 0.85,
  satFrom: 0.15,
  satTo: 0.55,
  gateFrom: 0.1,
  gateTo: 0.45,
  wDark: 0.35,
  wTex: 0.35,
  wSat: 0.3,
  hairFrom: 0.25,
  hairTo: 0.55,
  hairPixel: 0.5,
  greySat: 0.12,
  greyL: 50,
  greyChromaLab: 8,
  bilateralSigmaR: 7,
  maxLengthMm: 60,
});

// Inside the face-mesh zones only background is excluded: a long or unusual beard
// can come back from the segmenter as clothes or "others". The neck zone N lies
// below the jaw where collars are, so it also drops clothes and accessories.
const filterable = (cls) => cls === undefined || cls !== CLASSES.BACKGROUND;
const usableIn = (zone, cls) =>
  cls === undefined || (zone === 'N' ? cls === CLASSES.FACE_SKIN || cls === CLASSES.BODY_SKIN || cls === CLASSES.HAIR : cls !== CLASSES.BACKGROUND);

/** Bilateral smoothing (5 x 5) of a scalar map. */
function bilateral(src, w, h, sigmaR) {
  const out = new Float32Array(w * h);
  const offs = [];
  const sw = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      offs.push(dx, dy);
      sw.push(Math.exp(-(dx * dx + dy * dy) / (2 * 1.5 * 1.5)));
    }
  }
  const LUT = new Float32Array(256);
  for (let d = 0; d < 256; d++) LUT[d] = Math.exp(-((d / 2) ** 2) / (2 * sigmaR * sigmaR));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = src[y * w + x];
      let acc = 0;
      let wsum = 0;
      for (let j = 0; j < sw.length; j++) {
        const xx = x + offs[2 * j];
        const yy = y + offs[2 * j + 1];
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const v = src[yy * w + xx];
        const d = Math.min(255, Math.round(Math.abs(v - c) * 2));
        const wt = sw[j] * LUT[d];
        acc += v * wt;
        wsum += wt;
      }
      out[y * w + x] = acc / wsum;
    }
  }
  return out;
}

/** Box mean of src over the pixels with weight 1 (normalised convolution). */
function maskedMean(src, W, boxW, w, h, r) {
  const n = w * h;
  const prod = new Float32Array(n);
  for (let k = 0; k < n; k++) prod[k] = src[k] * W[k];
  const m = boxFilter(prod, w, h, r);
  for (let k = 0; k < n; k++) m[k] = boxW[k] > 1e-6 ? m[k] / boxW[k] : 0;
  return m;
}

/**
 * Feature maps over a region of interest [x0, y0, x1, y1] (pixel box) of img:
 * smoothed L*, chromatic saturation and texture. categories (optional,
 * at the img size) keeps background / clothes / accessories out of the filters.
 * Returns { x0, y0, w, h, L, sat, tex }.
 */
export function featureMaps(img, roi, gains = [1, 1, 1], categories = null) {
  const x0 = Math.max(0, Math.floor(roi[0]));
  const y0 = Math.max(0, Math.floor(roi[1]));
  const x1 = Math.min(img.width - 1, Math.ceil(roi[2]));
  const y1 = Math.min(img.height - 1, Math.ceil(roi[3]));
  const w = Math.max(1, x1 - x0 + 1);
  const h = Math.max(1, y1 - y0 + 1);
  const n = w * h;
  const Lraw = new Float32Array(n);
  const Sraw = new Float32Array(n);
  const W = new Float32Array(n);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y0 + y) * img.width + (x0 + x);
      const k = y * w + x;
      const o = p * 4;
      const r = SRGB_TO_LINEAR[d[o]] * gains[0];
      const g = SRGB_TO_LINEAR[d[o + 1]] * gains[1];
      const b = SRGB_TO_LINEAR[d[o + 2]] * gains[2];
      const sum = r + g + b;
      Sraw[k] = sum > 0.004 ? 1 - (3 * Math.min(r, g, b)) / sum : 0;
      Lraw[k] = lstarFromY(clamp(0.2126729 * r + 0.7151522 * g + 0.072175 * b, 0, 1));
      W[k] = !categories || filterable(categories[p]) ? 1 : 0;
    }
  }
  const L = bilateral(Lraw, w, h, DENSITY.bilateralSigmaR);
  const boxW1 = boxFilter(W, w, h, 1);
  const sat = maskedMean(Sraw, W, boxW1, w, h, 1);
  const mean = maskedMean(L, W, boxW1, w, h, 1);
  const hp2 = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const dl = (L[k] - mean[k]) * W[k];
    hp2[k] = dl * dl;
  }
  const energy = maskedMean(hp2, W, boxW1, w, h, 1);
  // Structure tensor of L* (central differences, skin pixels only), smoothed r = 2.
  const gxx = new Float32Array(n);
  const gyy = new Float32Array(n);
  const gxy = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x;
      if (!W[k] || !W[k - 1] || !W[k + 1] || !W[k - w] || !W[k + w]) continue;
      const gx = (L[k + 1] - L[k - 1]) / 2;
      const gy = (L[k + w] - L[k - w]) / 2;
      gxx[k] = gx * gx;
      gyy[k] = gy * gy;
      gxy[k] = gx * gy;
    }
  }
  const jxx = boxFilter(gxx, w, h, 2);
  const jyy = boxFilter(gyy, w, h, 2);
  const jxy = boxFilter(gxy, w, h, 2);
  const tex = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const tr = jxx[k] + jyy[k];
    const coh = tr > 1e-6 ? ((jxx[k] - jyy[k]) ** 2 + 4 * jxy[k] ** 2) / (tr * tr) : 0;
    tex[k] = Math.sqrt(energy[k]) * (1 - DENSITY.coherenceDamp * coh);
  }
  return { x0, y0, w, h, L, sat, tex };
}

function regionStats(maps, poly, img, categories) {
  const L = [];
  const S = [];
  const T = [];
  forEachPixelInPolygon(poly, img.width, img.height, (p, x, y) => {
    if (categories && categories[p] !== CLASSES.FACE_SKIN) return;
    const lx = x - maps.x0;
    const ly = y - maps.y0;
    if (lx < 0 || ly < 0 || lx >= maps.w || ly >= maps.h) return;
    const k = ly * maps.w + lx;
    L.push(maps.L[k]);
    S.push(maps.sat[k]);
    T.push(maps.tex[k]);
  });
  if (L.length < 8) return null;
  return { L: median(L), sat: median(S), tex: percentile(T, 50), n: L.length };
}

/**
 * Reference skin statistics { left, right, fore } (each { L, sat, tex, n } or
 * null) from the upper cheeks and forehead.
 */
export function referenceSkin(maps, img, P, categories) {
  const hull = (ring) => convexHull(ring.map((i) => P[i]));
  return {
    left: regionStats(maps, hull(CHEEK_PATCH.L), img, categories),
    right: regionStats(maps, hull(CHEEK_PATCH.R), img, categories),
    fore: regionStats(maps, hull(FOREHEAD_PATCH), img, categories),
  };
}

function blendRef(parts) {
  const valid = parts.filter(([r]) => r);
  if (!valid.length) return null;
  const wsum = valid.reduce((s, [, w]) => s + w, 0);
  const mix = (k) => valid.reduce((s, [r, w]) => s + r[k] * w, 0) / wsum;
  return { L: mix('L'), sat: mix('sat'), tex: mix('tex') };
}

/** Reference for one zone: same-side cheek for _L / _R zones, both cheeks for the centre. */
export function zoneReference(ref, zone) {
  if (zone.endsWith('_L')) return blendRef([[ref.left, 0.75], [ref.fore, 0.25]]) || blendRef([[ref.right, 1]]);
  if (zone.endsWith('_R')) return blendRef([[ref.right, 0.75], [ref.fore, 0.25]]) || blendRef([[ref.left, 1]]);
  return blendRef([[ref.left, 0.375], [ref.right, 0.375], [ref.fore, 0.25]]);
}

/** The three hair cues of map pixel k against a zone reference: { dark, tex, sat } in 0..1. */
export function hairCues(maps, k, r) {
  const t0 = r.tex * DENSITY.texGain;
  return {
    dark: smoothstep(DENSITY.darkFrom, DENSITY.darkTo, r.L - maps.L[k]),
    tex: smoothstep(t0 + DENSITY.texFrom, t0 + DENSITY.texTo, maps.tex[k]),
    sat: smoothstep(DENSITY.satFrom, DENSITY.satTo, 1 - maps.sat[k] / Math.max(r.sat, 1e-3)),
  };
}

/** Soft hair score 0..1 of map pixel k against a zone reference. cls: segmenter class or undefined. */
export function hairnessAt(maps, k, r, cls) {
  const c = hairCues(maps, k, r);
  const gate = smoothstep(DENSITY.gateFrom, DENSITY.gateTo, Math.max(c.tex, c.sat));
  let h = DENSITY.wDark * c.dark * gate + DENSITY.wTex * c.tex + DENSITY.wSat * c.sat;
  if (maps.sat[k] < DENSITY.greySat && maps.L[k] > Math.max(45, r.L - 10) && c.tex > 0.35) h = Math.max(h, 0.4 + 0.5 * c.tex);
  if (cls === CLASSES.HAIR) h = Math.max(h, 0.75);
  return h;
}

/** Density-based length guess (stubble range) when the length cannot be seen. */
export function lengthFromDensity(density) {
  if (density < 10) return 0;
  return Math.round((0.5 + (2.5 * density) / 100) * 10) / 10;
}

/**
 * Density, confidence, grey share and colour samples of the zones in `zoneIds`.
 * img: ImageData-like; P: landmark pixels (array of [x, y]) of img; categories: mask at
 * the img size or null; gains: white-balance gains. Returns
 * { zones: { id: { density, confidence, n, grey, hair } }, ref, maps, polys,
 *   colorSamples (array of [L, a, b]), cheekDiff }.
 */
export function zoneDensities({ img, landmarks, P, categories = null, gains = [1, 1, 1], zoneIds = ZONE_IDS, extendDownPx = 0 }) {
  const polys = zonePolygonsPx(landmarks, img.width, img.height);
  const boxes = [
    ...zoneIds.map((z) => polygonBBox(polys[z])),
    polygonBBox(CHEEK_PATCH.L.map((i) => P[i])),
    polygonBBox(CHEEK_PATCH.R.map((i) => P[i])),
    polygonBBox(FOREHEAD_PATCH.map((i) => P[i])),
    polygonBBox(FACE_OVAL.map((i) => P[i])),
  ];
  const roi = [
    Math.min(...boxes.map((b) => b[0])) - 4,
    Math.min(...boxes.map((b) => b[1])) - 4,
    Math.max(...boxes.map((b) => b[2])) + 4,
    Math.max(...boxes.map((b) => b[3])) + 4 + extendDownPx,
  ];
  const maps = featureMaps(img, roi, gains, categories);
  const ref = referenceSkin(maps, img, P, categories);
  const cheekDiff = ref.left && ref.right ? Math.abs(ref.left.L - ref.right.L) : 0;
  const balance = 1 - clamp((cheekDiff - 6) / 20, 0, 0.5);
  const zones = {};
  const colorSamples = [];
  let greyTotal = 0;
  let hairTotal = 0;
  for (const id of zoneIds) {
    const r = zoneReference(ref, id);
    let sum = 0;
    let decisive = 0;
    let n = 0;
    let grey = 0;
    let hair = 0;
    if (r) {
      forEachPixelInPolygon(polys[id], img.width, img.height, (p, x, y) => {
        const cls = categories ? categories[p] : undefined;
        if (!usableIn(id, cls)) return;
        const lx = x - maps.x0;
        const ly = y - maps.y0;
        if (lx < 0 || ly < 0 || lx >= maps.w || ly >= maps.h) return;
        const k = ly * maps.w + lx;
        const hs = hairnessAt(maps, k, r, cls);
        const s = smoothstep(DENSITY.hairFrom, DENSITY.hairTo, hs);
        sum += s;
        decisive += Math.abs(2 * s - 1);
        n++;
        if (hs >= DENSITY.hairPixel) {
          hair++;
          if (maps.sat[k] < DENSITY.greySat && maps.L[k] > DENSITY.greyL) grey++;
          else if (hs >= 0.55 && (n & 1) === 0) colorSamples.push(labAt(img.data, p, gains));
        }
      });
    }
    const density = n ? (100 * sum) / n : 0;
    const contrast = r ? smoothstep(15, 45, r.L) : 0;
    const greyFrac = hair ? grey / hair : 0;
    let conf = n ? 0.3 * contrast + 0.45 * (decisive / n) + 0.25 * smoothstep(20, 250, n) : 0;
    conf *= balance;
    if (r && r.L > 55) conf *= 1 - 0.35 * greyFrac;
    zones[id] = { density: Math.round(density), confidence: Math.round(clamp(conf, 0, 1) * 100) / 100, n, grey, hair };
    greyTotal += grey;
    hairTotal += hair;
  }
  return { zones, ref, maps, polys, colorSamples, cheekDiff, greyTotal, hairTotal };
}

/**
 * Silhouette thickness beyond a contour, in pixels. Marches from each contour point
 * along its outward normal and counts beard pixels (segmenter hair, or skin-class
 * pixels with a high hair score) until the background, clothes or plain skin.
 * Returns { px, valid } (median over points; valid = share of points measured).
 */
export function silhouetteThickness({ maps, categories, width, points, normals, r, maxPx }) {
  const values = [];
  for (let i = 0; i < points.length; i++) {
    const [px, py] = points[i];
    const [nx, ny] = normals[i];
    let last = 0;
    let gap = 0;
    let measured = false;
    for (let t = -2; t <= maxPx; t++) {
      const x = Math.round(px + nx * t);
      const y = Math.round(py + ny * t);
      const lx = x - maps.x0;
      const ly = y - maps.y0;
      if (lx < 0 || ly < 0 || lx >= maps.w || ly >= maps.h) break;
      const cls = categories ? categories[y * width + x] : undefined;
      const stop = cls === CLASSES.BACKGROUND || cls === CLASSES.CLOTHES || cls === CLASSES.OTHERS;
      const k = ly * maps.w + lx;
      const beard = !stop && (cls === CLASSES.HAIR || hairnessAt(maps, k, r, cls) >= DENSITY.hairPixel);
      if (beard) {
        last = Math.max(0, t);
        gap = 0;
      } else if (++gap > 2 || stop) {
        measured = true;
        break;
      }
    }
    if (measured) values.push(last);
  }
  if (!values.length) return { px: NaN, valid: 0 };
  return { px: median(values), valid: values.length / points.length };
}

/** Contours whose silhouette gives the length of J_L, J_R and C. */
export const LENGTH_CONTOURS = Object.freeze({
  J_R: Object.freeze([58, 172, 136, 150, 149]),
  J_L: Object.freeze([288, 397, 365, 379, 378]),
  C: Object.freeze([176, 148, 152, 377, 400]),
});

/** Outward unit normals of a contour, pointing away from `center`. */
export function outwardNormals(points, center) {
  return points.map((p, k) => {
    const a = points[Math.max(0, k - 1)];
    const b = points[Math.min(points.length - 1, k + 1)];
    const t = [b[0] - a[0], b[1] - a[1]];
    const l = Math.hypot(t[0], t[1]) || 1;
    let n = [-t[1] / l, t[0] / l];
    if (n[0] * (p[0] - center[0]) + n[1] * (p[1] - center[1]) < 0) n = [-n[0], -n[1]];
    return n;
  });
}

/**
 * Lengths (mm) seen on one shot for the zones in `which` (subset of J_L, J_R, C).
 * Returns { zone: { mm, confidence } }.
 */
export function silhouetteLengths({ density, P, categories, width, mmPerPx, which }) {
  const oval = FACE_OVAL.map((i) => P[i]);
  const center = [oval.reduce((s, p) => s + p[0], 0) / oval.length, oval.reduce((s, p) => s + p[1], 0) / oval.length];
  const maxPx = Math.round(DENSITY.maxLengthMm / mmPerPx);
  const out = {};
  for (const zone of which) {
    const r = zoneReference(density.ref, zone);
    if (!r) continue;
    const points = LENGTH_CONTOURS[zone].map((i) => P[i]);
    const normals = outwardNormals(points, center);
    const res = silhouetteThickness({ maps: density.maps, categories, width, points, normals, r, maxPx });
    if (!Number.isFinite(res.px)) continue;
    const mm = clamp(res.px * mmPerPx, 0, DENSITY.maxLengthMm);
    out[zone] = { mm: Math.round(mm * 10) / 10, confidence: Math.round(res.valid * (categories ? 0.8 : 0.5) * 100) / 100 };
  }
  return out;
}

/** Grow-ability 0..100: weighted mean density over the zones. */
export function growabilityOf(zones, weights = GROW_WEIGHTS) {
  let s = 0;
  let w = 0;
  for (const [id, wt] of Object.entries(weights)) {
    if (!wt || !zones[id]) continue;
    s += zones[id].density * wt;
    w += wt;
  }
  return w ? Math.round(s / w) : 0;
}
