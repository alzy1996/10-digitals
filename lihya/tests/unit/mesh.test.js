// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CANONICAL_UV, uvToTexturePx } from '../../src/ai/mesh/uv.js';
import { TRIANGLES, CANONICAL_VERTICES } from '../../src/ai/mesh/tessellation.js';
import {
  ZONE_IDS,
  MESH_ZONE_IDS,
  ZONE_POLYGONS,
  JAW_CONTOUR,
  JAW_CONTOUR_FRONT,
  FACE_OVAL,
  LIPS_OUTER,
  CHEEK_LINE_NATURAL_L,
  CHEEK_LINE_NATURAL_R,
  MUSTACHE_EDGE_L,
  MUSTACHE_EDGE_R,
  MOUTH_CORNERS,
  CHIN_BOTTOM,
  FOREHEAD_TOP,
  IRIS,
  MEASURE,
  zonePolygonsPx,
  zonePolygonsUV,
  zoneCentroidsUV,
  polygonArea,
  polygonCentroid,
  pointInPolygon,
} from '../../src/ai/mesh/zones.js';
import {
  buildFaceGeometry,
  updateFaceGeometry,
  landmarksToPx,
  jawContourFromGeometry,
  extrudeBelowJaw,
} from '../../src/ai/mesh/faceMesh.js';

const N_LM = 468;
const front = (i) => [CANONICAL_VERTICES[3 * i], CANONICAL_VERTICES[3 * i + 1]];
const uvPt = (i) => [CANONICAL_UV[2 * i], CANONICAL_UV[2 * i + 1]];

/** Proper intersection of segments p1p2 and q1q2 (shared endpoints excluded by the caller). */
function segmentsIntersect(p1, p2, q1, q2) {
  const o = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  const onSeg = (a, b, c) =>
    Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1]);
  const d1 = o(q1, q2, p1);
  const d2 = o(q1, q2, p2);
  const d3 = o(p1, p2, q1);
  const d4 = o(p1, p2, q2);
  if (d1 !== d2 && d3 !== d4 && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0) return true;
  if (d1 === 0 && onSeg(q1, q2, p1)) return true;
  if (d2 === 0 && onSeg(q1, q2, p2)) return true;
  if (d3 === 0 && onSeg(p1, p2, q1)) return true;
  if (d4 === 0 && onSeg(p1, p2, q2)) return true;
  return false;
}

function isSimplePolygon(points) {
  const n = points.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // adjacent edges share a vertex
      if (segmentsIntersect(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) return false;
    }
  }
  return true;
}

/** Synthetic MediaPipe landmarks: canonical vertices projected frontally into 0..1, top-left origin. */
function syntheticLandmarks() {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < N_LM; i++) {
    const [x, y] = front(i);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const span = Math.max(maxX - minX, maxY - minY);
  const lm = [];
  for (let i = 0; i < N_LM; i++) {
    const [x, y] = front(i);
    lm.push({
      x: 0.2 + ((x - minX) / span) * 0.6,
      y: 0.1 + ((maxY - y) / span) * 0.6,
      z: (-CANONICAL_VERTICES[3 * i + 2] / span) * 0.6,
    });
  }
  // 10 iris points (centre + ring) so the array looks like a 478-point result.
  const eye = (a, b) => ({ x: (lm[a].x + lm[b].x) / 2, y: (lm[a].y + lm[b].y) / 2, z: lm[a].z });
  for (let k = 0; k < 5; k++) lm.push(eye(33, 133));
  for (let k = 0; k < 5; k++) lm.push(eye(263, 362));
  return lm;
}

/** Mirror map built from the (exactly symmetric) canonical model. */
function mirrorMap() {
  const m = [];
  for (let i = 0; i < N_LM; i++) {
    for (let j = 0; j < N_LM; j++) {
      const dx = CANONICAL_VERTICES[3 * i] + CANONICAL_VERTICES[3 * j];
      const dy = CANONICAL_VERTICES[3 * i + 1] - CANONICAL_VERTICES[3 * j + 1];
      const dz = CANONICAL_VERTICES[3 * i + 2] - CANONICAL_VERTICES[3 * j + 2];
      if (Math.hypot(dx, dy, dz) < 1e-5) {
        m.push(j);
        break;
      }
    }
  }
  return m;
}

describe('generated mesh data', () => {
  it('has 468 UVs, 898 triangles and 468 canonical vertices', () => {
    expect(CANONICAL_UV).toBeInstanceOf(Float32Array);
    expect(CANONICAL_UV.length).toBe(N_LM * 2);
    expect(TRIANGLES).toBeInstanceOf(Uint16Array);
    expect(TRIANGLES.length).toBe(898 * 3);
    expect(CANONICAL_VERTICES).toBeInstanceOf(Float32Array);
    expect(CANONICAL_VERTICES.length).toBe(N_LM * 3);
  });

  it('keeps every UV inside [0, 1]', () => {
    for (const v of CANONICAL_UV) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('references every landmark from the triangles, all < 468', () => {
    const used = new Set(TRIANGLES);
    for (const i of TRIANGLES) expect(i).toBeLessThan(N_LM);
    expect(used.size).toBe(N_LM);
  });

  it('uses v-up UVs (chin near v = 0) and maps them to a top-left texture', () => {
    expect(uvPt(CHIN_BOTTOM)[1]).toBeLessThan(0.1);
    expect(uvPt(FOREHEAD_TOP)[1]).toBeGreaterThan(0.85);
    const [, yTop] = uvToTexturePx(FOREHEAD_TOP, 512);
    const [, yChin] = uvToTexturePx(CHIN_BOTTOM, 512);
    expect(yTop).toBeLessThan(yChin);
    const [x, y] = uvToTexturePx(1, 1000);
    expect(x).toBeCloseTo(CANONICAL_UV[2] * 1000, 3);
    expect(y).toBeCloseTo((1 - CANONICAL_UV[3]) * 1000, 3);
    expect(() => uvToTexturePx(468, 512)).toThrow(RangeError);
  });

  it('places the customer-left side (263 / 454) at canonical x > 0', () => {
    for (const i of [263, 362, 454, 291, 397]) expect(front(i)[0]).toBeGreaterThan(0);
    for (const i of [33, 133, 234, 61, 172]) expect(front(i)[0]).toBeLessThan(0);
  });
});

describe('zone definitions', () => {
  const allIndexLists = () => [
    ...Object.values(ZONE_POLYGONS),
    JAW_CONTOUR,
    JAW_CONTOUR_FRONT,
    FACE_OVAL,
    LIPS_OUTER,
    CHEEK_LINE_NATURAL_L,
    CHEEK_LINE_NATURAL_R,
    MUSTACHE_EDGE_L,
    MUSTACHE_EDGE_R,
    Object.values(MOUTH_CORNERS),
    Object.values(MEASURE),
    [CHIN_BOTTOM, FOREHEAD_TOP],
  ];

  it('exports the expected zone ids and polygons', () => {
    expect(ZONE_IDS).toEqual(['M', 'S', 'C', 'J_L', 'J_R', 'K_L', 'K_R', 'B_L', 'B_R', 'N']);
    expect(Object.keys(ZONE_POLYGONS).sort()).toEqual(MESH_ZONE_IDS.slice().sort());
    expect(MESH_ZONE_IDS).not.toContain('N');
  });

  it('uses only mesh landmark indices (< 468) except IRIS', () => {
    for (const list of allIndexLists()) {
      for (const i of list) {
        expect(Number.isInteger(i)).toBe(true);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(N_LM);
      }
    }
    const iris = [IRIS.L.center, ...IRIS.L.ring, IRIS.R.center, ...IRIS.R.ring];
    expect(iris.slice().sort((a, b) => a - b)).toEqual([468, 469, 470, 471, 472, 473, 474, 475, 476, 477]);
    expect(IRIS.L.center).toBe(473);
    expect(IRIS.R.center).toBe(468);
  });

  it('has the PRD measurement landmarks on the right sides', () => {
    expect(MEASURE).toEqual({ cheekL: 454, cheekR: 234, jawL: 397, jawR: 172, chin: 152, top: 10 });
    expect(front(MEASURE.cheekL)[0]).toBeGreaterThan(0);
    expect(front(MEASURE.jawL)[0]).toBeGreaterThan(0);
    expect(MOUTH_CORNERS).toEqual({ L: 291, R: 61 });
  });

  it('orders JAW_CONTOUR from the right ear-front over the chin to the left ear-front', () => {
    expect(front(JAW_CONTOUR[0])[0]).toBeLessThan(0);
    expect(front(JAW_CONTOUR[JAW_CONTOUR.length - 1])[0]).toBeGreaterThan(0);
    expect(JAW_CONTOUR[(JAW_CONTOUR.length - 1) / 2]).toBe(CHIN_BOTTOM);
    for (const i of JAW_CONTOUR) expect(FACE_OVAL).toContain(i);
    expect(JAW_CONTOUR_FRONT[0]).toBe(MEASURE.jawR);
    expect(JAW_CONTOUR_FRONT[JAW_CONTOUR_FRONT.length - 1]).toBe(MEASURE.jawL);
  });

  it('builds FACE_OVAL and LIPS_OUTER as simple rings', () => {
    expect(FACE_OVAL.length).toBe(36);
    expect(new Set(FACE_OVAL).size).toBe(36);
    expect(LIPS_OUTER.length).toBe(20);
    expect(isSimplePolygon(FACE_OVAL.map(front))).toBe(true);
    expect(isSimplePolygon(LIPS_OUTER.map(front))).toBe(true);
    expect(polygonArea(FACE_OVAL.map(front))).toBeGreaterThan(0);
    expect(polygonArea(LIPS_OUTER.map(front))).toBeGreaterThan(0);
  });

  it.each(MESH_ZONE_IDS)('zone %s is a simple CCW polygon in front projection and in UV space', (id) => {
    const ring = ZONE_POLYGONS[id];
    expect(new Set(ring).size).toBe(ring.length);
    expect(isSimplePolygon(ring.map(front))).toBe(true);
    expect(polygonArea(ring.map(front))).toBeGreaterThan(0);
    expect(isSimplePolygon(ring.map(uvPt))).toBe(true);
    expect(polygonArea(ring.map(uvPt))).toBeGreaterThan(0);
  });

  it('puts the mustache between the nose base (2) and the upper lip (0)', () => {
    const [, cy] = polygonCentroid(ZONE_POLYGONS.M.map(front));
    expect(cy).toBeLessThan(front(2)[1]);
    expect(cy).toBeGreaterThan(front(0)[1]);
  });

  it('puts the chin below the lower lip (17) and the soul patch between lip and chin', () => {
    const [, cy] = polygonCentroid(ZONE_POLYGONS.C.map(front));
    expect(cy).toBeLessThan(front(17)[1]);
    const [, sy] = polygonCentroid(ZONE_POLYGONS.S.map(front));
    expect(sy).toBeLessThan(front(17)[1]);
    expect(sy).toBeGreaterThan(cy);
  });

  it('puts every _L zone on the customer-left side and mirrors it to _R', () => {
    const mirror = mirrorMap();
    for (const z of ['J', 'K', 'B']) {
      expect(polygonCentroid(ZONE_POLYGONS[`${z}_L`].map(front))[0]).toBeGreaterThan(0);
      expect(polygonCentroid(ZONE_POLYGONS[`${z}_R`].map(front))[0]).toBeLessThan(0);
      expect(new Set(ZONE_POLYGONS[`${z}_L`].map((i) => mirror[i]))).toEqual(new Set(ZONE_POLYGONS[`${z}_R`]));
    }
    expect(CHEEK_LINE_NATURAL_L.map((i) => mirror[i])).toEqual([...CHEEK_LINE_NATURAL_R]);
    expect(MUSTACHE_EDGE_L.map((i) => mirror[i])).toEqual([...MUSTACHE_EDGE_R]);
    for (const id of ['M', 'S', 'C']) {
      expect(new Set(ZONE_POLYGONS[id].map((i) => mirror[i]))).toEqual(new Set(ZONE_POLYGONS[id]));
    }
  });

  it('keeps lips, inner mouth, nostrils and eyes out of every zone interior', () => {
    const forbidden = [0, 17, 61, 291, 33, 133, 263, 362, 13, 14, 78, 308, 1, 4, 99, 328, 468 - 1];
    const mouthCentre = polygonCentroid(LIPS_OUTER.map(front));
    for (const id of MESH_ZONE_IDS) {
      const ring = ZONE_POLYGONS[id];
      for (const proj of [front, uvPt]) {
        const poly = ring.map(proj);
        for (const i of forbidden) {
          if (ring.includes(i)) continue; // on the boundary, not inside
          expect(pointInPolygon(proj(i), poly), `${id} contains ${i}`).toBe(false);
        }
      }
      expect(pointInPolygon(mouthCentre, ring.map(front))).toBe(false);
    }
  });

  it('starts K with the natural cheek line and ends it on the mustache edge', () => {
    for (const side of ['L', 'R']) {
      const ring = ZONE_POLYGONS[`K_${side}`];
      const line = side === 'L' ? CHEEK_LINE_NATURAL_L : CHEEK_LINE_NATURAL_R;
      const edge = side === 'L' ? MUSTACHE_EDGE_L : MUSTACHE_EDGE_R;
      for (const i of line) expect(ring).toContain(i);
      expect(edge).toContain(line[line.length - 1]);
      expect(ZONE_POLYGONS[`B_${side}`]).toContain(line[0]);
      expect(ZONE_POLYGONS[`J_${side}`]).toContain(line[0]);
      // the line runs from the sideburn toward the mouth corner
      const d0 = Math.hypot(...front(line[0]).map((v, k) => v - front(MOUTH_CORNERS[side])[k]));
      const d1 = Math.hypot(...front(line[line.length - 1]).map((v, k) => v - front(MOUTH_CORNERS[side])[k]));
      expect(d1).toBeLessThan(d0);
    }
  });

  it('tiles the mesh without overlapping zones (UV triangle centroids)', () => {
    const polys = MESH_ZONE_IDS.map((id) => ZONE_POLYGONS[id].map(uvPt));
    let covered = 0;
    for (let t = 0; t < TRIANGLES.length; t += 3) {
      const c = [0, 1, 2].reduce((acc, k) => [acc[0] + uvPt(TRIANGLES[t + k])[0] / 3, acc[1] + uvPt(TRIANGLES[t + k])[1] / 3], [0, 0]);
      const hits = polys.filter((p) => pointInPolygon(c, p)).length;
      expect(hits).toBeLessThanOrEqual(1);
      covered += hits;
    }
    expect(covered).toBeGreaterThan(100);
  });
});

describe('zonePolygonsPx', () => {
  const W = 720;
  const H = 960;
  const lm = syntheticLandmarks();

  it('returns finite pixel polygons for every zone id', () => {
    const zones = zonePolygonsPx(lm, W, H);
    expect(Object.keys(zones).sort()).toEqual(ZONE_IDS.slice().sort());
    for (const id of ZONE_IDS) {
      expect(zones[id].length).toBeGreaterThanOrEqual(3);
      for (const [x, y] of zones[id]) {
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
      }
      expect(isSimplePolygon(zones[id])).toBe(true);
    }
  });

  it('accepts [x, y] array landmarks too', () => {
    const arr = lm.map((l) => [l.x, l.y, l.z]);
    expect(zonePolygonsPx(arr, W, H).C).toEqual(zonePolygonsPx(lm, W, H).C);
  });

  it('keeps the customer-left zones on the image right for an un-mirrored frame', () => {
    const zones = zonePolygonsPx(lm, W, H);
    const midX = lm[CHIN_BOTTOM].x * W;
    expect(polygonCentroid(zones.K_L)[0]).toBeGreaterThan(midX);
    expect(polygonCentroid(zones.K_R)[0]).toBeLessThan(midX);
    const mirrored = zonePolygonsPx(lm, W, H, { mirror: true });
    expect(polygonCentroid(mirrored.K_L)[0]).toBeLessThan(W - midX);
  });

  it('places N below JAW_CONTOUR', () => {
    const zones = zonePolygonsPx(lm, W, H);
    const n = JAW_CONTOUR_FRONT.length;
    const oval = FACE_OVAL.map((i) => [lm[i].x * W, lm[i].y * H]);
    const chinY = lm[CHIN_BOTTOM].y * H;
    // N = contour (top edge, n points) + offset edge (n points), in some orientation.
    const pts = zones.N;
    expect(pts.length).toBe(2 * n);
    const jawPts = JAW_CONTOUR_FRONT.map((i) => [lm[i].x * W, lm[i].y * H]);
    const isJaw = (p) => jawPts.some((q) => Math.abs(q[0] - p[0]) < 1e-9 && Math.abs(q[1] - p[1]) < 1e-9);
    const lower = pts.filter((p) => !isJaw(p));
    expect(lower.length).toBe(n);
    for (const p of lower) {
      expect(pointInPolygon(p, oval)).toBe(false);
      // below the jaw contour point it was offset from (nearest in x)
      const src = jawPts.reduce((best, q) => (Math.abs(q[0] - p[0]) < Math.abs(best[0] - p[0]) ? q : best));
      expect(p[1]).toBeGreaterThan(src[1]);
    }
    expect(Math.max(...lower.map((p) => p[1]))).toBeGreaterThan(chinY);
    expect(polygonCentroid(pts)[1]).toBeGreaterThan(polygonCentroid(zones.C)[1]);
    // default depth = 0.35 * nose-tip-to-chin distance under the chin
    const noseChin = Math.hypot((lm[4].x - lm[152].x) * W, (lm[4].y - lm[152].y) * H);
    expect(Math.max(...lower.map((p) => p[1])) - chinY).toBeCloseTo(0.35 * noseChin, 0);
    const deeper = zonePolygonsPx(lm, W, H, { neckDepthPx: 200 }).N;
    expect(Math.max(...deeper.map((p) => p[1])) - chinY).toBeCloseTo(200, 0);
  });

  it('moves the K upper edge with cheekLineOffset and keeps K simple', () => {
    const base = zonePolygonsPx(lm, W, H);
    const area = (p) => Math.abs(polygonArea(p));
    const raised = zonePolygonsPx(lm, W, H, { cheekLineOffset: 0.15 });
    const lowered = zonePolygonsPx(lm, W, H, { cheekLineOffset: -0.15 });
    for (const id of ['K_L', 'K_R']) {
      expect(area(raised[id])).toBeGreaterThan(area(base[id]));
      expect(area(lowered[id])).toBeLessThan(area(base[id]));
    }
    for (const off of [-1, -0.5, -0.2, 0.2, 0.5, 1]) {
      const z = zonePolygonsPx(lm, W, H, { cheekLineOffset: off });
      for (const id of ['K_L', 'K_R']) {
        expect(isSimplePolygon(z[id]), `${id} @ ${off}`).toBe(true);
        expect(Math.sign(polygonArea(z[id]))).toBe(Math.sign(polygonArea(base[id])));
        for (const [x, y] of z[id]) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      }
    }
    // zero offset is exactly the static ring
    expect(zonePolygonsPx(lm, W, H, { cheekLineOffset: 0 }).K_L).toEqual(base.K_L);
  });
});

describe('zone UV helpers', () => {
  it('returns the mesh zones in UV space and as texture pixels', () => {
    const uv = zonePolygonsUV();
    expect(Object.keys(uv).sort()).toEqual(MESH_ZONE_IDS.slice().sort());
    const px = zonePolygonsUV({ size: 1024 });
    expect(px.M[0][0]).toBeCloseTo(uv.M[0][0] * 1024, 3);
    expect(px.M[0][1]).toBeCloseTo((1 - uv.M[0][1]) * 1024, 3);
    const c = zoneCentroidsUV();
    for (const id of MESH_ZONE_IDS) {
      expect(pointInPolygon(c[id], uv[id]) || id.startsWith('C')).toBe(true);
      for (const v of c[id]) expect(v).toBeGreaterThan(0);
    }
    expect(c.K_L[0]).toBeGreaterThan(0.5);
    expect(c.K_R[0]).toBeLessThan(0.5);
    expect(c.M[1]).toBeGreaterThan(c.C[1]);
    const cpx = zoneCentroidsUV({ size: 100 });
    expect(cpx.M[1]).toBeLessThan(cpx.C[1]);
  });
});

describe('faceMesh three.js helpers', () => {
  const W = 640;
  const H = 800;
  const lm = syntheticLandmarks();

  it('builds the geometry with uv and index', () => {
    const g = buildFaceGeometry(THREE);
    expect(g.getAttribute('position').count).toBe(N_LM);
    expect(g.getAttribute('uv').count).toBe(N_LM);
    expect(Array.from(g.getAttribute('uv').array)).toEqual(Array.from(CANONICAL_UV));
    expect(g.getIndex().count).toBe(898 * 3);
    expect(Array.from(g.getAttribute('position').array).every((v) => v === 0)).toBe(true);
  });

  it('writes y-up pixel positions with normals toward the camera, mirrored or not', () => {
    const g = buildFaceGeometry(THREE);
    for (const mirror of [false, true, false]) {
      updateFaceGeometry(g, lm, W, H, { mirror });
      const pos = g.getAttribute('position').array;
      const x152 = lm[152].x * W;
      expect(pos[3 * 152]).toBeCloseTo(mirror ? W - x152 : x152, 3);
      expect(pos[3 * 152 + 1]).toBeCloseTo((1 - lm[152].y) * H, 3);
      expect(pos[3 * 10 + 1]).toBeGreaterThan(pos[3 * 152 + 1]);
      // customer-left eye corner is on the right of the un-mirrored image
      expect(pos[3 * 263] > pos[3 * 33]).toBe(!mirror);
      const nrm = g.getAttribute('normal').array;
      expect(nrm[3 * 4 + 2]).toBeGreaterThan(0.9); // nose tip faces the camera
      let toward = 0;
      for (let i = 0; i < N_LM; i++) if (nrm[3 * i + 2] > 0) toward++;
      expect(toward).toBeGreaterThan(N_LM * 0.9);
      expect(g.boundingSphere).not.toBeNull();
    }
  });

  it('converts landmarks to image or scene pixels', () => {
    const img = landmarksToPx(lm, W, H);
    expect(img.length).toBe(lm.length);
    expect(img[152][1]).toBeCloseTo(lm[152].y * H, 6);
    const scene = landmarksToPx(lm, W, H, true, true);
    expect(scene[152][0]).toBeCloseTo(W - lm[152].x * W, 6);
    expect(scene[152][1]).toBeCloseTo(H - lm[152].y * H, 6);
    expect(scene[4][2]).toBeCloseTo(-lm[4].z * W, 6);
  });

  it('extrudes a beard shell below the jaw with jaw-to-tip UVs', () => {
    const g = buildFaceGeometry(THREE);
    updateFaceGeometry(g, lm, W, H);
    const contour = jawContourFromGeometry(g);
    expect(contour.length).toBe(JAW_CONTOUR.length);
    const lengths = contour.map((_, k) => 40 + 3 * k);
    const rows = 6;
    const shell = extrudeBelowJaw(THREE, contour, lengths, undefined, { rows });
    const cols = contour.length;
    const pos = shell.getAttribute('position').array;
    const uv = shell.getAttribute('uv').array;
    expect(shell.getAttribute('position').count).toBe(cols * (rows + 1));
    expect(shell.getIndex().count).toBe((cols - 1) * rows * 6);
    for (let k = 0; k < cols; k++) {
      const top = k;
      const tip = rows * cols + k;
      expect(pos[3 * top]).toBeCloseTo(contour[k][0], 4);
      expect(pos[3 * top + 1]).toBeCloseTo(contour[k][1], 4);
      expect(pos[3 * tip + 1]).toBeLessThan(contour[k][1]); // y-up: tip is below the jaw
      const reach = Math.hypot(pos[3 * tip] - contour[k][0], pos[3 * tip + 1] - contour[k][1]);
      expect(reach).toBeLessThanOrEqual(lengths[k] + 1e-3);
      expect(reach).toBeGreaterThan(lengths[k] * 0.8);
      expect(uv[2 * top + 1]).toBe(0);
      expect(uv[2 * tip + 1]).toBe(1);
    }
    expect(uv[0]).toBe(0);
    expect(uv[2 * (cols - 1)]).toBeCloseTo(1, 6);
    const nrm = shell.getAttribute('normal').array;
    expect(nrm[3 * (2 * cols + Math.floor(cols / 2)) + 2]).toBeGreaterThan(0.99);
    // in-place update keeps the same geometry object
    const again = extrudeBelowJaw(THREE, contour, 10, undefined, { rows, geometry: shell });
    expect(again).toBe(shell);
    // mirrored contour still faces the camera
    updateFaceGeometry(g, lm, W, H, { mirror: true });
    const mShell = extrudeBelowJaw(THREE, jawContourFromGeometry(g), 30, undefined, { rows: 2 });
    const mn = mShell.getAttribute('normal').array;
    expect(mn[3 * (cols + Math.floor(cols / 2)) + 2]).toBeGreaterThan(0.99);
  });
});
