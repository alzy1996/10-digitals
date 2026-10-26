// Procedural beard textures (PRD 7.1). The beard is generated in face-texture (UV)
// space from LookParams + FaceProfile, in four layers:
//
//   1. Density map   per-zone coverage from the target length and the customer's
//                    patch map; soft or hard edges from the cheek line, neckline and
//                    mustache shapes (lines.edge: soft = feathered, crisp = tight,
//                    razor = a hard straight line); sideburn join; fade.
//   2. Strands       procedural hair strands along a growth-direction flow map (down
//                    and slightly out on the cheeks, down on the chin, outward on the
//                    mustache); strand length follows the zone length; seeded, so
//                    the same look always draws the same beard.
//   3. Colour        the treatment palette (henna.js) per strand, Lab -> linear RGB,
//                    +-6.5 % L* per strand, grey strands mixed in by the grey ratio.
//   4. Light         per-texel occlusion from strand depth and clumps, a sheen weight
//                    and the strand tangent; the renderer adds face normal . light
//                    direction and the ambient level, and the shell adds the soft
//                    shadow under the jaw for long beards.
//
// Output: two textures, each an RGBA colour raster (sRGB, straight alpha) and an
// RGBA light raster (R occlusion, G sheen weight, B tangent angle, A "kind": 0 for
// hair lying on the skin, 1 for hair standing off it or hanging):
//   face   size x size in canonical UV space (row 0 = top of the face, v = 1);
//   shell  the "beard shell" below the jaw: x = arc position along JAW_CONTOUR
//          (customer's right ear at x = 0), y = millimetres below the jaw at
//          `shell.texPerMm` texels per mm (row 0 = the jaw).
//
// Everything is plain JS on typed arrays (no canvas), cached by a params hash and
// regenerated only when the look changes, never per frame.

import { beardLayout, TEX_PER_MM, JAW_ARC_MM, JAW_U, JAW_ZONES, edgeSigmaMm, T, arcLengths, pointAtArc } from './layout.js';
import {
  createField,
  fillPolygon,
  fillCircle,
  fillStroke,
  blurField,
  sampleField,
  createStrandCanvas,
  drawStrand,
  compositeTexel,
} from './raster.js';
import { colorForTreatment, strandColor, paletteMeanLab } from './henna.js';
import { zoneCoverage, ZONES } from './timeline.js';
import { labToLinearRgb, linearToSrgb } from '../analysis/color.js';
import FINISHES from '../../data/finishes.json';
import { clamp, lerp, smoothstep, isNum, mulberry32, hash32, stableKey, valueNoise2D, fbm2, randSym, nowMs } from './util.js';

const DEG = Math.PI / 180;
export const FACE_TEX_SIZE = 1024;
/** Texture size of the fast path used for style-card thumbnails. */
export const FAST_TEX_SIZE = 384;

const LINE_DEFAULTS = Object.freeze({
  cheek: 'natural',
  cheekOffset: 0,
  neckline: '2f',
  necklineOffset: 0,
  sideburn: 'blended',
  edge: 'soft',
  mustacheEdge: 'at',
});

/** Defensive copy of a LookParams with every field the renderer reads. */
export function normalizeLook(params) {
  const p = params && typeof params === 'object' ? params : {};
  const zones = {};
  for (const z of ZONES) {
    const v = p.zones ? Number(p.zones[z]) : 0;
    zones[z] = Number.isFinite(v) && v > 0 ? Math.min(200, v) : 0;
  }
  const lines = { ...LINE_DEFAULTS };
  if (p.lines && typeof p.lines === 'object') {
    for (const k of Object.keys(LINE_DEFAULTS)) {
      const v = p.lines[k];
      if (k.endsWith('Offset')) lines[k] = isNum(v) ? clamp(v, -1, 1) : 0;
      else if (typeof v === 'string' && v) lines[k] = v;
    }
  }
  const s = p.shape && typeof p.shape === 'object' ? p.shape : {};
  const shape = {
    chin: typeof s.chin === 'string' ? s.chin : 'natural',
    jFront: s.jFront === true,
    mustacheFloating: s.mustacheFloating === true,
    fadeB: Array.isArray(s.fadeB) && s.fadeB.length === 2 ? [Number(s.fadeB[0]) || 0, Number(s.fadeB[1]) || 0] : null,
    flare: s.flare === true,
  };
  return {
    zones,
    lines,
    shape,
    mustacheId: typeof p.mustacheId === 'string' && p.mustacheId ? p.mustacheId : null,
    fadeStartMm: isNum(p.fadeStartMm) ? Math.max(0, p.fadeStartMm) : null,
    colorId: typeof p.colorId === 'string' && p.colorId ? p.colorId : 'natural',
    greyTarget: isNum(p.greyTarget) ? clamp(p.greyTarget, 0, 100) : null,
    finish: typeof p.finish === 'string' ? p.finish : 'matte',
  };
}

/** Visible (projected) strand length for a hair of length L mm. */
export function visibleLengthMm(L) {
  if (!(L > 0)) return 0;
  return Math.min(26, L * lerp(0.55, 0.85, smoothstep(3, 15, L)));
}

const OD_TABLE = [
  [0, 0],
  [0.5, 0.3],
  [1, 0.55],
  [2, 0.8],
  [4, 1.3],
  [7, 1.8],
  [10, 2.2],
  [20, 3.0],
  [40, 3.4],
];

/** Expected strand layers over the skin for a hair length (stubble shows skin). */
export function overdraw(L) {
  if (!(L > 0)) return 0;
  for (let i = 1; i < OD_TABLE.length; i++) {
    if (L <= OD_TABLE[i][0]) {
      const [x0, y0] = OD_TABLE[i - 1];
      const [x1, y1] = OD_TABLE[i];
      return lerp(y0, y1, (L - x0) / (x1 - x0));
    }
  }
  return OD_TABLE[OD_TABLE.length - 1][1];
}

// Empirical CDF of the patch noise, so a zone with coverage c shows hair on about c
// of its area.
let noiseCdf = null;
function patchThreshold(cov) {
  if (!noiseCdf) {
    const n = valueNoise2D(7);
    const f = valueNoise2D(13);
    const rnd = mulberry32(11);
    const vals = [];
    // Same mix as the patch noise in paintFace.
    for (let i = 0; i < 4096; i++) vals.push(0.8 * fbm2(n, rnd() * 200, rnd() * 200) + 0.2 * f(rnd() * 200, rnd() * 200));
    noiseCdf = vals.sort((a, b) => a - b);
  }
  const c = clamp(cov, 0, 1);
  return noiseCdf[Math.min(noiseCdf.length - 1, Math.floor(c * (noiseCdf.length - 1)))];
}

/** Growth direction (radians from straight down, + toward +x) at a texture point. */
function beardAngle(x, y, mW, mCenterX) {
  const d = x - 0.5;
  const side = d >= 0 ? 1 : -1;
  const base = side * (6 + 26 * smoothstep(0.04, 0.4, Math.abs(d))) * DEG;
  // Sideburns grow almost straight down.
  const sideburn = smoothstep(0.62, 0.5, y) * smoothstep(0.38, 0.46, Math.abs(d));
  const beard = lerp(base, side * 4 * DEG, sideburn);
  if (mW <= 0.001) return beard;
  const dm = x - mCenterX;
  const ms = dm >= 0 ? 1 : -1;
  const must = ms * (22 + 52 * smoothstep(0.0, 0.11, Math.abs(dm))) * DEG;
  return lerp(beard, must, mW);
}

/**
 * Density / length / clip fields of the face texture at R x R cells.
 * Returns { R, len, cov, spawn, clip, mW, layout, edgeSigmaMm, cellsPerMm }.
 * cov is per-zone coverage (0..1) spread over the zone; spawn is the soft shape where
 * field strands start; clip limits every strand texel (edges, lips, nose).
 */
export function faceFields(P, R, coverage) {
  const layout = beardLayout(P);
  const toR = (p) => [p[0] * R, p[1] * R];
  const cpm = TEX_PER_MM * R;
  const z = P.zones;
  const len = createField(R, R);
  const cov = createField(R, R);
  const spawn = createField(R, R);
  const clipShape = createField(R, R);
  const tmp = createField(R, R);
  const tmp2 = createField(R, R);

  const merge = (mask, lengthAt, c, toSpawn = true) => {
    const { data } = mask;
    for (let k = 0; k < data.length; k++) {
      const m = data[k];
      if (m <= 0.002) continue;
      const L = typeof lengthAt === 'function' ? lengthAt(k) : lengthAt;
      if (L <= 0.2) continue;
      if (toSpawn) {
        if (m > spawn.data[k]) spawn.data[k] = m;
        if (L > len.data[k]) len.data[k] = L;
        if (c > cov.data[k] || cov.data[k] === 0) cov.data[k] = Math.max(cov.data[k], c);
      }
      if (m > clipShape.data[k]) clipShape.data[k] = m;
    }
  };
  const fillTmp = (ring, clipRing) => {
    tmp.data.fill(0);
    fillPolygon(tmp, ring.map(toR), 1);
    if (clipRing) {
      tmp2.data.fill(0);
      fillPolygon(tmp2, clipRing.map(toR), 1);
      for (let k = 0; k < tmp.data.length; k++) tmp.data[k] *= tmp2.data[k];
    }
    return tmp;
  };

  for (const id of ['S', 'C', 'J_L', 'J_R', 'K_L', 'K_R']) {
    if (z[id] <= 0.2) continue;
    const clipRing = id === 'C' ? layout.clipC : id.startsWith('J') ? layout.clipJ : null;
    merge(fillTmp(layout.zones[id], clipRing), z[id], coverage[id]);
  }

  // Sideburns: optional fade (length from the fade start at the top to the zone
  // length at the bottom) and a soft top when blended into the head hair.
  for (const side of ['L', 'R']) {
    const id = `B_${side}`;
    if (z[id] <= 0.2) continue;
    const top = layout.bTop[side] * R;
    const bottom = layout.bBottom[side] * R;
    const fade = P.lines.sideburn === 'skin-fade' || P.shape.fadeB;
    const from = isNum(P.fadeStartMm) ? P.fadeStartMm : P.shape.fadeB ? P.shape.fadeB[0] : 0;
    const m = fillTmp(layout.zones[id]);
    if (P.lines.sideburn === 'blended') {
      for (let k = 0; k < m.data.length; k++) {
        if (m.data[k] <= 0) continue;
        const t = (Math.floor(k / R) + 0.5 - top) / Math.max(1, bottom - top);
        m.data[k] *= 0.35 + 0.65 * smoothstep(0, 0.3, t);
      }
    }
    merge(
      m,
      fade
        ? (k) => {
            const t = clamp((Math.floor(k / R) + 0.5 - top) / Math.max(1, bottom - top), 0, 1);
            return Math.max(0, lerp(Math.min(from, z[id]), z[id], t));
          }
        : z[id],
      coverage[id],
    );
  }

  // Mustache: the designed shape; the whole M zone too when the cheeks connect to it.
  let mW = null;
  const must = layout.mustache;
  if (must) {
    const mBody = createField(R, R);
    fillPolygon(mBody, must.body.map(toR), 1);
    const kOn = z.K_L > 0.2 || z.K_R > 0.2;
    if (kOn) {
      tmp.data.fill(0);
      fillPolygon(tmp, layout.zones.M.map(toR), 1);
      // Keep only the part above the mustache's lower edge.
      tmp2.data.fill(0);
      const lower = must.lower.map(toR);
      fillPolygon(tmp2, [...lower, [lower[lower.length - 1][0], R * 2], [lower[0][0], R * 2]], 1);
      for (let k = 0; k < tmp.data.length; k++) {
        const v = tmp.data[k] * (1 - tmp2.data[k]);
        if (v > mBody.data[k]) mBody.data[k] = v;
      }
    }
    merge(mBody, z.M, coverage.M);
    mW = blurField({ w: R, h: R, data: new Float32Array(mBody.data) }, 1.4 * cpm);
    for (const e of must.ends) {
      const pts = e.pts.map(toR);
      const widths = e.widths.map((w) => w * R);
      tmp.data.fill(0);
      fillStroke(tmp, pts, widths, 1);
      const field = must.def.ends === 'down-to-jaw' || must.def.ends === 'down-long';
      merge(tmp, z.M, coverage.M, field);
    }
  }

  // Circle beard connectors.
  for (const c of layout.connectors) {
    tmp.data.fill(0);
    fillStroke(tmp, c.pts.map(toR), c.width * R, 1);
    merge(tmp, Math.max(z.C, z.M), coverage.C);
  }

  // Disconnected sideburns: a skin gap between the sideburn and the beard.
  layout.sideburnGap.forEach((line, i) => {
    const side = i === 0 ? 'L' : 'R';
    if (z[`B_${side}`] > 0.2 && (z[`K_${side}`] > 0.2 || z[`J_${side}`] > 0.2)) {
      for (const f of [spawn, clipShape]) fillStroke(f, line.map(toR), 5 * cpm, 0, 'min');
    }
  });
  // Floating mustache: a skin gap at the mustache corners.
  if (P.shape.mustacheFloating && must) {
    for (const i of [57, 287]) {
      const p = T(i);
      const c = [p[0] * R + (i === 57 ? -1 : 1) * 1.5 * cpm, p[1] * R + 2.2 * cpm];
      for (const f of [spawn, clipShape]) fillCircle(f, c[0], c[1], 3.2 * cpm, 0, 'min');
    }
  }

  // Normalised blur: lengths and coverage blend across zone borders without being
  // pulled down at the outer edge.
  const nb = (field, sigma) => {
    const num = { w: R, h: R, data: new Float32Array(R * R) };
    for (let k = 0; k < num.data.length; k++) num.data[k] = field.data[k] * spawn.data[k];
    const den = { w: R, h: R, data: new Float32Array(spawn.data) };
    blurField(num, sigma);
    blurField(den, sigma);
    for (let k = 0; k < num.data.length; k++) {
      const d = den.data[k];
      field.data[k] = d > 1e-4 ? num.data[k] / d : field.data[k];
    }
  };
  nb(len, 1.8 * cpm);
  nb(cov, 2.5 * cpm);

  const sigmaMm = edgeSigmaMm(P.lines.edge);
  blurField(spawn, Math.max(0.5, sigmaMm) * cpm);
  blurField(clipShape, sigmaMm * cpm);

  // Never on the lips or the nose; a mustache over the lip may cover its top edge.
  const ex = createField(R, R);
  fillPolygon(ex, layout.lips.map(toR), 1);
  if (must && must.lipEdgeShift > 0) fillPolygon(ex, must.body.map(toR), 0, 'min');
  fillPolygon(ex, layout.nose.map(toR), 1);
  blurField(ex, 0.3 * cpm);

  const clip = clipShape;
  for (let k = 0; k < clip.data.length; k++) {
    clip.data[k] = clamp((clip.data[k] - 0.12) / 0.5, 0, 1) * (1 - ex.data[k]);
    spawn.data[k] *= 1 - ex.data[k];
  }
  return { R, len, cov, spawn, clip, mW, layout, exclude: ex, edgeSigmaMm: sigmaMm, cellsPerMm: cpm };
}

/** Upsamples an R x R field to S x S (bilinear) into a Float32Array. */
function upsample(field, S) {
  const out = new Float32Array(S * S);
  const k = field.w / S;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) out[y * S + x] = sampleField(field, (x + 0.5) * k, (y + 0.5) * k);
  }
  return out;
}

const SRGB_LUT = (() => {
  const lut = new Uint8ClampedArray(4096);
  for (let i = 0; i < 4096; i++) lut[i] = Math.round(linearToSrgb(i / 4095));
  return lut;
})();
const toSrgb8 = (lin) => SRGB_LUT[lin <= 0 ? 0 : lin >= 1 ? 4095 : Math.round(lin * 4095)];

/** Occlusion is stored as occ / OCC_RANGE so lighter locks can exceed 1. */
export const OCC_RANGE = 1.5;

/**
 * Scale that puts the median occlusion of the well-covered texels at 1, so the
 * locks vary around the chosen colour instead of darkening it (PRD 7.6: the
 * rendered mid-tone must match the swatch).
 */
function occlusionScale(cv) {
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < cv.a.length; i++) {
    const a = cv.a[i];
    if (a < 0.9) continue;
    const occ = cv.occ[i] / a;
    hist[Math.min(255, Math.max(0, Math.round((occ / OCC_RANGE) * 255)))] += 1;
    n += 1;
  }
  if (n < 50) return 1;
  let acc = 0;
  for (let b = 0; b < 256; b++) {
    acc += hist[b];
    if (acc >= n / 2) {
      const med = ((b + 0.5) / 255) * OCC_RANGE;
      return med > 0.2 ? clamp(1 / med, 0.8, 1.6) : 1;
    }
  }
  return 1;
}

/** Packs a strand canvas into colour + light RGBA rasters. */
function packCanvas(cv, bleedLin, occScale = 1) {
  const n = cv.w * cv.h;
  const color = new Uint8ClampedArray(n * 4);
  const light = new Uint8ClampedArray(n * 4);
  const br = toSrgb8(bleedLin[0]);
  const bg = toSrgb8(bleedLin[1]);
  const bb = toSrgb8(bleedLin[2]);
  for (let i = 0; i < n; i++) {
    const a = cv.a[i];
    const o = i * 4;
    if (a > 0.004) {
      const inv = 1 / a;
      color[o] = toSrgb8(cv.rgb[3 * i] * inv);
      color[o + 1] = toSrgb8(cv.rgb[3 * i + 1] * inv);
      color[o + 2] = toSrgb8(cv.rgb[3 * i + 2] * inv);
      color[o + 3] = Math.round(a * 255);
      light[o] = Math.round(clamp((cv.occ[i] * inv * occScale) / OCC_RANGE, 0, 1) * 255);
      light[o + 1] = Math.round(clamp(cv.sheen[i] * inv, 0, 1) * 255);
      const tx = cv.tan[2 * i];
      const ty = cv.tan[2 * i + 1];
      const ang = tx === 0 && ty === 0 ? 0 : Math.atan2(tx, Math.max(1e-6, ty));
      light[o + 2] = Math.round(clamp(ang / Math.PI + 0.5, 0, 1) * 255);
      light[o + 3] = Math.round(clamp(cv.kind[i] * inv, 0, 1) * 255);
    } else {
      color[o] = br;
      color[o + 1] = bg;
      color[o + 2] = bb;
      color[o + 3] = 0;
      light[o] = Math.round(255 / OCC_RANGE);
      light[o + 1] = 0;
      light[o + 2] = 128;
      light[o + 3] = 255;
    }
  }
  return { color, light };
}

/**
 * Builds a strand polyline from a root following an angle field: a little random
 * curl that fades along the strand, and an optional lateral wave (px) so long hair
 * never looks combed straight.
 */
function strandPath(x, y, lengthPx, angleAt, rnd, { jitter, curl, follow = 0.35, wave = 0 }) {
  const nseg = clamp(Math.ceil(lengthPx / 5), 1, 14);
  const step = lengthPx / nseg;
  let ang = angleAt(x, y) + jitter * randSym(rnd);
  let curv = curl * randSym(rnd);
  const pts = [[x, y]];
  let px = x;
  let py = y;
  const phase = rnd() * Math.PI * 2;
  const freq = 1.5 + 2.5 * rnd();
  for (let i = 0; i < nseg; i++) {
    px += Math.sin(ang) * step;
    py += Math.cos(ang) * step;
    const t = (i + 1) / nseg;
    const w = wave ? wave * Math.sin(phase + t * freq * Math.PI) * t : 0;
    pts.push([px + Math.cos(ang) * w, py - Math.sin(ang) * w]);
    const target = angleAt(px, py);
    ang += (target - ang) * follow + curv;
    curv *= 0.85;
  }
  return pts;
}

function strandLook(treatment, rnd, gains, sheenBase) {
  const c = strandColor(treatment, rnd(), rnd() * 2 - 1, gains);
  return { rgb: c.lin, sheen: clamp(sheenBase * (0.55 + 0.45 * rnd()), 0, 1) };
}

/**
 * Face texture: strands into an S x S canvas, then packed.
 */
function paintFace(P, fields, S, treatment, gains, rnd, finish) {
  const { R, len, cov, spawn, clip, mW, layout } = fields;
  const cv = createStrandCanvas(S, S);
  const clipS = upsample(clip, S);
  const clipFn = (px, py) => clipS[py * S + px];
  const k = R / S;
  const tpm = TEX_PER_MM * S;
  const mCenterX = layout.mustache ? layout.mustache.center[0] : 0.5;
  const angleAt = (x, y) => beardAngle(x / S, y / S, mW ? sampleField(mW, x * k, y * k) : 0, mCenterX);
  const noise = valueNoise2D(hash32('patch'));
  const fine = valueNoise2D(hash32('fine'));
  const waxed = finishEntry(finish).waxedMustache === true || !!(layout.mustache && layout.mustache.def.waxed);
  const balm = finish === 'balm';
  const mean = labToLinearRgb(paletteMeanLab(treatment)).map((c, i) => c / (gains ? gains[i] || 1 : 1));
  // Locks: brightness variation stretched along the (mostly downward) growth, so a
  // longer beard shows lighter locks and darker crevices instead of flat paint.
  const lockN = valueNoise2D(hash32('locks'));
  const lockAt = (x, y) =>
    0.6 + 0.55 * smoothstep(0.28, 0.72, fbm2(lockN, x / (1.7 * tpm), y / (5 * tpm))) + 0.3 * (fine(x / (0.7 * tpm), y / (2.2 * tpm)) - 0.5);

  // Natural growth thins toward the beard's edges over a few millimetres: a lot
  // toward a soft (scissor) edge, a little toward a trimmer line, hardly at all
  // toward a razor line (khatt), so even a sharp line-up never reads as a stencil.
  const wide = { w: R, h: R, data: new Float32Array(spawn.data) };
  blurField(wide, 4 * fields.cellsPerMm);
  const thinMin = fields.edgeSigmaMm > 1.5 ? 0.55 : fields.edgeSigmaMm > 0.5 ? 0.74 : 0.86;

  // Presence per cell: the soft shape x the patch map (hair on about `coverage` of a
  // weak zone, in natural-looking patches) x a little density noise.
  const presence = new Float32Array(R * R);
  for (let cy = 0; cy < R; cy++) {
    for (let cx = 0; cx < R; cx++) {
      const ci = cy * R + cx;
      const sp = spawn.data[ci];
      if (sp <= 0.01 || len.data[ci] <= 0.2) continue;
      const c = cov.data[ci];
      const tx = (cx + 0.5) / R;
      const ty = (cy + 0.5) / R;
      let patch = 1;
      if (c < 0.97) {
        // Weak growth thins out gradually into sparse areas with a few hairs left,
        // never into clean bald holes.
        const n = 0.8 * fbm2(noise, tx / (8 * TEX_PER_MM), ty / (8 * TEX_PER_MM)) + 0.2 * fine(tx / (2.5 * TEX_PER_MM), ty / (2.5 * TEX_PER_MM));
        const t = patchThreshold(c);
        patch = 0.12 + 0.88 * (1 - smoothstep(t - 0.09, t + 0.09, n));
      }
      const thin = lerp(thinMin, 1, smoothstep(0.45, 0.85, wide.data[ci]));
      // A little density grain (finer and weaker on stubble, where coarse blotches read
      // as paint rather than hair).
      const grain = len.data[ci] < 6 ? 0.88 + 0.24 * fine(tx * 130, ty * 130) : 0.78 + 0.44 * fine(tx * 70, ty * 70);
      presence[ci] = sp * patch * thin * grain;
    }
  }
  const presenceAt = (x, y) => {
    const fx = clamp(x * k - 0.5, 0, R - 1);
    const fy = clamp(y * k - 0.5, 0, R - 1);
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const ix1 = Math.min(R - 1, ix + 1);
    const iy1 = Math.min(R - 1, iy + 1);
    const tx = fx - ix;
    const ty = fy - iy;
    const a = presence[iy * R + ix];
    const b = presence[iy * R + ix1];
    const c = presence[iy1 * R + ix];
    const d = presence[iy1 * R + ix1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };

  // Base layer under the strands. Short hair: the faint "five o'clock" tint of hair
  // below the skin. Longer hair: a dense under-layer, deeper (darker) than the
  // strands on top, so a full beard never shows skin through it.
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const ci = Math.min(R - 1, Math.floor(y * k)) * R + Math.min(R - 1, Math.floor(x * k));
      const L = len.data[ci];
      if (L <= 0.2) continue;
      const pr = presenceAt(x, y);
      if (pr <= 0.004) continue;
      const shadow = 0.16 * smoothstep(0.3, 2.5, L) * (1 - smoothstep(5, 8, L));
      const under = 0.93 * smoothstep(4, 13, L);
      const n = fine(x / 9, y / 9);
      const a = Math.min(1, pr * clipS[y * S + x] * (shadow * (0.7 + 0.6 * n) + under * (0.9 + 0.1 * n)));
      if (a <= 0.003) continue;
      const deep = under > shadow;
      const shade = deep ? 0.86 + 0.14 * n : 0.8;
      const occ = deep ? 0.6 * lockAt(x, y) : 0.95;
      // kind: 0 for hair lying on the skin (stubble), 1 for hair standing off it.
      compositeTexel(cv, y * S + x, [mean[0] * shade, mean[1] * shade, mean[2] * shade], a, occ, 0.3, smoothstep(4, 16, L));
    }
  }

  const strands = [];
  const cellArea = (S / R) * (S / R);
  const mustCap = 9 * tpm;
  for (let cy = 0; cy < R; cy++) {
    for (let cx = 0; cx < R; cx++) {
      const ci = cy * R + cx;
      const pr = presence[ci];
      if (pr <= 0.01) continue;
      const L = len.data[ci];
      const mw = mW ? mW.data[ci] : 0;
      let vis = visibleLengthMm(L) * tpm;
      if (mw > 0) vis = lerp(vis, Math.min(vis, mustCap), clamp(mw * 1.5, 0, 1));
      const width = Math.max(0.8, (L < 5 ? 0.95 : 1.15) * (S / 1024));
      const clump = L >= 10 ? clamp(Math.round(4 + L / 6), 5, 10) : 1;
      const od = overdraw(L) * (L >= 10 ? 1.25 : 1);
      const lambda = (pr * od * cellArea) / Math.max(0.5, vis * width) / (clump === 1 ? 1 : clump * 0.6);
      let count = Math.floor(lambda);
      if (rnd() < lambda - count) count += 1;
      for (let s = 0; s < count; s++) {
        const x = (cx + rnd()) / k;
        const y = (cy + rnd()) / k;
        const depth = rnd();
        const lengthPx = vis * (0.7 + 0.6 * rnd());
        if (clump === 1) {
          const look = strandLook(treatment, rnd, gains, 1);
          const stubble = L < 5;
          const alpha = stubble ? 0.62 + 0.28 * rnd() : 0.75 + 0.2 * rnd();
          strands.push({
            depth,
            pts: strandPath(x, y, Math.max(1.2, lengthPx), angleAt, rnd, {
              jitter: (stubble ? 34 : 18) * DEG,
              curl: (stubble ? 6 : 10) * DEG,
              wave: stubble ? 0 : 0.25 * tpm,
            }),
            width,
            alpha,
            tipAlpha: alpha * (stubble ? 0.8 : 0.6),
            rgb: look.rgb,
            occ: stubble ? 0.92 + 0.08 * rnd() : (0.74 + 0.26 * depth) * lockAt(x, y) * (rnd() < 0.06 ? 1.35 : 1),
            kind: smoothstep(4, 16, L),
            sheen: look.sheen,
          });
        } else {
          const guide = strandPath(x, y, lengthPx, angleAt, rnd, {
            jitter: (balm ? 9 : 15) * DEG,
            curl: (balm ? 7 : 14) * DEG,
            follow: 0.28,
            wave: (balm ? 0.3 : 0.7) * tpm,
          });
          const radius = (0.8 + 1.0 * rnd()) * tpm * (balm ? 0.75 : 1);
          for (let f = 0; f < clump; f++) {
            const off = (rnd() * 2 - 1) * radius;
            const lenScale = 0.75 + 0.4 * rnd();
            const wob = 0.25 * tpm * randSym(rnd);
            const pts = [];
            const last = Math.max(1, Math.round((guide.length - 1) * lenScale));
            for (let i = 0; i <= Math.min(last, guide.length - 1); i++) {
              const a = guide[Math.max(0, i - 1)];
              const b = guide[Math.min(guide.length - 1, i + 1)];
              let nx = -(b[1] - a[1]);
              let ny = b[0] - a[0];
              const nl = Math.hypot(nx, ny) || 1;
              nx /= nl;
              ny /= nl;
              const t = i / Math.max(1, guide.length - 1);
              const o = off * (1 - 0.3 * t) + wob * Math.sin(t * 5 + f);
              pts.push([guide[i][0] + nx * o, guide[i][1] + ny * o]);
            }
            if (pts.length < 2) continue;
            const look = strandLook(treatment, rnd, gains, 1);
            const centre = 1 - Math.min(1, Math.abs(off) / Math.max(1e-6, radius));
            const alpha = 0.78 + 0.18 * rnd();
            strands.push({
              depth: depth + 0.001 * centre,
              pts,
              width,
              alpha,
              tipAlpha: alpha * 0.6,
              rgb: look.rgb,
              occ: (0.68 + 0.16 * depth + 0.16 * centre) * lockAt(x, y) * (rnd() < 0.06 ? 1.35 : 1),
              kind: smoothstep(4, 16, L),
              sheen: look.sheen,
            });
          }
        }
      }
    }
  }

  // Waxed or styled mustache ends: strands along the end path, tight.
  const must = layout.mustache;
  if (must && P.zones.M > 0.2) {
    const fieldEnds = must.def.ends === 'down-to-jaw' || must.def.ends === 'down-long';
    for (const e of fieldEnds ? [] : must.ends) {
      const path = e.pts.map((p) => [p[0] * S, p[1] * S]);
      const widths = e.widths.map((w) => w * S);
      let total = 0;
      for (let i = 1; i < path.length; i++) total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      const avgW = widths.reduce((a, b) => a + b, 0) / widths.length;
      const n = Math.round((total * avgW * 3.2) / Math.max(1, total * 0.45 * 1.1));
      const cum = [0];
      for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
      const at = (s) => {
        for (let i = 1; i < path.length; i++) {
          if (s <= cum[i]) {
            const t = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
            const a = path[i - 1];
            const b = path[i];
            const w = lerp(widths[i - 1], widths[i], t);
            const tx = (b[0] - a[0]) / Math.max(1e-6, cum[i] - cum[i - 1]);
            const ty = (b[1] - a[1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
            return { p: [lerp(a[0], b[0], t), lerp(a[1], b[1], t)], n: [-ty, tx], w };
          }
        }
        const a = path[path.length - 2];
        const b = path[path.length - 1];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        return { p: b, n: [-(b[1] - a[1]) / l, (b[0] - a[0]) / l], w: widths[widths.length - 1] };
      };
      for (let s = 0; s < n; s++) {
        const s0 = rnd() * total * 0.6;
        const s1 = Math.min(total, s0 + total * (0.3 + 0.45 * rnd()));
        const off = randSym(rnd) * 0.45;
        const pts = [];
        const steps = Math.max(2, Math.ceil((s1 - s0) / 4));
        for (let i = 0; i <= steps; i++) {
          const q = at(s0 + ((s1 - s0) * i) / steps);
          const o = off * q.w;
          pts.push([q.p[0] + q.n[0] * o, q.p[1] + q.n[1] * o]);
        }
        const look = strandLook(treatment, rnd, gains, waxed ? 1 : 0.7);
        strands.push({
          depth: 0.5 + 0.5 * rnd(),
          pts,
          width: Math.max(0.8, 1.1 * (S / 1024)),
          alpha: 0.85,
          tipAlpha: 0.6,
          rgb: look.rgb,
          occ: 0.8 + 0.2 * rnd(),
          sheen: look.sheen,
        });
      }
    }
  }

  strands.sort((a, b) => a.depth - b.depth);
  for (const s of strands) drawStrand(cv, s, clipFn);
  return { cv, strands: strands.length, mean };
}

/* ------------------------------------------------------------------------ */
/* Shell (below the jaw)                                                     */
/* ------------------------------------------------------------------------ */

const NECK_DEPTH_MM = Object.freeze({ '1f': 34, '2f': 20, jaw: 6, squared: 20 });
const NECK_SIDE = 0.6;
const GONION_U = Object.freeze({ R: JAW_U[4], L: JAW_U[16] });
const EAR_U = Object.freeze({ R: JAW_U[2], L: JAW_U[18] });

/**
 * Neckline depth below the jaw (mm) at jaw arc position u (0 at the customer's right ear,
 * 1 at the left), for a neckline type and lines.necklineOffset (+ raises the line toward
 * the jaw): the full depth across the front of the neck between the jaw angles, tapering
 * to 0 at the ears (the squared neckline keeps more of it at the sides).
 */
export function neckDepthMm(neckType, offset, u) {
  const off = Number(offset) || 0;
  const base = Math.max(3, (NECK_DEPTH_MM[neckType] || 20) - 10 * off);
  let prof;
  if (u >= GONION_U.R && u <= GONION_U.L) {
    const t = (u - GONION_U.R) / (GONION_U.L - GONION_U.R);
    prof = neckType === 'squared' ? 1 - 0.35 * smoothstep(0.1, 0.0, Math.min(t, 1 - t)) : NECK_SIDE + (1 - NECK_SIDE) * Math.sin(Math.PI * t);
  } else {
    const t = u < GONION_U.R ? (u - EAR_U.R) / (GONION_U.R - EAR_U.R) : (EAR_U.L - u) / (EAR_U.L - GONION_U.L);
    prof = (neckType === 'squared' ? 0.65 : NECK_SIDE) * smoothstep(0, 1, clamp(t, 0, 1));
  }
  return base * prof;
}

/** Value of a per-jaw-point array at arc position u (linear). */
function atJawU(values, u) {
  if (u <= JAW_U[0]) return values[0];
  for (let i = 1; i < JAW_U.length; i++) {
    if (u <= JAW_U[i]) return lerp(values[i - 1], values[i], (u - JAW_U[i - 1]) / (JAW_U[i] - JAW_U[i - 1]));
  }
  return values[values.length - 1];
}

function blur1d(arr, sigma) {
  if (!(sigma > 0.5)) return arr;
  const f = { w: arr.length, h: 1, data: Float32Array.from(arr) };
  blurField(f, sigma);
  return f.data;
}

/** Hang profile multiplier across the jaw for a chin shape (x = -1 right ear .. 1 left ear). */
function chinShapeFactor(chin, x) {
  const a = Math.abs(x);
  switch (chin) {
    case 'pointed':
      return 0.55 + 0.75 * Math.pow(clamp(1 - a / 0.55, 0, 1), 1.6);
    case 'flat':
      return 1.08 - 0.5 * smoothstep(0.42, 0.6, a);
    case 'round':
      return 0.8 + 0.25 * Math.cos(clamp(a / 0.6, 0, 1) * Math.PI * 0.5);
    case 'wide-round':
      return 1.05 - 0.3 * smoothstep(0.55, 0.85, a);
    case 'split':
      return 0.55 + 0.75 * Math.exp(-((a - 0.13) ** 2) / 0.004);
    case 'braided':
      return 0.4 + 1.1 * Math.exp(-(a * a) / 0.0035);
    default:
      return 1;
  }
}

/**
 * Per-column profile of the shell: zone length, coverage, hang below the jaw and
 * neck depth (mm), for SW columns along the jaw.
 */
export function shellColumns(P, coverage, SW, layout, fields = null) {
  const tpm = SW / JAW_ARC_MM;
  const zoneLen = new Float32Array(SW);
  const cov = new Float32Array(SW);
  if (fields) {
    // Read the face beard just inside the jaw line, so the shell starts exactly where
    // and as the face texture ends (clips, gaps and patches included).
    const jaw = fields.layout.jaw.pts;
    const cum = arcLengths(jaw);
    const total = cum[cum.length - 1];
    const R = fields.R;
    const inset = 2.5 * TEX_PER_MM;
    for (let x = 0; x < SW; x++) {
      const p = pointAtArc(jaw, cum, ((x + 0.5) / SW) * total);
      const dx = 0.5 - p[0];
      const dy = 0.45 - p[1];
      const l = Math.hypot(dx, dy) || 1;
      const q = [(p[0] + (dx / l) * inset) * R, (p[1] + (dy / l) * inset) * R];
      const sp = sampleField(fields.spawn, q[0], q[1]);
      zoneLen[x] = sampleField(fields.len, q[0], q[1]) * clamp(sp / 0.35, 0, 1);
      cov[x] = sp > 0.02 ? sampleField(fields.cov, q[0], q[1]) : 0;
    }
  } else {
    const lensAt = JAW_ZONES.map((zid) => P.zones[zid] || 0);
    const covAt = JAW_ZONES.map((zid) => (coverage[zid] === undefined ? 1 : coverage[zid]));
    for (let x = 0; x < SW; x++) {
      const u = (x + 0.5) / SW;
      zoneLen[x] = atJawU(lensAt, u);
      cov[x] = atJawU(covAt, u);
    }
  }
  const zl = blur1d(zoneLen, 1.5 * tpm);
  const cv = blur1d(cov, 1.5 * tpm);
  const hang = new Float32Array(SW);
  const neck = new Float32Array(SW);
  const N = P.zones.N;
  const neckType = P.lines.neckline;
  // The chin shape (round, pointed, flat and so on) is drawn across the beard's own width:
  // the whole jaw for a full beard, the chin for a goatee.
  let lo = -1;
  let hi = -1;
  for (let x = 0; x < SW; x++) {
    if (zl[x] > 0.5) {
      if (lo < 0) lo = x;
      hi = x;
    }
  }
  const spanC = lo >= 0 ? (lo + hi + 1) / 2 / SW : 0.5;
  const spanH = lo >= 0 ? Math.max(0.02, (hi - lo + 1) / 2 / SW) : 0.5;
  for (let x = 0; x < SW; x++) {
    const u = (x + 0.5) / SW;
    const d = Math.abs(u - 0.5);
    let L = zl[x];
    if (P.shape.jFront) L *= 1 - smoothstep(0.17, 0.21, d);
    if (P.shape.chin === 'strip') L *= 1 - smoothstep(0.03, 0.05, d);
    const hf = d < 0.15 ? lerp(0.82, 0.7, d / 0.15) : d < 0.3 ? lerp(0.7, 0.5, (d - 0.15) / 0.15) : d < 0.42 ? lerp(0.5, 0.3, (d - 0.3) / 0.12) : lerp(0.3, 0.15, clamp((d - 0.42) / 0.08, 0, 1));
    const shortScale = lerp(0.3, 1, smoothstep(2, 6, L));
    const sx = clamp((u - spanC) / spanH, -1, 1);
    // Round off the ends of a short span (a goatee is not a box).
    const ends = spanH < 0.3 ? 0.45 + 0.55 * Math.sqrt(Math.max(0, 1 - sx * sx)) : 1;
    hang[x] = L * hf * shortScale * chinShapeFactor(P.shape.chin, sx) * ends;
    if (N > 0.2) neck[x] = neckDepthMm(neckType, P.lines.necklineOffset, u);
  }
  const tails = layout && layout.mustache ? layout.mustache.tails : [];
  const tailCols = tails.map((tx) => {
    // Texture x of the mustache tail -> nearest jaw column.
    let best = 0;
    let bestD = Infinity;
    layout.jaw.pts.forEach((p, i) => {
      const dd = Math.abs(p[0] - tx);
      if (i > 2 && i < 18 && dd < bestD) {
        bestD = dd;
        best = i;
      }
    });
    return JAW_U[best] * SW;
  });
  let maxMm = 0;
  for (let x = 0; x < SW; x++) {
    const shadow = hang[x] >= 12 ? 11 : 0;
    maxMm = Math.max(maxMm, hang[x] * 1.12 + 2 + shadow, neck[x] + 3);
  }
  if (tailCols.length && P.zones.M > 0.2) maxMm = Math.max(maxMm, 58);
  return { tpm, zoneLen: zl, cov: cv, hang, neck, tailCols, lengthMm: maxMm };
}

function paintShell(P, cols, SW, treatment, gains, rnd) {
  const { tpm, hang, neck, cov, tailCols } = cols;
  const SH = clamp(Math.ceil(cols.lengthMm * tpm), 8, 1024);
  const cv = createStrandCanvas(SW, SH);
  const N = P.zones.N;
  const sigma = edgeSigmaMm(P.lines.edge) * tpm;
  const fine = valueNoise2D(hash32('shell-fine'));
  const lockN = valueNoise2D(hash32('shell-locks'));
  const lockAt = (x, y) => 0.72 + 0.56 * smoothstep(0.28, 0.72, fbm2(lockN, x / (1.6 * tpm), y / (6 * tpm)));
  // Ragged tips: the hanging length varies a little along the jaw.
  const tipAt = (x) => 0.86 + 0.14 * fine(x / (3 * tpm), 3.7);

  // Neck region mask with the neckline edge, and the hanging-beard region.
  const neckMask = createField(SW, SH);
  const hangMask = createField(SW, SH);
  const neckPoly = [];
  const hangPoly = [];
  for (let x = 0; x <= SW; x += 2) {
    const xi = Math.min(SW - 1, x);
    neckPoly.push([x, neck[xi] * tpm]);
    hangPoly.push([x, (hang[xi] * 1.12 + 1.5) * tpm]);
  }
  fillPolygon(neckMask, [[0, -4], [SW, -4], ...neckPoly.slice().reverse()], 1);
  fillPolygon(hangMask, [[0, -4], [SW, -4], ...hangPoly.slice().reverse()], 1);
  blurField(neckMask, sigma);
  blurField(hangMask, 1.5 * tpm);
  const clip = new Float32Array(SW * SH);
  for (let i = 0; i < clip.length; i++) {
    clip[i] = Math.max(clamp((neckMask.data[i] - 0.12) / 0.5, 0, 1), hangMask.data[i]);
  }
  const clipFn = (px, py) => clip[py * SW + px];
  const mean = labToLinearRgb(paletteMeanLab(treatment)).map((c, i) => c / (gains ? gains[i] || 1 : 1));
  const deep = mean.map((c) => c * 0.86);

  // Soft shadow under long beards, on the neck and collar below the tips.
  for (let x = 0; x < SW; x++) {
    const h = hang[x];
    if (h < 12) continue;
    const strength = 0.3 * smoothstep(12, 26, h) * cov[x];
    const y0 = Math.floor(h * 0.85 * tpm);
    const y1 = Math.min(SH - 1, Math.ceil((h + 11) * tpm));
    for (let y = y0; y <= y1; y++) {
      const mm = y / tpm;
      const a = strength * (mm < h ? smoothstep(h * 0.85, h, mm) : 1 - smoothstep(h, h + 11, mm));
      if (a > 0.003) compositeTexel(cv, y * SW + x, [0, 0, 0], a, 0.35, 0, 1);
    }
  }

  // Under-layers: neck hair lying on the skin (kind 0) and the body of a hanging beard
  // (kind 1), so neither shows skin or collar through it.
  for (let x = 0; x < SW; x++) {
    const h = hang[x] * tipAt(x);
    const c = cov[x];
    for (let y = 0; y < SH; y++) {
      const mm = y / tpm;
      const i = y * SW + x;
      const n = fine(x / 9, y / 9);
      if (N > 0.2) {
        const m = neckMask.data[i];
        if (m > 0.01) {
          const shadow = 0.16 * smoothstep(0.3, 2.5, N) * (1 - smoothstep(5, 8, N));
          const under = 0.9 * smoothstep(4, 13, N);
          const a = Math.min(1, m * c * (shadow * (0.7 + 0.6 * n) + under * (0.9 + 0.1 * n)));
          // Darker just under the jaw: the soft shadow of the jaw on the neck.
          const occ = (under > shadow ? 0.55 : 0.85) * (0.8 + 0.2 * smoothstep(0, 15, mm));
          if (a > 0.003) compositeTexel(cv, i, deep, a, occ, 0.2, 0);
        }
      }
      if (h >= 1.2) {
        // Opaque at the jaw (it continues the beard on the face), thinning to the tips;
        // like the face, only beards long enough to hide the skin get this layer.
        const body = smoothstep(4, 13, cols.zoneLen[x]);
        const a = 0.94 * c * body * smoothstep(1, 4, hang[x]) * (1 - smoothstep(h * 0.62, h * 0.86, mm));
        if (a > 0.003) compositeTexel(cv, i, deep, a, 0.58 * lockAt(x, y), 0.3, 1);
      }
    }
  }

  const strands = [];
  const width = Math.max(0.8, 1.15 * (SW / 1024));
  const side = (x) => (x / SW < 0.5 ? -1 : 1);
  // Neck hair: short strands pointing down, darker just under the jaw.
  if (N > 0.2) {
    const vis = visibleLengthMm(Math.min(N, 26)) * tpm;
    const od = overdraw(Math.min(N, 14));
    const angleAt = (x) => side(x) * 12 * DEG * smoothstep(0, 0.4, Math.abs(x / SW - 0.5));
    for (let y = 0; y < SH; y += 2) {
      for (let x = 0; x < SW; x += 2) {
        const m = neckMask.data[y * SW + x];
        if (m <= 0.02) continue;
        // Fade in over the first 2 mm: the face's strands already cross the jaw line.
        const lambda = (m * cov[x] * od * 4 * smoothstep(0, 2 * tpm, y)) / Math.max(0.5, vis * width);
        let count = Math.floor(lambda);
        if (rnd() < lambda - count) count += 1;
        for (let s = 0; s < count; s++) {
          const px = x + 2 * rnd();
          const py = y + 2 * rnd();
          const look = strandLook(treatment, rnd, gains, 0.6);
          const stubble = N < 5;
          const alpha = stubble ? 0.55 + 0.3 * rnd() : 0.75 + 0.2 * rnd();
          strands.push({
            depth: rnd() * 0.5,
            pts: strandPath(px, py, Math.max(1.2, vis * (0.7 + 0.6 * rnd())), () => angleAt(px), rnd, {
              jitter: (stubble ? 30 : 16) * DEG,
              curl: (stubble ? 6 : 10) * DEG,
              wave: stubble ? 0 : 0.4 * tpm,
            }),
            width,
            alpha,
            tipAlpha: alpha * (stubble ? 0.8 : 0.4),
            rgb: look.rgb,
            occ: (0.72 + 0.2 * smoothstep(0, 15 * tpm, py)) * (stubble ? 1 : lockAt(px, py)),
            sheen: look.sheen,
            kind: 0,
          });
        }
      }
    }
  }

  // Hanging beard: long strands from the jaw to ragged tips, in loose clumps. Short
  // beards only stick out a little past the jaw, at the face's own (thin) density,
  // so the seam never reads as a dark line.
  const flare = P.shape.flare;
  const crisp = edgeSigmaMm(P.lines.edge) < 1;
  for (let x = 0; x < SW; x++) {
    const h = hang[x];
    if (h < 0.6) continue;
    const L = cols.zoneLen[x];
    const stubble = L < 5;
    const dens = clamp(overdraw(L) / 3, 0.25, 1);
    const hPx = h * tpm * tipAt(x);
    const clump = h > 14 ? 5 : h > 6 ? 3 : 1;
    const lambda = (cov[x] * 4.2 * dens) / (0.85 * width) / (clump === 1 ? 1 : clump * 0.65);
    let count = Math.floor(lambda);
    if (rnd() < lambda - count) count += 1;
    for (let s = 0; s < count; s++) {
      const x0 = x + rnd();
      const y0 = -1.5 + rnd() * rnd() * 0.35 * hPx;
      const tip = hPx * (crisp ? 0.95 + 0.1 * rnd() : 0.82 + 0.28 * rnd());
      const sway = (0.6 + 1.8 * rnd()) * tpm * smoothstep(4, 30, h);
      const lean = (flare ? 0.32 : 0.08) * side(x0) * smoothstep(0.08, 0.35, Math.abs(x0 / SW - 0.5)) + 0.07 * randSym(rnd);
      const phase = rnd() * Math.PI * 2;
      const freq = 2 + 2.5 * rnd();
      const depth = rnd();
      const radius = (0.7 + 1.0 * rnd()) * tpm;
      const lock = lockAt(x0, 0.5 * (y0 + tip));
      for (let f = 0; f < clump; f++) {
        const off = clump > 1 ? (rnd() * 2 - 1) * radius : 0;
        const tipF = tip * (clump > 1 ? 0.8 + 0.3 * rnd() : 1);
        const segs = clamp(Math.ceil((tipF - y0) / 6), 2, 24);
        const pts = [];
        for (let i = 0; i <= segs; i++) {
          const t = i / segs;
          const yy = y0 + (tipF - y0) * t;
          const xx = x0 + off * (1 - 0.35 * t) + lean * (yy - y0) + sway * Math.sin(phase + t * freq);
          pts.push([xx, yy]);
        }
        const look = strandLook(treatment, rnd, gains, 1);
        const centre = clump > 1 ? 1 - Math.min(1, Math.abs(off) / radius) : 0.5;
        const alpha = stubble ? 0.55 + 0.3 * rnd() : 0.8 + 0.16 * rnd();
        strands.push({
          depth: 0.5 + 0.5 * depth + 0.001 * centre,
          pts,
          width,
          alpha,
          tipAlpha: alpha * (stubble ? 0.8 : 0.7),
          rgb: look.rgb,
          occ: (0.7 + 0.16 * depth + 0.14 * centre) * lock * (rnd() < 0.06 ? 1.35 : 1),
          sheen: look.sheen,
          kind: 1,
        });
      }
    }
  }

  // Fu Manchu tails: thin bundles hanging from the mouth corners.
  for (const tx of tailCols) {
    const n = 46;
    for (let s = 0; s < n; s++) {
      const x0 = tx + randSym(rnd) * 1.4 * tpm;
      const yEnd = (50 + 8 * rnd()) * tpm;
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        pts.push([x0 + (tx - x0) * 0.5 * t + 0.6 * tpm * Math.sin(t * 4 + s), -1 + yEnd * t]);
      }
      const look = strandLook(treatment, rnd, gains, 1);
      strands.push({ depth: 0.9 + 0.1 * rnd(), pts, width, alpha: 0.85, tipAlpha: 0.3, rgb: look.rgb, occ: 0.85, sheen: look.sheen, kind: 1 });
    }
  }

  strands.sort((a, b) => a.depth - b.depth);
  for (const s of strands) drawStrand(cv, s, tailCols.length ? null : clipFn);
  return { cv, SH, strands: strands.length, mean };
}

/* ------------------------------------------------------------------------ */
/* Public API                                                                */
/* ------------------------------------------------------------------------ */

const DEFAULT_FINISHES = Object.freeze({
  matte: { id: 'matte', sheen: 0.05, waxedMustache: false },
  oiled: { id: 'oiled', sheen: 0.45, waxedMustache: false },
  balm: { id: 'balm', sheen: 0.25, waxedMustache: false },
  waxed: { id: 'waxed', sheen: 0.3, waxedMustache: true },
});

/** Finish by id from finishes.json, with defaults for missing fields or ids. */
export function finishEntry(id) {
  const base = DEFAULT_FINISHES[id] || DEFAULT_FINISHES.matte;
  const f = Array.isArray(FINISHES) ? FINISHES.find((x) => x && x.id === id) : null;
  if (!f) return base;
  return {
    id: f.id,
    sheen: isNum(f.sheen) ? clamp(f.sheen, 0, 1) : base.sheen,
    waxedMustache: typeof f.waxedMustache === 'boolean' ? f.waxedMustache : base.waxedMustache,
  };
}

/** Sheen strength (0..1) of a finish id. */
export function finishSheen(finish) {
  return finishEntry(finish).sheen;
}

/** True when any zone has hair to draw. */
export function hasBeard(params) {
  const P = params && params.zones && typeof params.lines === 'object' && params.shape ? params : normalizeLook(params);
  return ZONES.some((z) => P.zones[z] > 0.2);
}

/** True when the shell (below the jaw) has anything to draw for these columns. */
function shellNeeded(P, cols) {
  if (cols.tailCols.length && P.zones.M > 0.2) return true;
  for (let x = 0; x < cols.hang.length; x++) {
    if (cols.hang[x] >= 0.6 || cols.neck[x] > 0.5) return true;
  }
  return false;
}

/** Cache key of a texture request. */
export function textureKey(params, profile, opts = {}) {
  const P = normalizeLook(params);
  const beard = profile && profile.beard ? profile.beard : null;
  return stableKey({
    P,
    cov: opts.coverage || null,
    size: opts.size || FACE_TEX_SIZE,
    day: opts.day || 1,
    gains: opts.gains || (profile && profile.calibration ? profile.calibration.gains : null),
    beard: beard ? { zones: beard.zones, greyRatio: beard.greyRatio, colorLab: beard.colorLab, colorId: beard.colorId } : null,
    seed: opts.seed || 0,
    quality: opts.quality === 'fast' ? 'fast' : 'full',
  });
}

/**
 * Generates the face and shell textures for a look.
 *
 * @param {object} params LookParams
 * @param {object|null} profile FaceProfile (patch map, natural colour, grey ratio, gains)
 * @param {object} [opts]
 * @param {number} [opts.size=1024] face texture size (FAST_TEX_SIZE for thumbnails)
 * @param {Record<string, number>} [opts.coverage] per-zone coverage override (timeline)
 * @param {number} [opts.day=1] henna day
 * @param {number[]} [opts.gains] white-card gains (default: the profile's)
 * @param {number} [opts.seed] PRNG seed (default: derived from the params)
 * @param {'full'|'fast'} [opts.quality='full'] 'fast': density fields at a third of
 *   the texture size instead of half (style-card thumbnails)
 * @returns {{ key, face: { width, height, color, light }, shell: { width, height, color,
 *   light, lengthMm, texPerMm, hangMm: Float32Array, neckMm: Float32Array } | null,
 *   treatment, sheen, ms }}
 */
export function generateBeardTextures(params, profile, opts = {}) {
  const t0 = nowMs();
  const P = normalizeLook(params);
  const S = opts.size || FACE_TEX_SIZE;
  const fast = opts.quality === 'fast';
  // Density fields at half the texture size (a third on the fast path).
  const R = Math.max(64, Math.round(S / (fast ? 3 : 2)));
  const coverage = opts.coverage || zoneCoverage(P.zones, profile);
  const gains = opts.gains || (profile && profile.calibration && Array.isArray(profile.calibration.gains) ? profile.calibration.gains : null);
  const treatment = colorForTreatment(P.colorId, { profile, greyTarget: P.greyTarget, day: opts.day || 1 });
  const key = textureKey(params, profile, opts);
  if (!hasBeard(P)) {
    // Clean shave: nothing to draw (a tiny transparent texture, no shell).
    const n = 4 * 4 * 4;
    return {
      key,
      face: { width: 4, height: 4, color: new Uint8ClampedArray(n), light: new Uint8ClampedArray(n) },
      shell: null,
      treatment,
      sheen: finishSheen(P.finish),
      strands: 0,
      timings: {},
      ms: Math.round(nowMs() - t0),
      empty: true,
    };
  }
  const seed = isNum(opts.seed) ? opts.seed : hash32(key);
  const rnd = mulberry32(seed);

  const timings = {};
  let tl = nowMs();
  const lap = (name) => {
    const t = nowMs();
    timings[name] = Math.round(t - tl);
    tl = t;
  };
  const fields = faceFields(P, R, coverage);
  lap('fields');
  const face = paintFace(P, fields, S, treatment, gains, rnd, P.finish);
  lap('face');
  const occScale = occlusionScale(face.cv);
  const packedFace = packCanvas(face.cv, face.mean, occScale);
  lap('pack');

  const SW = S;
  const cols = shellColumns(P, coverage, SW, fields.layout, fields);
  let shell = null;
  if (shellNeeded(P, cols)) {
    const painted = paintShell(P, cols, SW, treatment, gains, rnd);
    const packed = packCanvas(painted.cv, painted.mean, occScale);
    shell = {
      width: SW,
      height: painted.SH,
      color: packed.color,
      light: packed.light,
      lengthMm: painted.SH / cols.tpm,
      texPerMm: cols.tpm,
      hangMm: cols.hang,
      neckMm: cols.neck,
    };
  }
  lap('shell');
  return {
    key,
    face: { width: S, height: S, color: packedFace.color, light: packedFace.light },
    shell,
    treatment,
    sheen: finishSheen(P.finish),
    strands: face.strands,
    timings,
    ms: Math.round(nowMs() - t0),
  };
}

const CACHE_MAX = 8;
const cache = new Map();

/** generateBeardTextures with an LRU cache keyed by the params hash. */
export function getBeardTextures(params, profile, opts = {}) {
  const key = textureKey(params, profile, opts);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const tex = generateBeardTextures(params, profile, opts);
  cache.set(key, tex);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return tex;
}

/** Drops every cached texture (for example after the session is wiped). */
export function clearTextureCache() {
  cache.clear();
}
