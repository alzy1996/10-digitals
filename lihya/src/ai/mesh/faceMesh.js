/*
 * three.js helpers for the MediaPipe face mesh (468 landmarks, 898 triangles).
 *
 * Mesh topology and UV layout: MediaPipe canonical face model,
 * Copyright 2023 The MediaPipe Authors, Apache License 2.0,
 * https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj
 * (see ./tessellation.js and ./uv.js).
 *
 * THREE is passed in rather than imported so analysis code and workers can
 * import this module without pulling three.js into their bundle.
 *
 * ---------------------------------------------------------------------------
 * SCENE CONVENTION (relied upon by the renderer - do not change silently)
 * ---------------------------------------------------------------------------
 * Scene units are pixels of the image the landmarks were detected on.
 *   x_scene = landmark.x * width                (mirror: width - landmark.x * width)
 *   y_scene = (1 - landmark.y) * height         (y UP, 0 at the bottom edge)
 *   z_scene = -landmark.z * width * zScale      (positive = toward the camera)
 * MediaPipe z is a relative depth (face centre near 0, smaller = closer to
 * the camera) on roughly the same scale as x, hence the width factor.
 *
 * Camera: an orthographic camera whose frustum spans x 0..width and
 * y 0..height, looking down -z, for example
 *   const cam = new THREE.OrthographicCamera(0, width, height, 0, -10 * width, 10 * width);
 *   // cam.position stays at (0, 0, 0); the face lives around z = 0.
 * With that camera, a scene point lands exactly on the video pixel
 * (x_scene, height - y_scene) of a top-left-origin canvas of the same size.
 *
 * Winding: TRIANGLES (OBJ winding) are counter-clockwise when seen from +z
 * for the un-mirrored image, so the default THREE.FrontSide material is
 * correct and computeVertexNormals() points normals toward the camera.
 * Mirroring flips handedness; updateFaceGeometry reverses the index winding
 * whenever the mirror flag changes, so FrontSide stays correct either way.
 *
 * UVs: CANONICAL_UV in OBJ convention (v up), which matches a
 * THREE.CanvasTexture with the default flipY = true; paint the texture
 * canvas with uvToTexturePx / zonePolygonsUV({ size }).
 */

import { TRIANGLES, MESH_LANDMARK_COUNT } from './tessellation.js';
import { CANONICAL_UV } from './uv.js';
import { JAW_CONTOUR, polylineNormals2D } from './zones.js';

const lmX = (l) => (l.x !== undefined ? l.x : l[0]);
const lmY = (l) => (l.y !== undefined ? l.y : l[1]);
const lmZ = (l) => (l.z !== undefined ? l.z : l[2] || 0);

function assertLandmarks(landmarks) {
  if (!landmarks || landmarks.length < MESH_LANDMARK_COUNT) {
    throw new RangeError(
      `face mesh needs at least ${MESH_LANDMARK_COUNT} landmarks, got ${landmarks ? landmarks.length : landmarks}`,
    );
  }
}

/**
 * Converts normalized MediaPipe landmarks to pixels.
 *
 * @param {Array<{x:number,y:number,z?:number}>|Array<number[]>} landmarks
 * @param {number} width image width in px
 * @param {number} height image height in px
 * @param {boolean} [mirror=false] flip x (width - x) for a selfie display
 * @param {boolean} [yUp=false] false: image space, top-left origin, y down
 *   (canvas / zonePolygonsPx); true: scene space, y up (as updateFaceGeometry)
 * @returns {number[][]} [[x, y, z], ...] for every input landmark (iris
 *   points included); z = -landmark.z * width, positive toward the camera.
 */
export function landmarksToPx(landmarks, width, height, mirror = false, yUp = false) {
  const out = new Array(landmarks.length);
  for (let i = 0; i < landmarks.length; i++) {
    const l = landmarks[i];
    const x = lmX(l) * width;
    const y = lmY(l) * height;
    out[i] = [mirror ? width - x : x, yUp ? height - y : y, -lmZ(l) * width];
  }
  return out;
}

/**
 * Builds the face-mesh geometry: 468 positions (zero until the first
 * updateFaceGeometry), the CANONICAL_UV 'uv' attribute, a 'normal'
 * attribute, and the TRIANGLES index.
 *
 * @param {typeof import('three')} THREE
 * @returns {import('three').BufferGeometry}
 */
export function buildFaceGeometry(THREE) {
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(MESH_LANDMARK_COUNT * 3), 3);
  position.setUsage(THREE.DynamicDrawUsage);
  const normal = new THREE.BufferAttribute(new Float32Array(MESH_LANDMARK_COUNT * 3), 3);
  normal.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setAttribute('normal', normal);
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(CANONICAL_UV), 2));
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(TRIANGLES), 1));
  geometry.userData.lihyaMirrored = false;
  geometry.name = 'lihya-face-mesh';
  return geometry;
}

/**
 * Writes landmark positions into a geometry from buildFaceGeometry, in scene
 * space (see SCENE CONVENTION at the top of this file), then recomputes the
 * vertex normals and bounds.
 *
 * @param {import('three').BufferGeometry} geometry
 * @param {Array<{x:number,y:number,z:number}>|Array<number[]>} landmarks
 *   normalized landmarks of the UN-mirrored frame (468 or 478 entries)
 * @param {number} width image width in px
 * @param {number} height image height in px
 * @param {{mirror?: boolean, zScale?: number}} [opts]
 * @returns {import('three').BufferGeometry} the same geometry
 */
export function updateFaceGeometry(geometry, landmarks, width, height, { mirror = false, zScale = 1 } = {}) {
  assertLandmarks(landmarks);
  const posAttr = geometry.getAttribute('position');
  const pos = posAttr.array;
  for (let i = 0; i < MESH_LANDMARK_COUNT; i++) {
    const l = landmarks[i];
    const x = lmX(l) * width;
    pos[3 * i] = mirror ? width - x : x;
    pos[3 * i + 1] = (1 - lmY(l)) * height;
    pos[3 * i + 2] = -lmZ(l) * width * zScale;
  }
  posAttr.needsUpdate = true;

  if (Boolean(mirror) !== Boolean(geometry.userData.lihyaMirrored)) {
    const index = geometry.getIndex();
    const idx = index.array;
    for (let t = 0; t < idx.length; t += 3) {
      const b = idx[t + 1];
      idx[t + 1] = idx[t + 2];
      idx[t + 2] = b;
    }
    index.needsUpdate = true;
    geometry.userData.lihyaMirrored = Boolean(mirror);
  }

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Reads the JAW_CONTOUR points (or any landmark list) back out of an updated
 * face geometry, in scene space.
 *
 * @param {import('three').BufferGeometry} geometry
 * @param {number[]} [indices=JAW_CONTOUR]
 * @returns {number[][]} [[x, y, z], ...]
 */
export function jawContourFromGeometry(geometry, indices = JAW_CONTOUR) {
  const pos = geometry.getAttribute('position').array;
  return indices.map((i) => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]);
}

/**
 * Outward 2D normals of a jaw contour in scene space (y up): unit vectors
 * perpendicular to the contour, pointing away from the face (downward).
 *
 * @param {number[][]} contour [[x, y(, z)], ...]
 * @param {number[]} [down=[0, -1]] face-down direction in the same space
 * @returns {number[][]} [[nx, ny], ...]
 */
export function jawNormals2D(contour, down = [0, -1]) {
  return polylineNormals2D(contour, down);
}

/**
 * Builds (or updates in place) the "beard shell": a triangle strip hanging
 * below the jaw contour, for beards longer than the face mesh.
 *
 * Column k starts at contour[k] and grows lengthPx[k] pixels, leaving along
 * normals2D[k] and bending toward `down` with `gravity`. z stays at the
 * contour point's z (+ zOffset).
 *
 * UVs: u runs along the jaw 0..1 (arc length, contour order), v is 0 at the
 * jaw and 1 at the tip. With a CanvasTexture (flipY = true) that puts the jaw
 * on the canvas BOTTOM row; use texture.flipY = false to paint the jaw at the
 * top instead.
 *
 * @param {typeof import('three')} THREE
 * @param {number[][]} contour scene-space points [[x, y(, z)], ...], e.g.
 *   jawContourFromGeometry(faceGeometry)
 * @param {number[]|number} lengthPx beard length per contour point (or one
 *   value for all), in px
 * @param {number[][]} [normals2D] unit outward normals per point; defaults
 *   to jawNormals2D(contour, opts.down)
 * @param {object} [opts]
 * @param {number} [opts.rows=8] segments from jaw to tip
 * @param {number} [opts.gravity=0.5] 0 = straight along the normal,
 *   1 = fully turned to `down` by the tip
 * @param {number[]} [opts.down=[0, -1]] face-down direction (scene space)
 * @param {number} [opts.zOffset=0] added to every z (e.g. a small positive
 *   value to keep the shell in front of the neck)
 * @param {import('three').BufferGeometry} [opts.geometry] a geometry returned
 *   by a previous call with the same contour length and rows; it is updated
 *   in place instead of allocating a new one
 * @returns {import('three').BufferGeometry}
 */
export function extrudeBelowJaw(THREE, contour, lengthPx, normals2D, opts = {}) {
  const { rows = 8, gravity = 0.5, down = [0, -1], zOffset = 0 } = opts;
  const cols = contour.length;
  if (cols < 2) throw new RangeError('extrudeBelowJaw needs at least 2 contour points');
  if (!(rows >= 1)) throw new RangeError('extrudeBelowJaw needs rows >= 1');
  const normals = normals2D || jawNormals2D(contour, down);
  const lengthAt = (k) => Math.max(0, Array.isArray(lengthPx) ? lengthPx[k] || 0 : lengthPx || 0);
  const dl = Math.hypot(down[0], down[1]) || 1;
  const dn = [down[0] / dl, down[1] / dl];

  const vertCount = cols * (rows + 1);
  let geometry = opts.geometry;
  const reuse =
    geometry && geometry.getAttribute('position') && geometry.getAttribute('position').count === vertCount;
  if (!reuse) {
    geometry = new THREE.BufferGeometry();
    const position = new THREE.BufferAttribute(new Float32Array(vertCount * 3), 3);
    position.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', position);
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(vertCount * 2), 2));
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array((cols - 1) * rows * 6), 1));
    geometry.name = 'lihya-beard-shell';
  }
  const pos = geometry.getAttribute('position').array;
  const uv = geometry.getAttribute('uv').array;
  const idx = geometry.getIndex().array;

  // u by arc length along the contour.
  const cum = [0];
  for (let k = 1; k < cols; k++) {
    cum.push(cum[k - 1] + Math.hypot(contour[k][0] - contour[k - 1][0], contour[k][1] - contour[k - 1][1]));
  }
  const total = cum[cols - 1] || 1;

  for (let k = 0; k < cols; k++) {
    const p = contour[k];
    const n = normals[k];
    const step = lengthAt(k) / rows;
    let x = p[0];
    let y = p[1];
    const z = (p[2] || 0) + zOffset;
    for (let r = 0; r <= rows; r++) {
      if (r > 0) {
        const g = gravity * ((r - 0.5) / rows);
        let dx = n[0] * (1 - g) + dn[0] * g;
        let dy = n[1] * (1 - g) + dn[1] * g;
        const l = Math.hypot(dx, dy) || 1;
        dx /= l;
        dy /= l;
        x += dx * step;
        y += dy * step;
      }
      const v = r * cols + k;
      pos[3 * v] = x;
      pos[3 * v + 1] = y;
      pos[3 * v + 2] = z;
      uv[2 * v] = cum[k] / total;
      uv[2 * v + 1] = r / rows;
    }
  }

  // Winding: counter-clockwise as seen from +z, whichever way the contour runs.
  let signed = 0;
  for (let k = 0; k + 1 < cols; k++) {
    const a = k;
    const b = k + 1;
    const c = cols + k;
    signed +=
      (pos[3 * b] - pos[3 * a]) * (pos[3 * c + 1] - pos[3 * a + 1]) -
      (pos[3 * b + 1] - pos[3 * a + 1]) * (pos[3 * c] - pos[3 * a]);
  }
  const flip = signed < 0;
  let w = 0;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k + 1 < cols; k++) {
      const a = r * cols + k;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      if (!flip) {
        idx[w++] = a;
        idx[w++] = b;
        idx[w++] = c;
        idx[w++] = b;
        idx[w++] = d;
        idx[w++] = c;
      } else {
        idx[w++] = a;
        idx[w++] = c;
        idx[w++] = b;
        idx[w++] = b;
        idx[w++] = c;
        idx[w++] = d;
      }
    }
  }

  geometry.getAttribute('position').needsUpdate = true;
  geometry.getAttribute('uv').needsUpdate = true;
  geometry.getIndex().needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.rows = rows;
  geometry.userData.cols = cols;
  return geometry;
}
