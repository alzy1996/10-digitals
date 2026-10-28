// Metric scale from the iris (PRD 5.3). The adult horizontal iris diameter is
// about 11.7 +/- 0.5 mm (MediaPipe Iris, Google Research), so
// mmPerPx = IRIS_MM / irisWidthPx on the face plane.
//
// Iris landmarks 468..477: per eye a centre and four edge points. The horizontal
// pair is picked at run time as the edge pair with the largest x-distance (not by a
// hard-coded index). Both eyes are averaged when |yaw| < 10 deg; otherwise the eye
// nearer the camera is used (yaw > 0 = customer turned to his left, so his RIGHT
// eye is nearer; see capture/poseGate.js).

import { IRIS } from '../mesh/zones.js';

export const IRIS_MM = 11.7;
export const IRIS_SD_MM = 0.5;
export const YAW_AVERAGE_MAX = 10;

/** Typical adult zygion-to-zygion width at MediaPipe points 234 / 454, used only when no iris exists. */
const FACE_WIDTH_MM = 142;

/**
 * Horizontal iris diameter in pixels for one eye ('L' or 'R', customer's side).
 * NaN when the iris landmarks are missing.
 */
export function irisWidthPx(landmarks, width, height, side) {
  const ring = IRIS[side] && IRIS[side].ring;
  if (!landmarks || !ring || landmarks.length < 478) return NaN;
  const pts = ring.map((i) => [landmarks[i].x * width, landmarks[i].y * height]);
  let best = -1;
  let dist = NaN;
  for (let a = 0; a < pts.length; a++) {
    for (let b = a + 1; b < pts.length; b++) {
      const dx = Math.abs(pts[a][0] - pts[b][0]);
      if (dx > best) {
        best = dx;
        dist = Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]);
      }
    }
  }
  return dist;
}

/**
 * Iris width used for the scale: { px, eye: 'both'|'L'|'R', left, right }.
 */
export function irisForScale(landmarks, width, height, yaw = 0) {
  const left = irisWidthPx(landmarks, width, height, 'L');
  const right = irisWidthPx(landmarks, width, height, 'R');
  const y = Number.isFinite(yaw) ? yaw : 0;
  if (Math.abs(y) < YAW_AVERAGE_MAX) {
    if (Number.isFinite(left) && Number.isFinite(right)) return { px: (left + right) / 2, eye: 'both', left, right };
  }
  const near = y > 0 ? 'R' : 'L';
  const nearPx = near === 'R' ? right : left;
  const farPx = near === 'R' ? left : right;
  if (Number.isFinite(nearPx)) return { px: nearPx, eye: near, left, right };
  if (Number.isFinite(farPx)) return { px: farPx, eye: near === 'R' ? 'L' : 'R', left, right };
  return { px: NaN, eye: null, left, right };
}

/**
 * Millimetres per pixel of the given frame. Returns { mmPerPx, source, confidence,
 * irisPx, eye }. source is 'iris', or 'faceWidth' (population average, low
 * confidence) when the iris points are missing or implausibly small.
 */
export function mmPerPx(landmarks, width, height, yaw = 0) {
  const iris = irisForScale(landmarks, width, height, yaw);
  if (Number.isFinite(iris.px) && iris.px >= 4) {
    const sizeConf = Math.min(1, Math.max(0, (iris.px - 6) / 24));
    let agree = 1;
    if (iris.eye === 'both') {
      const rel = Math.abs(iris.left - iris.right) / iris.px;
      agree = Math.max(0, 1 - Math.max(0, rel - 0.06) * 4);
    }
    const yawConf = Math.abs(yaw) < YAW_AVERAGE_MAX ? 1 : 0.85;
    const confidence = Math.round(0.92 * (0.4 + 0.6 * sizeConf) * agree * yawConf * 100) / 100;
    return { mmPerPx: IRIS_MM / iris.px, source: 'iris', confidence, irisPx: iris.px, eye: iris.eye };
  }
  if (landmarks && landmarks.length >= 468) {
    const a = landmarks[234];
    const b = landmarks[454];
    const facePx = Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
    if (facePx > 0) return { mmPerPx: FACE_WIDTH_MM / facePx, source: 'faceWidth', confidence: 0.3, irisPx: NaN, eye: null };
  }
  return { mmPerPx: NaN, source: 'none', confidence: 0, irisPx: NaN, eye: null };
}
