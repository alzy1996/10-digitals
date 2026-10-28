// The barber's ruler on the Cut Card (PRD 9.5: "a thin brass ruler with mm ticks laid
// along the jaw"): a brass line just outside the jaw of the Zone Diagram's front view,
// from ear to ear under the chin, with a tick every 5 mm and a long tick every 10 mm at
// the drawing's own scale, counted from the middle of the chin. Pure geometry in the
// diagram's 300 x 360 viewBox, read from the diagram model itself (the jaw band J_R and
// the chin C), so the ruler always sits on the jaw that is drawn.

import { zoneDiagramModel, ZD_W, ZD_H } from '../ui/zoneDiagramGeometry.js';

/** Drawing scale of the Zone Diagram: eye line to chin is 136 px for about 120 mm. */
export const JAW_RULER_PX_PER_MM = 1.13;
export const JAW_RULER_TICK_MM = 5;
export const JAW_RULER_MAJOR_MM = 10;
/** Distance of the ruler from the jaw outline, and tick lengths (viewBox units). */
const GAP = 4;
const TICK = 3.5;
const TICK_MAJOR = 7;
/** The middle of the face: ticks point away from it. */
const FACE_CENTER = [ZD_W / 2, 190];

const r1 = (v) => Math.round(v * 10) / 10;
const near = (a, b) => Math.abs(a[0] - b[0]) < 0.15 && Math.abs(a[1] - b[1]) < 0.15;
const mirror = (p) => [ZD_W - p[0], p[1]];

/** The points of an "M x y L x y ... Z" path (the diagram's zone polygons). */
export function pathPoints(d) {
  const out = [];
  for (const m of String(d || '').matchAll(/[ML]\s*(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)/g)) out.push([Number(m[1]), Number(m[2])]);
  return out;
}

/**
 * The jaw outline of the front view, ear to ear under the chin (viewer's left to right),
 * or null when the diagram cannot be read. J_R is the outer edge of the customer's right
 * jaw followed by its inner edge (same number of points); C holds the chin's outer edge
 * between the two jaw bands; the customer's left jaw is the mirror image.
 */
export function jawOutline(model = zoneDiagramModel({ view: 'front' })) {
  const shapes = model && model.shapes ? model.shapes : {};
  const band = pathPoints(shapes.J_R);
  if (band.length < 4 || band.length % 2) return null;
  const right = band.slice(0, band.length / 2);
  const end = right[right.length - 1];
  const far = mirror(end);
  // The chin's outer edge: the C points at or below the ends of the two jaw bands, in
  // order across the face (the edge is a function of x).
  const chin = pathPoints(shapes.C)
    .filter((p) => p[1] >= end[1] - 0.01 && p[0] > end[0] + 0.01 && p[0] < far[0] - 0.01)
    .sort((a, b) => a[0] - b[0]);
  if (chin.length < 2) return null;
  const left = right.map(mirror).reverse();
  const pts = [...right, ...chin, ...left];
  return pts.filter((p, i) => i === 0 || !near(p, pts[i - 1]));
}

function cumulative(pts) {
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return s;
}

/** Unit normal of a segment, turned away from the face. */
function outward(a, b, at) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  let n = [-dy / len, dx / len];
  const away = [at[0] - FACE_CENTER[0], at[1] - FACE_CENTER[1]];
  if (n[0] * away[0] + n[1] * away[1] < 0) n = [-n[0], -n[1]];
  return n;
}

/** Point and outward normal at arc length `s` along `pts` (with its cumulative lengths `cum`). */
function pointAt(pts, cum, s) {
  let i = 1;
  while (i < pts.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1];
  const b = pts[i];
  const seg = cum[i] - cum[i - 1] || 1;
  const k = Math.min(1, Math.max(0, (s - cum[i - 1]) / seg));
  const p = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  return { p, n: outward(a, b, p) };
}

/** Vertex normals (the mean of the two segment normals), turned away from the face. */
function vertexNormals(pts) {
  return pts.map((p, i) => {
    const a = outward(pts[Math.max(0, i - 1)], pts[Math.min(pts.length - 1, Math.max(1, i))], p);
    const b = outward(pts[Math.min(i, pts.length - 2)], pts[Math.min(pts.length - 1, i + 1)], p);
    const x = a[0] + b[0];
    const y = a[1] + b[1];
    const len = Math.hypot(x, y) || 1;
    return [x / len, y / len];
  });
}

/**
 * The ruler: { d (the brass line), ticks [{ x1, y1, x2, y2, major, at }] (at = the point on
 * the jaw it marks), lengthMm (ear to ear), zero [x, y] (middle of the chin), width, height }
 * in viewBox units, or null.
 */
export function jawRuler({ outline = jawOutline(), pxPerMm = JAW_RULER_PX_PER_MM, tickMm = JAW_RULER_TICK_MM, majorMm = JAW_RULER_MAJOR_MM } = {}) {
  if (!Array.isArray(outline) || outline.length < 3 || !(pxPerMm > 0) || !(tickMm > 0)) return null;
  const cum = cumulative(outline);
  const total = cum[cum.length - 1];
  if (!(total > 0)) return null;
  // Zero is the lowest point of the chin (the middle of the face).
  let zeroIdx = 0;
  outline.forEach((p, i) => {
    if (p[1] > outline[zeroIdx][1] + 1e-9 || (Math.abs(p[1] - outline[zeroIdx][1]) < 1e-9 && Math.abs(p[0] - ZD_W / 2) < Math.abs(outline[zeroIdx][0] - ZD_W / 2))) zeroIdx = i;
  });
  const zeroS = cum[zeroIdx];
  const normals = vertexNormals(outline);
  const line = outline.map((p, i) => [p[0] + normals[i][0] * GAP, p[1] + normals[i][1] * GAP]);
  const d = line.map((p, i) => `${i ? 'L' : 'M'}${r1(p[0])} ${r1(p[1])}`).join('');

  const step = tickMm * pxPerMm;
  const ticks = [];
  const every = Math.max(1, Math.round(majorMm / tickMm));
  for (const dir of [-1, 1]) {
    for (let k = dir === -1 ? 0 : 1; ; k++) {
      const s = zeroS + dir * k * step;
      if (s < 0 || s > total) break;
      const { p, n } = pointAt(outline, cum, s);
      const len = k % every === 0 ? TICK_MAJOR : TICK;
      ticks.push({
        x1: r1(p[0] + n[0] * GAP),
        y1: r1(p[1] + n[1] * GAP),
        x2: r1(p[0] + n[0] * (GAP + len)),
        y2: r1(p[1] + n[1] * (GAP + len)),
        major: k % every === 0,
        at: [r1(p[0]), r1(p[1])],
      });
    }
  }
  return {
    d,
    ticks,
    lengthMm: Math.round(total / pxPerMm),
    zero: outline[zeroIdx].slice(),
    width: ZD_W,
    height: ZD_H,
  };
}
