/*
 * LIHYA beard zones - the single source of truth for where each beard zone
 * sits on the MediaPipe face mesh. Used by on-device analysis (beard density
 * per zone, in camera pixels) and by rendering (procedural beard texture, in
 * UV space).
 *
 * Landmark indices refer to the MediaPipe Face Landmarker topology (468 mesh
 * points + 10 iris points). The mesh topology, the canonical positions and the
 * UV layout used to design and verify these zones come from the MediaPipe
 * canonical face model (Copyright 2023 The MediaPipe Authors, Apache License
 * 2.0, https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj);
 * the face-oval, lip and iris index lists follow MediaPipe's
 * face_mesh_connections.py (same authors, same license).
 *
 * ---------------------------------------------------------------------------
 * LEFT / RIGHT
 * ---------------------------------------------------------------------------
 * Every _L / _R / {L, R} in this module is the CUSTOMER'S OWN left / right.
 * MediaPipe's subject-left side is the 263 / 362 / 454 / 291 / 397 side; in
 * the canonical model those landmarks have x > 0 (canonical frame: y up, z
 * toward the viewer, so +x is the viewer's right = the subject's left), and
 * MediaPipe names that eye FACEMESH_LEFT_EYE. Subject-right is the
 * 33 / 133 / 234 / 61 / 172 side (x < 0).
 * In an UN-mirrored camera frame the customer's left side therefore appears
 * on the RIGHT half of the image. Always run detection on the un-mirrored
 * frame (a mirrored frame makes the mesh swap sides) and mirror at display
 * time with opts.mirror.
 *
 * ---------------------------------------------------------------------------
 * POLYGONS
 * ---------------------------------------------------------------------------
 * Every ring is a closed polygon (last vertex connects back to the first,
 * the first vertex is not repeated), simple (non-self-intersecting) and
 * counter-clockwise in canonical / UV space (x right, y up), which is
 * clockwise on screen in un-mirrored, top-left-origin image pixels.
 * Adjacent zones share boundary landmarks, so they tile without gaps:
 *
 *   B (sideburn)  ear-front strip from eye level (127) down to below the
 *                 ear lobe (132 / 177).
 *   J (jawline)   band along the lower face oval from the sideburn bottom to
 *                 the side of the chin (176 / 400).
 *   K (cheek)     everything between the natural cheek line, the jaw band,
 *                 the chin and the mustache, including the "connector" strip
 *                 that runs from the mustache corner (57 / 287) past the
 *                 mouth corner down to the jaw.
 *   C (chin)      front of the chin, from the lower lip down to the chin
 *                 bottom (152), minus the soul patch.
 *   S (soul patch) small patch directly under the centre of the lower lip.
 *   M (mustache)  between the nose base (2, 97, 98 / 326, 327) and the upper
 *                 lip, flaring out to the mustache corners (57 / 287).
 *   N (neck)      below the jaw contour; there are no mesh landmarks there,
 *                 so it only exists in pixel space (zonePolygonsPx).
 *
 * Lips, nostrils and eyes are outside every zone (lip landmarks only appear
 * as shared boundary vertices).
 */

import { CANONICAL_UV } from './uv.js';

const freezeAll = (obj) => {
  for (const v of Object.values(obj)) if (v && typeof v === 'object') freezeAll(v);
  return Object.freeze(obj);
};

/** All beard zone codes, in UI order. */
export const ZONE_IDS = Object.freeze(['M', 'S', 'C', 'J_L', 'J_R', 'K_L', 'K_R', 'B_L', 'B_R', 'N']);

/** Zones that are defined on the face mesh (everything except the neck). */
export const MESH_ZONE_IDS = Object.freeze(ZONE_IDS.filter((z) => z !== 'N'));

/**
 * Mustache side edge, from the alar base (nose) down to the mustache corner.
 * The natural cheek line ends on this edge; the cheek-line handle slides that
 * end point along it.
 */
export const MUSTACHE_EDGE_L = Object.freeze([327, 391, 322, 410, 287]);
export const MUSTACHE_EDGE_R = Object.freeze([98, 165, 92, 186, 57]);

/**
 * Natural cheek line: ordered polyline from the sideburn bottom (inner
 * sideburn edge) curving down toward the mouth corner, ending on the mustache
 * side edge. It is the default upper edge of the K zone.
 */
export const CHEEK_LINE_NATURAL_L = Object.freeze([401, 411, 427, 436, 410]);
export const CHEEK_LINE_NATURAL_R = Object.freeze([177, 187, 207, 216, 186]);

/**
 * Limits of the barber's cheek-line handle (same start point as the natural
 * line). HIGH runs up the inner sideburn edge and under the cheekbone to the
 * alar base (top of the mustache edge); LOW runs from the sideburn bottom
 * just above the jaw band to the mustache corner.
 */
export const CHEEK_LINE_HIGH_L = Object.freeze([401, 366, 352, 280, 425, 423, 327]);
export const CHEEK_LINE_HIGH_R = Object.freeze([177, 137, 123, 50, 205, 203, 98]);
export const CHEEK_LINE_LOW_L = Object.freeze([401, 433, 416, 434, 432, 287]);
export const CHEEK_LINE_LOW_R = Object.freeze([177, 213, 192, 214, 212, 57]);

/**
 * Lower boundary chain of K, from the mouth corner around the connector and
 * along the inner jaw-band edge back up to (but excluding) the sideburn
 * bottom.
 */
const K_LOWER_L = Object.freeze([291, 375, 321, 335, 418, 262, 369, 395, 394, 364, 367, 435]);
const K_LOWER_R = Object.freeze([61, 146, 91, 106, 194, 32, 140, 170, 169, 135, 138, 215]);

const CHEEK = Object.freeze({
  L: { natural: CHEEK_LINE_NATURAL_L, high: CHEEK_LINE_HIGH_L, low: CHEEK_LINE_LOW_L, edge: MUSTACHE_EDGE_L, lower: K_LOWER_L },
  R: { natural: CHEEK_LINE_NATURAL_R, high: CHEEK_LINE_HIGH_R, low: CHEEK_LINE_LOW_R, edge: MUSTACHE_EDGE_R, lower: K_LOWER_R },
});

/** Beard zone rings (landmark indices), CCW in canonical / UV space. N is pixel-space only. */
export const ZONE_POLYGONS = freezeAll({
  M: [2, 97, 98, 165, 92, 186, 57, 61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 287, 410, 322, 391, 327, 326],
  S: [83, 18, 313, 314, 17, 84],
  C: [84, 181, 91, 106, 194, 32, 140, 176, 148, 152, 377, 400, 369, 262, 418, 335, 321, 405, 314, 313, 18, 83],
  J_L: [401, 435, 367, 364, 394, 395, 369, 400, 378, 379, 365, 397, 288, 361],
  J_R: [132, 58, 172, 136, 150, 149, 176, 140, 170, 169, 135, 138, 215, 177],
  K_L: [401, 411, 427, 436, 410, 287, 291, 375, 321, 335, 418, 262, 369, 395, 394, 364, 367, 435],
  K_R: [215, 138, 135, 169, 170, 140, 32, 194, 106, 91, 146, 61, 57, 186, 216, 207, 187, 177],
  B_L: [264, 447, 366, 401, 361, 323, 454, 356],
  B_R: [127, 234, 93, 132, 177, 137, 227, 34],
});

/**
 * Lower face oval, ordered from the customer's right ear-front (234) down
 * around the chin (152) to the customer's left ear-front (454).
 */
export const JAW_CONTOUR = Object.freeze([
  234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454,
]);

/** Gonion-to-gonion front part of JAW_CONTOUR (172 .. 397), the top edge of the neck zone N. */
export const JAW_CONTOUR_FRONT = Object.freeze(JAW_CONTOUR.slice(JAW_CONTOUR.indexOf(172), JAW_CONTOUR.indexOf(397) + 1));

/**
 * FACEMESH_FACE_OVAL as an ordered ring, starting at the forehead top (10)
 * and running down the customer's right side (CCW in canonical space).
 */
export const FACE_OVAL = Object.freeze([
  10, 109, 67, 103, 54, 21, 162, 127, 234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379,
  365, 397, 288, 361, 323, 454, 356, 389, 251, 284, 332, 297, 338,
]);

/**
 * Outer lip contour (FACEMESH_LIPS outer edges) as an ordered ring: customer's
 * right mouth corner 61, along the lower lip to 291, back along the upper lip.
 */
export const LIPS_OUTER = Object.freeze([
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185,
]);

/** Mouth corners: customer's left is 291, right is 61. */
export const MOUTH_CORNERS = Object.freeze({ L: 291, R: 61 });

export const CHIN_BOTTOM = 152;
export const FOREHEAD_TOP = 10;
export const NOSE_TIP = 4;

/**
 * Iris landmarks (only present when the landmarker outputs 478 points).
 * 473..477 is the iris of the customer's LEFT eye (MediaPipe
 * FACEMESH_LEFT_IRIS, next to eye corners 263 / 362); 468..472 is the RIGHT
 * eye (FACEMESH_RIGHT_IRIS, next to 33 / 133). Index 468 / 473 is the centre.
 */
export const IRIS = freezeAll({
  L: { center: 473, ring: [474, 475, 476, 477] },
  R: { center: 468, ring: [469, 470, 471, 472] },
});

/**
 * Measurement landmarks, as in the PRD: cheekbone width 234 -> 454, jaw width
 * 172 -> 397, chin 152, face midline from 10. The PRD indices already follow
 * MediaPipe's side convention, so L = 454 / 397 (customer's left) and
 * R = 234 / 172; no remapping was needed.
 */
export const MEASURE = Object.freeze({ cheekL: 454, cheekR: 234, jawL: 397, jawR: 172, chin: 152, top: 10 });

/** Outer eye corners, used for the eye-to-jaw distance of the cheek-line handle. */
const EYE_OUTER = Object.freeze({ L: 263, R: 33 });

/** Neck depth at the gonions as a fraction of the depth under the chin. */
const NECK_SIDE_DEPTH = 0.6;

/* ------------------------------------------------------------------------ */
/* Geometry helpers (plain [x, y] arrays)                                    */
/* ------------------------------------------------------------------------ */

/** Signed shoelace area; positive for CCW in a y-up frame (CW on a y-down screen). */
export function polygonArea(points) {
  let a = 0;
  for (let k = 0, n = points.length; k < n; k++) {
    const p = points[k];
    const q = points[(k + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Area centroid of a simple polygon ([x, y]); falls back to the vertex mean for degenerate rings. */
export function polygonCentroid(points) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let k = 0, n = points.length; k < n; k++) {
    const p = points[k];
    const q = points[(k + 1) % n];
    const cr = p[0] * q[1] - q[0] * p[1];
    a += cr;
    cx += (p[0] + q[0]) * cr;
    cy += (p[1] + q[1]) * cr;
  }
  if (Math.abs(a) < 1e-12) {
    const n = points.length || 1;
    return [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/** Even-odd point-in-polygon test. Points exactly on an edge may go either way. */
export function pointInPolygon(pt, points) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const scale = (a, s) => [a[0] * s, a[1] * s];
const len = (a) => Math.hypot(a[0], a[1]);
const norm = (a) => {
  const l = len(a);
  return l > 1e-9 ? [a[0] / l, a[1] / l] : [0, 0];
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Cumulative arc lengths of a polyline. */
function arcLengths(poly) {
  const out = [0];
  for (let k = 1; k < poly.length; k++) out.push(out[k - 1] + len(sub(poly[k], poly[k - 1])));
  return out;
}

/** Point at arc length s along a polyline (with its cumulative lengths). */
function pointAtArc(poly, cum, s) {
  if (s <= 0) return poly[0];
  for (let k = 1; k < poly.length; k++) {
    if (s <= cum[k]) {
      const seg = cum[k] - cum[k - 1];
      const t = seg > 1e-12 ? (s - cum[k - 1]) / seg : 0;
      return add(poly[k - 1], scale(sub(poly[k], poly[k - 1]), t));
    }
  }
  return poly[poly.length - 1];
}

/**
 * Outward 2D normals of an open polyline, oriented to agree with `down`.
 * Uses the central difference of the neighbours (one-sided at the ends).
 */
export function polylineNormals2D(points, down) {
  return points.map((p, k) => {
    const a = points[Math.max(0, k - 1)];
    const b = points[Math.min(points.length - 1, k + 1)];
    const t = norm(sub(b, a));
    let n = [-t[1], t[0]];
    if (n[0] * down[0] + n[1] * down[1] < 0) n = [-n[0], -n[1]];
    return n;
  });
}

/* ------------------------------------------------------------------------ */
/* Pixel space                                                               */
/* ------------------------------------------------------------------------ */

const lmX = (l) => (l.x !== undefined ? l.x : l[0]);
const lmY = (l) => (l.y !== undefined ? l.y : l[1]);

/**
 * Cheek line for one side after applying the barber's offset, in pixels.
 *
 * offset > 0 raises, < 0 lowers the line by offset * eye-to-jaw distance
 * (outer eye corner to gonion on that side). The line is blended toward the
 * HIGH or LOW limit line, both resampled at the same normalised arc-length
 * parameters (the union of both polylines' vertex parameters, so neither
 * line loses a corner). The blend factor is chosen so the point that moves
 * furthest moves exactly that distance; it saturates at the limit line. The
 * sideburn end is shared by all three lines and never moves; the mustache
 * end slides along the mustache edge.
 *
 * @returns {{ line: number[][], sEnd: number, edge: number[][], edgeCum: number[] }}
 */
function cheekLinePx(P, side, offset) {
  const def = CHEEK[side];
  const eyeToJaw = len(sub(P(EYE_OUTER[side]), P(side === 'L' ? MEASURE.jawL : MEASURE.jawR)));
  const d = clamp(offset, -1, 1) * eyeToJaw;
  const natural = def.natural.map(P);
  const limitIdx = d > 0 ? def.high : def.low;
  const limit = limitIdx.map(P);

  const cn = arcLengths(natural);
  const cl = arcLengths(limit);
  const tn = cn[cn.length - 1] || 1;
  const tl = cl[cl.length - 1] || 1;
  const params = [...cn.map((s) => s / tn), ...cl.map((s) => s / tl)].sort((x, y) => x - y);
  const ts = params.filter((t, k) => k === 0 || t - params[k - 1] > 1e-6);
  const A = ts.map((t) => pointAtArc(natural, cn, t * tn));
  const B = ts.map((t) => pointAtArc(limit, cl, t * tl));
  let gap = 0;
  for (let k = 0; k < ts.length; k++) gap = Math.max(gap, len(sub(B[k], A[k])));
  const a = gap > 1e-9 ? clamp(Math.abs(d) / gap, 0, 1) : 0;
  const line = A.map((p, k) => add(p, scale(sub(B[k], p), a)));

  const edge = def.edge.map(P);
  const edgeCum = arcLengths(edge);
  const sNat = edgeCum[def.edge.indexOf(def.natural[def.natural.length - 1])];
  const sLim = edgeCum[def.edge.indexOf(limitIdx[limitIdx.length - 1])];
  const sEnd = sNat + (sLim - sNat) * a;
  line[line.length - 1] = pointAtArc(edge, edgeCum, sEnd);
  return { line, sEnd, edge, edgeCum };
}

/** K ring for one side with a moved cheek line: line, rest of the mustache edge, K floor. */
function shiftedCheekRing(P, side, offset) {
  const { line, sEnd, edge, edgeCum } = cheekLinePx(P, side, offset);
  const edgeBelow = edge.filter((_, k) => edgeCum[k] > sEnd + 1e-6);
  return [...line, ...edgeBelow, ...CHEEK[side].lower.map(P)];
}

/**
 * Zone polygons in image pixel space.
 *
 * @param {Array<{x:number,y:number}>|Array<number[]>} landmarks MediaPipe
 *   normalized landmarks (x, y in 0..1, top-left origin), 468 or 478 entries,
 *   from the UN-mirrored camera frame.
 * @param {number} width image width in px
 * @param {number} height image height in px
 * @param {object} [opts]
 * @param {number} [opts.cheekLineOffset=0] -1..1; positive raises, negative
 *   lowers the upper edge of K_L / K_R by that fraction of the eye-to-jaw
 *   distance (outer eye corner to gonion, per side; about 9 cm on an adult).
 *   The line is blended toward CHEEK_LINE_HIGH_* / CHEEK_LINE_LOW_* and
 *   saturates there (around +0.2 / -0.25 on a typical face); the sideburn
 *   end stays put and the mustache end slides along MUSTACHE_EDGE_*. K stays
 *   a simple polygon that shares its edges with B, J, C and M.
 * @param {number} [opts.neckDepthPx] depth of the neck zone N below the chin;
 *   default 0.35 * distance(nose tip 4, chin 152). N is the gonion-to-gonion
 *   part of JAW_CONTOUR (172 .. 397) offset downward along its local normals
 *   (blended 1:2 with the face-down axis); the depth eases to 60 % of
 *   neckDepthPx at the gonions so the neckline rises toward the ears.
 * @param {boolean} [opts.mirror=false] return x mirrored (width - x) for a
 *   selfie-style display. Zone names stay the customer's own sides.
 * @returns {Record<string, number[][]>} { zone: [[x, y], ...] }, top-left
 *   origin, y down, for every id in ZONE_IDS.
 */
export function zonePolygonsPx(landmarks, width, height, opts = {}) {
  const { cheekLineOffset = 0, neckDepthPx, mirror = false } = opts;
  const P = (i) => {
    const l = landmarks[i];
    const x = lmX(l) * width;
    return [mirror ? width - x : x, lmY(l) * height];
  };
  const up = norm(sub(P(FOREHEAD_TOP), P(CHIN_BOTTOM)));
  const down = [-up[0], -up[1]];

  const out = {};
  for (const id of MESH_ZONE_IDS) out[id] = ZONE_POLYGONS[id].map(P);

  if (cheekLineOffset) {
    for (const side of ['L', 'R']) {
      const id = `K_${side}`;
      let ring = shiftedCheekRing(P, side, cheekLineOffset);
      if (Math.sign(polygonArea(ring)) !== Math.sign(polygonArea(out[id]))) ring = ring.reverse();
      out[id] = ring;
    }
  }

  // Neck: offset the gonion-to-gonion jaw contour downward along its local
  // normals. The normals are blended 1:2 with the face-down axis so the zone
  // does not flare out past the jaw angles, and the depth eases from
  // NECK_SIDE_DEPTH * depth at the gonions to the full depth under the chin,
  // giving the U-shaped neckline that rises toward the ears.
  const depth = neckDepthPx !== undefined ? neckDepthPx : 0.35 * len(sub(P(NOSE_TIP), P(CHIN_BOTTOM)));
  const top = JAW_CONTOUR_FRONT.map(P);
  const normals = polylineNormals2D(top, down);
  const cum = arcLengths(top);
  const total = cum[cum.length - 1] || 1;
  const bottom = top.map((p, k) => {
    const d = depth * (NECK_SIDE_DEPTH + (1 - NECK_SIDE_DEPTH) * Math.sin((Math.PI * cum[k]) / total));
    return add(p, scale(norm(add(normals[k], scale(down, 2))), d));
  });
  let neck = [...top, ...bottom.reverse()];
  if (Math.sign(polygonArea(neck)) !== Math.sign(polygonArea(out.C))) neck = neck.reverse();
  out.N = neck;
  return out;
}

/* ------------------------------------------------------------------------ */
/* UV space                                                                  */
/* ------------------------------------------------------------------------ */

const uvOf = (i) => [CANONICAL_UV[2 * i], CANONICAL_UV[2 * i + 1]];
const toTex = (size) => (p) => [p[0] * size, (1 - p[1]) * size];

/**
 * Zone polygons in UV space for the procedural texture painter (mesh zones
 * only; N has no mesh landmarks - paint it on the extrudeBelowJaw shell).
 *
 * @param {object} [opts]
 * @param {number} [opts.size] when given, returns pixel coordinates in a
 *   size x size top-left-origin canvas, matching a THREE.CanvasTexture with
 *   flipY = true (see uvToTexturePx). Otherwise raw [u, v], OBJ convention
 *   (v up), rings CCW.
 * @returns {Record<string, number[][]>}
 */
export function zonePolygonsUV(opts = {}) {
  const out = {};
  for (const id of MESH_ZONE_IDS) {
    const ring = ZONE_POLYGONS[id].map(uvOf);
    out[id] = opts.size ? ring.map(toTex(opts.size)) : ring;
  }
  return out;
}

/** Area centroids of the mesh zones in UV space; same options as zonePolygonsUV. */
export function zoneCentroidsUV(opts = {}) {
  const out = {};
  for (const id of MESH_ZONE_IDS) {
    const c = polygonCentroid(ZONE_POLYGONS[id].map(uvOf));
    out[id] = opts.size ? toTex(opts.size)(c) : c;
  }
  return out;
}
