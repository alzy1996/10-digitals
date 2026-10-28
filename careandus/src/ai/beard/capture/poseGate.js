// Head pose and the pose gates of the guided 4-shot capture (PRD 5.2).
//
// SIGN CONVENTIONS (degrees, always the CUSTOMER's own left/right, independent of
// how the preview is mirrored):
//   yaw   > 0  the customer turned his head to HIS LEFT (his nose points toward
//              the right side of the un-mirrored camera image)
//   pitch > 0  chin up (face tilted up, looking above the camera)
//   roll  > 0  head tilted toward HIS LEFT shoulder (his left ear drops)
//
// poseFromMatrix reads MediaPipe's facial transformation matrix: a column-major
// 4x4 from the canonical face model (x = subject's left, y up, z out of the face)
// to camera space (x right in the un-mirrored image, y up, z toward the viewer).
// For a face looking straight into the lens the rotation is the identity.
// Angles are relative to the camera axis, not to the line of sight.
//
// pose = R_y(yaw) * R_x(-pitch) * R_z(-roll); forward f = R * [0,0,1] gives
// yaw = atan2(f.x, f.z), pitch = asin(f.y).

import { CANONICAL_VERTICES } from '../mesh/tessellation.js';
import { FOREHEAD_TOP, CHIN_BOTTOM } from '../mesh/zones.js';

const DEG = 180 / Math.PI;

/** Shot order of a full capture. Quick mode is the front shot only. */
export const SHOT_ORDER = Object.freeze(['front', 'left', 'right', 'chinUp']);

export function shotsForMode(mode) {
  return mode === 'quick' ? ['front'] : [...SHOT_ORDER];
}

/**
 * Pose windows per shot. front: |yaw| and |pitch| <= 5. left / right: yaw 35..55
 * toward the customer's left / right, pitch within 15 so the profile stays level.
 * chinUp: pitch up 20..30, yaw within 10 so the neck is seen square on.
 */
export const GATES = Object.freeze({
  front: { yaw: [-5, 5], pitch: [-5, 5] },
  left: { yaw: [35, 55], pitch: [-15, 15] },
  right: { yaw: [-55, -35], pitch: [-15, 15] },
  chinUp: { yaw: [-10, 10], pitch: [20, 30] },
});

/** Pose hold before the auto-shutter fires, in ms. */
export const HOLD_MS = 400;

function rotationOf(m) {
  const d = m && m.data ? m.data : m;
  if (!d || d.length < 11) return null;
  return {
    r: [d[0], d[1], d[2]],
    u: [d[4], d[5], d[6]],
    f: [d[8], d[9], d[10]],
  };
}

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** { yaw, pitch, roll } in degrees from a column-major 4x4 (array or { data }). null if invalid. */
export function poseFromMatrix(matrix) {
  const R = rotationOf(matrix);
  if (!R) return null;
  const f = normalize(R.f);
  const r = normalize(R.r);
  const yaw = Math.atan2(f[0], f[2]);
  const pitch = Math.asin(Math.max(-1, Math.min(1, f[1])));
  // Undo yaw (about y) then the pitch rotation (about x) on the face's x axis:
  // what is left is the in-plane roll.
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = cy * r[0] - sy * r[2];
  const y1 = r[1];
  const z1 = sy * r[0] + cy * r[2];
  const a = -pitch;
  const y2 = Math.cos(a) * y1 + Math.sin(a) * z1;
  const phi = Math.atan2(y2, x1);
  return { yaw: yaw * DEG, pitch: pitch * DEG, roll: -phi * DEG };
}

/** Symmetric landmark pairs [subject-left, subject-right] used for the face x axis. */
const AXIS_PAIRS = Object.freeze([
  [454, 234],
  [263, 33],
  [362, 133],
  [291, 61],
  [356, 127],
  [397, 172],
  [280, 50],
]);

function axesFrom(get) {
  let x = [0, 0, 0];
  for (const [l, r] of AXIS_PAIRS) {
    const a = get(l);
    const b = get(r);
    x = [x[0] + a[0] - b[0], x[1] + a[1] - b[1], x[2] + a[2] - b[2]];
  }
  x = normalize(x);
  const top = get(FOREHEAD_TOP);
  const chin = get(CHIN_BOTTOM);
  let y = [top[0] - chin[0], top[1] - chin[1], top[2] - chin[2]];
  const dot = y[0] * x[0] + y[1] * x[1] + y[2] * x[2];
  y = normalize([y[0] - dot * x[0], y[1] - dot * x[1], y[2] - dot * x[2]]);
  const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  return [x, y, z];
}

const CANON_AXES = axesFrom((i) => [CANONICAL_VERTICES[3 * i], CANONICAL_VERTICES[3 * i + 1], CANONICAL_VERTICES[3 * i + 2]]);

/**
 * Pose from the 3D landmarks when no transformation matrix is available. The face
 * axes are built from symmetric landmark pairs and the forehead-chin line, in a
 * y-up, z-toward-viewer frame (x * width, -y * height, -z * width), and compared
 * with the same axes on the canonical face model.
 */
export function poseFromLandmarks(landmarks, width = 1, height = 1) {
  if (!landmarks || landmarks.length < 468) return null;
  const get = (i) => {
    const l = landmarks[i];
    return [l.x * width, -l.y * height, -(l.z || 0) * width];
  };
  const obs = axesFrom(get);
  // R = Obs * Canon^T, with the axes as matrix columns. Column-major 4x4 output.
  const R = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += obs[k][i] * CANON_AXES[k][j];
      R[i][j] = s;
    }
  }
  const m = [R[0][0], R[1][0], R[2][0], 0, R[0][1], R[1][1], R[2][1], 0, R[0][2], R[1][2], R[2][2], 0, 0, 0, 0, 1];
  return poseFromMatrix(m);
}

/** Pose from a detection: the matrix when present, else the landmarks. */
export function poseOf({ matrix, landmarks, width = 1, height = 1 }) {
  return (matrix && poseFromMatrix(matrix)) || poseFromLandmarks(landmarks, width, height);
}

const within = (v, [lo, hi]) => v >= lo && v <= hi;

/**
 * Checks a pose against a shot gate. Returns { ok, hint } where hint is the pose
 * correction for the customer ('turnLeft' | 'turnRight' | 'chinUp' | 'chinDown' |
 * 'lookStraight') or null when the pose is inside the window.
 */
export function checkPose(shotId, pose) {
  const gate = GATES[shotId];
  if (!gate || !pose) return { ok: false, hint: 'noFace' };
  const yawOk = within(pose.yaw, gate.yaw);
  const pitchOk = within(pose.pitch, gate.pitch);
  if (yawOk && pitchOk) return { ok: true, hint: null };
  const yawHint = pose.yaw < gate.yaw[0] ? 'turnLeft' : 'turnRight';
  const pitchHint = pose.pitch < gate.pitch[0] ? 'chinUp' : 'chinDown';
  if (shotId === 'front') {
    if (!yawOk && !pitchOk) return { ok: false, hint: 'lookStraight' };
    return { ok: false, hint: yawOk ? pitchHint : yawHint };
  }
  if (shotId === 'chinUp') {
    if (!pitchOk) return { ok: false, hint: pitchHint };
    return { ok: false, hint: 'lookStraight' };
  }
  return { ok: false, hint: yawOk ? pitchHint : yawHint };
}
