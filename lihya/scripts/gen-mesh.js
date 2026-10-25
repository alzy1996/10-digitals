#!/usr/bin/env node
/*
 * gen-mesh.js
 *
 * Regenerates the face-mesh data modules from the MediaPipe canonical face
 * model OBJ:
 *
 *   src/ai/mesh/uv.js            CANONICAL_UV (per-landmark u,v) + uvToTexturePx
 *   src/ai/mesh/tessellation.js  TRIANGLES (0-based landmark indices) + CANONICAL_VERTICES
 *
 * Usage:
 *   node scripts/gen-mesh.js <path-to-canonical_face_model.obj>
 *
 * The OBJ stores positions (`v`, one per MediaPipe landmark, in landmark order)
 * and texture coordinates (`vt`) in two independent index spaces: vertex i does
 * NOT use vt i. The UV of landmark i is therefore resolved through the `f`
 * records (`f v/vt v/vt v/vt`). The script aborts if a vertex is referenced
 * with two different vt indices, or never referenced at all, so the generated
 * per-landmark table is always unambiguous.
 *
 * Output is deterministic: numbers are written with a fixed 6-decimal format
 * (the precision of the source file) and in source order.
 *
 * Source model: Copyright 2023 The MediaPipe Authors, Apache License 2.0.
 * https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_VERTICES = 468;
const EXPECTED_FACES = 898;

const SOURCE_URL =
  'https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'src', 'ai', 'mesh');

function fail(msg) {
  process.stderr.write(`gen-mesh: ${msg}\n`);
  process.exit(1);
}

/** Parses the OBJ text into { positions: number[][], texcoords: number[][], faces: [v,vt][][] }. */
export function parseObj(text) {
  const positions = [];
  const texcoords = [];
  const faces = [];
  const lines = text.split(/\r?\n/);
  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln].trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    const tag = parts[0];
    if (tag === 'v') {
      const p = parts.slice(1, 4).map(Number);
      if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) fail(`bad v at line ${ln + 1}`);
      positions.push(p);
    } else if (tag === 'vt') {
      const t = parts.slice(1, 3).map(Number);
      if (t.length !== 2 || t.some((n) => !Number.isFinite(n))) fail(`bad vt at line ${ln + 1}`);
      texcoords.push(t);
    } else if (tag === 'f') {
      const corners = parts.slice(1).map((c) => {
        const [v, vt] = c.split('/').map((s) => parseInt(s, 10));
        if (!Number.isInteger(v) || !Number.isInteger(vt)) fail(`bad f corner "${c}" at line ${ln + 1}`);
        return [v - 1, vt - 1];
      });
      if (corners.length !== 3) fail(`non-triangle face at line ${ln + 1}`);
      faces.push(corners);
    }
  }
  return { positions, texcoords, faces };
}

/** Resolves the per-vertex UV through the faces. Returns { uvIndex: Int32Array, problems: string[] }. */
export function resolveVertexUv(positions, texcoords, faces) {
  const uvIndex = new Int32Array(positions.length).fill(-1);
  const problems = [];
  for (const face of faces) {
    for (const [v, vt] of face) {
      if (v < 0 || v >= positions.length) problems.push(`face references missing vertex ${v + 1}`);
      else if (vt < 0 || vt >= texcoords.length) problems.push(`face references missing vt ${vt + 1}`);
      else if (uvIndex[v] === -1) uvIndex[v] = vt;
      else if (uvIndex[v] !== vt) problems.push(`vertex ${v} uses vt ${uvIndex[v]} and vt ${vt}`);
    }
  }
  for (let i = 0; i < uvIndex.length; i++) {
    if (uvIndex[i] === -1) problems.push(`vertex ${i} is not referenced by any face`);
  }
  return { uvIndex, problems };
}

const fmt = (n) => {
  const s = n.toFixed(6);
  return s === '-0.000000' ? '0.000000' : s;
};

const HEADER = (title, body) => `/*
 * ${title}
 *
 * GENERATED FILE - do not edit by hand. Regenerate with:
 *   node scripts/gen-mesh.js <path-to-canonical_face_model.obj>
 *
 * Derived from the MediaPipe canonical face model.
 *
 * Copyright 2023 The MediaPipe Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Source: ${SOURCE_URL}
 *
 * Modifications by LIHYA: the OBJ records were re-indexed into per-landmark
 * typed arrays (see below); no values were altered.
 *
${body
  .split('\n')
  .map((l) => (l ? ` * ${l}` : ' *'))
  .join('\n')}
 */
`;

function buildUvModule(positions, texcoords, uvIndex) {
  const rows = [];
  for (let i = 0; i < positions.length; i++) {
    const [u, v] = texcoords[uvIndex[i]];
    rows.push(`  ${fmt(u)}, ${fmt(v)}, // ${i}`);
  }
  const header = HEADER(
    'Per-landmark UV coordinates of the MediaPipe face mesh.',
    `CANONICAL_UV[2*i], CANONICAL_UV[2*i+1] is the (u, v) of face landmark i
(0..467), resolved through the OBJ faces (OBJ vertex i uses vt index != i).

UV convention: OBJ / OpenGL, origin at the BOTTOM-left. v grows upward:
the chin (152) has v ~ 0.05 and the forehead top (10) has v ~ 0.89.
u grows toward the subject's LEFT side (landmark 263/454 side, u > 0.5).

three.js: NO flip is needed. A THREE.CanvasTexture / THREE.Texture with the
default flipY = true maps canvas row 0 (top) to v = 1, which is exactly the
OBJ convention, so CANONICAL_UV can be used as the geometry 'uv' attribute
directly and a canvas painted upright (forehead at the top) samples correctly.

Canvas (top-left origin) painting: use uvToTexturePx, which returns
x = u * width, y = (1 - v) * height. If a texture is ever created with
flipY = false, paint with y = v * height instead.`,
  );
  return `${header}
/** Number of mesh landmarks covered by CANONICAL_UV (iris points 468..477 have no UV). */
export const UV_LANDMARK_COUNT = ${positions.length};

/** Float32Array(${positions.length} * 2): u, v per landmark, OBJ convention (v up). */
export const CANONICAL_UV = new Float32Array([
${rows.join('\n')}
]);

/**
 * Pixel position of landmark i inside a top-left-origin texture canvas, matching
 * how three.js samples a CanvasTexture with flipY = true (the default).
 *
 * @param {number} i landmark index, 0..${positions.length - 1}
 * @param {number} size canvas width in px (and height, unless height is given)
 * @param {number} [height=size] canvas height in px
 * @returns {[number, number]} [x, y], y measured downward from the top edge
 */
export function uvToTexturePx(i, size, height = size) {
  if (!(i >= 0 && i < UV_LANDMARK_COUNT)) {
    throw new RangeError(\`uvToTexturePx: landmark \${i} has no UV (0..\${UV_LANDMARK_COUNT - 1})\`);
  }
  return [CANONICAL_UV[2 * i] * size, (1 - CANONICAL_UV[2 * i + 1]) * height];
}
`;
}

function buildTessellationModule(positions, faces) {
  const triRows = [];
  const perLine = 4;
  for (let t = 0; t < faces.length; t += perLine) {
    const chunk = faces.slice(t, t + perLine).map((f) => f.map((c) => c[0]).join(', '));
    triRows.push(`  ${chunk.join(',   ')},`);
  }
  const vRows = positions.map((p, i) => `  ${p.map(fmt).join(', ')}, // ${i}`);
  const header = HEADER(
    'Triangle tessellation and canonical positions of the MediaPipe face mesh.',
    `TRIANGLES: ${faces.length} triangles as 0-based landmark indices, in OBJ order
and OBJ winding. Seen from the front (+z toward the viewer, y up) the winding
is counter-clockwise for the visible face surface (a few triangles at the
far sides of the head, near the ears, fold away and read clockwise).

CANONICAL_VERTICES: the OBJ positions in centimetres, landmark order.
Coordinate frame: right-handed, y up, z out of the face toward the viewer
(nose tip 4 has the largest z). +x is the SUBJECT'S LEFT side
(landmarks 263 / 454 have x > 0; 33 / 234 have x < 0).`,
  );
  return `${header}
/** Number of face-mesh landmarks with geometry (iris points 468..477 excluded). */
export const MESH_LANDMARK_COUNT = ${positions.length};

/** Number of triangles in TRIANGLES. */
export const TRIANGLE_COUNT = ${faces.length};

/** Uint16Array(${faces.length} * 3): triangle corner landmark indices, OBJ winding. */
export const TRIANGLES = new Uint16Array([
${triRows.join('\n')}
]);

/** Float32Array(${positions.length} * 3): canonical x, y, z per landmark, centimetres. */
export const CANONICAL_VERTICES = new Float32Array([
${vRows.join('\n')}
]);
`;
}

function main() {
  const objPath = process.argv[2];
  if (!objPath) fail('usage: node scripts/gen-mesh.js <path-to-canonical_face_model.obj>');
  const { positions, texcoords, faces } = parseObj(readFileSync(objPath, 'utf8'));

  if (positions.length !== EXPECTED_VERTICES) fail(`expected ${EXPECTED_VERTICES} v records, got ${positions.length}`);
  if (faces.length !== EXPECTED_FACES) fail(`expected ${EXPECTED_FACES} f records, got ${faces.length}`);

  const { uvIndex, problems } = resolveVertexUv(positions, texcoords, faces);
  if (problems.length) fail(`UV resolution failed:\n  ${problems.slice(0, 20).join('\n  ')}`);
  for (let i = 0; i < uvIndex.length; i++) {
    const [u, v] = texcoords[uvIndex[i]];
    if (u < 0 || u > 1 || v < 0 || v > 1) fail(`UV of vertex ${i} outside [0,1]: ${u}, ${v}`);
  }

  mkdirSync(outDir, { recursive: true });
  const uvPath = resolve(outDir, 'uv.js');
  const tessPath = resolve(outDir, 'tessellation.js');
  writeFileSync(uvPath, buildUvModule(positions, texcoords, uvIndex));
  writeFileSync(tessPath, buildTessellationModule(positions, faces));
  process.stdout.write(
    `gen-mesh: ${positions.length} landmarks, ${faces.length} triangles, ` +
      `every vertex resolves to exactly one vt.\n  wrote ${uvPath}\n  wrote ${tessPath}\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
