// Line guides for the Studio (PRD 7.1, 7.2, 9.5): where a look's cheek lines, its
// neckline and the jaw sit on a still shot, in the shot's own pixels (un-mirrored,
// y down), the way Photo Studio draws them.
//
//   cheek lines  the texture-space lines of layout.js (cheekLine, the edge of the K
//                zones in the beard texture), carried onto the photo through the face
//                mesh: each point is located in its canonical-UV triangle and placed at
//                the same barycentric spot of that triangle's landmarks (what the GPU
//                does when it draws the textured mesh).
//   neckline     the shell's neck depth (beardTextures.js neckDepthMm) laid below the
//                projected jaw along the shell's outward direction, at the frame's
//                mm-per-pixel scale (frame.js frameMmPerPx, as the renderer uses).
//   jaw          JAW_CONTOUR on the photo, its outward directions and zones, for the
//                barber's ruler.
//
// `track` samples each drag handle's position over the whole offset range (-1..1, in
// OFFSET_STEP steps), so the Studio can pick the offset nearest the finger.

import { TRIANGLES } from '../mesh/tessellation.js';
import { CHIN_BOTTOM, FOREHEAD_TOP, JAW_CONTOUR, polylineNormals2D } from '../mesh/zones.js';
import { T, cheekLine, arcLengths, pointAtArc, JAW_U, JAW_ZONES } from './layout.js';
import { neckDepthMm, normalizeLook } from './beardTextures.js';
import { frameMmPerPx } from './frame.js';
import { clamp } from './util.js';
import LINES from '../../data/lines.json';

/** Offset step of the handles and their tracks (the Studio sliders use the same). */
export const OFFSET_STEP = 0.05;
const STEPS = Math.round(2 / OFFSET_STEP);
/** Chin point of JAW_CONTOUR (landmark 152): the neckline handle sits below it. */
const CHIN_K = JAW_CONTOUR.indexOf(CHIN_BOTTOM);
/** Jaw points the neckline runs between (ear to ear, where its depth is above 0). */
const NECK_FROM = 2;
const NECK_TO = JAW_CONTOUR.length - 3;

const NECK_OPTIONS = new Map(
  ((LINES && LINES.types) || []).filter((tp) => tp.id === 'neckline').flatMap((tp) => tp.options.map((o) => [o.id, o])),
);

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const scale = (a, s) => [a[0] * s, a[1] * s];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / l, a[1] / l];
};

/* ------------------------------------------------------------ texture -> photo */

const GRID = 32;
let triIndex = null;

/** Triangles in texture space (layout coordinates, y down), binned on a GRID x GRID grid. */
function triangles() {
  if (triIndex) return triIndex;
  const count = TRIANGLES.length / 3;
  const pts = new Float64Array(count * 6);
  const cells = Array.from({ length: GRID * GRID }, () => []);
  const cell = (v) => clamp(Math.floor(v * GRID), 0, GRID - 1);
  for (let t = 0; t < count; t++) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let c = 0; c < 3; c++) {
      const p = T(TRIANGLES[3 * t + c]);
      pts[6 * t + 2 * c] = p[0];
      pts[6 * t + 2 * c + 1] = p[1];
      x0 = Math.min(x0, p[0]);
      x1 = Math.max(x1, p[0]);
      y0 = Math.min(y0, p[1]);
      y1 = Math.max(y1, p[1]);
    }
    for (let gy = cell(y0); gy <= cell(y1); gy++) for (let gx = cell(x0); gx <= cell(x1); gx++) cells[gy * GRID + gx].push(t);
  }
  triIndex = { count, pts, cells };
  return triIndex;
}

/** Barycentric weights of p in triangle t (null when the triangle is degenerate). */
function weights(idx, t, p) {
  const o = 6 * t;
  const ax = idx.pts[o];
  const ay = idx.pts[o + 1];
  const v0x = idx.pts[o + 2] - ax;
  const v0y = idx.pts[o + 3] - ay;
  const v1x = idx.pts[o + 4] - ax;
  const v1y = idx.pts[o + 5] - ay;
  const d = v0x * v1y - v1x * v0y;
  if (Math.abs(d) < 1e-14) return null;
  const v2x = p[0] - ax;
  const v2y = p[1] - ay;
  const wb = (v2x * v1y - v1x * v2y) / d;
  const wc = (v0x * v2y - v2x * v0y) / d;
  return [1 - wb - wc, wb, wc];
}

/**
 * The canonical-mesh triangle holding texture point p and p's barycentric weights in
 * it. A point just outside the mesh takes the nearest triangle (weights extrapolated).
 */
export function locateInMesh(p) {
  const idx = triangles();
  const gx = clamp(Math.floor(p[0] * GRID), 0, GRID - 1);
  const gy = clamp(Math.floor(p[1] * GRID), 0, GRID - 1);
  let best = null;
  let bestMin = -Infinity;
  const consider = (t) => {
    const w = weights(idx, t, p);
    if (!w) return false;
    const m = Math.min(w[0], w[1], w[2]);
    if (m > bestMin) {
      bestMin = m;
      best = { tri: t, w };
    }
    return m >= -1e-9;
  };
  for (const t of idx.cells[gy * GRID + gx]) if (consider(t)) return best;
  for (let t = 0; t < idx.count; t++) if (consider(t)) return best;
  return best;
}

/** Texture point p on the photo: pixel position from the shot's landmarks (P(i) -> [x, y]). */
function toPhoto(p, P) {
  const hit = locateInMesh(p);
  if (!hit) return null;
  const o = 3 * hit.tri;
  const a = P(TRIANGLES[o]);
  const b = P(TRIANGLES[o + 1]);
  const c = P(TRIANGLES[o + 2]);
  const [wa, wb, wc] = hit.w;
  return [wa * a[0] + wb * b[0] + wc * c[0], wa * a[1] + wb * b[1] + wc * c[1]];
}

/** Point halfway along a polyline (by arc length). */
function midpoint(poly) {
  const cum = arcLengths(poly);
  return pointAtArc(poly, cum, cum[cum.length - 1] / 2);
}

/* ------------------------------------------------------------ guides */

function shotSize(shot) {
  const c = shot.canvas;
  return [Number(shot.width) || (c && c.width) || 0, Number(shot.height) || (c && c.height) || 0];
}

/** Offsets -1..1 in OFFSET_STEP steps. */
function offsets() {
  return Array.from({ length: STEPS + 1 }, (_, i) => Math.round((-1 + i * OFFSET_STEP) * 1000) / 1000);
}

// Handle tracks depend only on the shot and the line type; kept per shot.
const trackCache = new WeakMap();
function cachedTrack(shot, key, make) {
  let m = trackCache.get(shot);
  if (!m) {
    m = new Map();
    trackCache.set(shot, m);
  }
  if (!m.has(key)) m.set(key, make());
  return m.get(key);
}

/**
 * Cheek lines, neckline and jaw of a look on a shot (Photo Studio pixels of that shot).
 * @param {object} shot Shot with landmarks (front, or a 45 degree shot)
 * @param {object} params LookParams
 * @returns {null | {
 *   width: number, height: number, mmPerPx: number,
 *   jaw: { pts: number[][], dirs: number[][], zones: string[], chin: number },
 *   cheek: { type: string, offset: number, lines: { L: number[][], R: number[][] },
 *            handles: { L: number[], R: number[] }, track: { offset: number, L: number[], R: number[] }[] },
 *   neck: { type: string, offset: number, followsJaw: boolean, line: number[][], depths: number[] (mm per
 *           jaw point), handle: number[], track: { offset: number, point: number[] }[] } | null
 * }} null without landmarks
 */
export function lineGuides(shot, params) {
  const lm = shot && Array.isArray(shot.landmarks) ? shot.landmarks : null;
  if (!lm || lm.length < 468) return null;
  const [W, H] = shotSize(shot);
  if (!W || !H) return null;
  const P = (i) => [lm[i].x * W, lm[i].y * H];
  const look = normalizeLook(params);
  const { lines } = look;
  const mmPerPx = frameMmPerPx(lm, W, H);

  // Jaw on the photo, and the direction the shell leaves it in (glScene: the outward
  // normal plus the face-down direction, half toward gravity on an upright face).
  const jaw = JAW_CONTOUR.map(P);
  const faceDown = norm(sub(P(CHIN_BOTTOM), P(FOREHEAD_TOP)));
  const g = 0.5 * clamp((faceDown[1] - 0.5) / 0.35, 0, 1);
  const down = norm([faceDown[0] * (1 - g), faceDown[1] * (1 - g) + g]);
  const dirs = polylineNormals2D(jaw, down).map((n) => norm(add(n, down)));

  // Cheek lines.
  const cheekType = lines.cheek;
  const cheekAt = (off) => ({
    L: cheekLine('L', cheekType, off).line,
    R: cheekLine('R', cheekType, off).line,
  });
  const cur = cheekAt(lines.cheekOffset);
  const onPhoto = (poly) => poly.map((p) => toPhoto(p, P)).filter(Boolean);
  const cheekLines = { L: onPhoto(cur.L), R: onPhoto(cur.R) };
  const cheekTrack = cachedTrack(shot, `cheek:${cheekType}`, () =>
    offsets().map((offset) => {
      const c = cheekAt(offset);
      return { offset, L: toPhoto(midpoint(c.L), P), R: toPhoto(midpoint(c.R), P) };
    }),
  );

  // Neckline (only meaningful with a scale).
  let neck = null;
  if (Number.isFinite(mmPerPx) && mmPerPx > 0) {
    const neckType = lines.neckline;
    const opt = NECK_OPTIONS.get(neckType);
    const followsJaw = neckType === 'jaw' || Boolean(opt && opt.followsJaw);
    const at = (k, off) => add(jaw[k], scale(dirs[k], neckDepthMm(neckType, off, JAW_U[k]) / mmPerPx));
    const line = [];
    for (let k = NECK_FROM; k <= NECK_TO; k++) line.push(at(k, lines.necklineOffset));
    const track = cachedTrack(shot, `neck:${neckType}`, () => offsets().map((offset) => ({ offset, point: at(CHIN_K, offset) })));
    const depths = JAW_U.map((u) => neckDepthMm(neckType, lines.necklineOffset, u));
    neck = { type: neckType, offset: lines.necklineOffset, followsJaw, line, depths, handle: at(CHIN_K, lines.necklineOffset), track };
  }

  return {
    width: W,
    height: H,
    mmPerPx,
    jaw: { pts: jaw, dirs, zones: JAW_ZONES, chin: CHIN_K },
    cheek: {
      type: cheekType,
      offset: lines.cheekOffset,
      lines: cheekLines,
      handles: { L: toPhoto(midpoint(cur.L), P), R: toPhoto(midpoint(cur.R), P) },
      track: cheekTrack,
    },
    neck,
  };
}
