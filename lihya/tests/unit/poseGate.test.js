// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { CANONICAL_VERTICES } from '../../src/ai/mesh/tessellation.js';
import {
  poseFromMatrix,
  poseFromLandmarks,
  poseOf,
  checkPose,
  shotsForMode,
  GATES,
  SHOT_ORDER,
} from '../../src/ai/capture/poseGate.js';

const rad = (d) => (d * Math.PI) / 180;

function mul(A, B) {
  return A.map((row) => [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
}

/** R = Ry(yaw) * Rx(-pitch) * Rz(-roll): the documented pose convention. */
function rotation(yaw, pitch, roll = 0) {
  const ry = [
    [Math.cos(rad(yaw)), 0, Math.sin(rad(yaw))],
    [0, 1, 0],
    [-Math.sin(rad(yaw)), 0, Math.cos(rad(yaw))],
  ];
  const a = rad(-pitch);
  const rx = [
    [1, 0, 0],
    [0, Math.cos(a), -Math.sin(a)],
    [0, Math.sin(a), Math.cos(a)],
  ];
  const c = rad(-roll);
  const rz = [
    [Math.cos(c), -Math.sin(c), 0],
    [Math.sin(c), Math.cos(c), 0],
    [0, 0, 1],
  ];
  return mul(mul(ry, rx), rz);
}

/** Column-major 4x4 like MediaPipe's facialTransformationMatrixes[0].data. */
function matrix(yaw, pitch, roll = 0) {
  const R = rotation(yaw, pitch, roll);
  return [R[0][0], R[1][0], R[2][0], 0, R[0][1], R[1][1], R[2][1], 0, R[0][2], R[1][2], R[2][2], 0, 0.4, 22, -65, 1];
}

/** Canonical face rotated by the pose and projected orthographically to normalized landmarks. */
function landmarks(yaw, pitch, roll = 0, W = 1280, H = 720, s = 18) {
  const R = rotation(yaw, pitch, roll);
  const out = [];
  for (let i = 0; i < 468; i++) {
    const v = [CANONICAL_VERTICES[3 * i], CANONICAL_VERTICES[3 * i + 1], CANONICAL_VERTICES[3 * i + 2]];
    const p = R.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
    out.push({ x: (W / 2 + p[0] * s) / W, y: (H / 2 - p[1] * s) / H, z: (-p[2] * s) / W });
  }
  return out;
}

describe('poseFromMatrix', () => {
  it('reads the identity as a frontal face', () => {
    const p = poseFromMatrix(matrix(0, 0, 0));
    expect(p.yaw).toBeCloseTo(0, 6);
    expect(p.pitch).toBeCloseTo(0, 6);
    expect(p.roll).toBeCloseTo(0, 6);
  });

  it('recovers yaw, pitch and roll with the documented signs', () => {
    for (const [yaw, pitch, roll] of [
      [40, 0, 0],
      [-45, 5, 0],
      [0, 25, 0],
      [12, -8, 6],
      [-30, 12, -9],
    ]) {
      const p = poseFromMatrix(matrix(yaw, pitch, roll));
      expect(p.yaw).toBeCloseTo(yaw, 6);
      expect(p.pitch).toBeCloseTo(pitch, 6);
      expect(p.roll).toBeCloseTo(roll, 6);
    }
  });

  it('accepts MediaPipe { data } matrices', () => {
    // Facial transformation matrix of a near-frontal portrait (MediaPipe 1.1.1 output):
    // nose slightly toward image right (customer's left), chin slightly down.
    const data = [
      0.9996375, 0.0099093, -0.0250419, 0, -0.0085715, 0.9985592, 0.0529756, 0, 0.0255308, -0.0527418, 0.9982823, 0,
      -0.4058, 22.3904, -65.2195, 1,
    ];
    const p = poseFromMatrix({ data });
    expect(p.yaw).toBeGreaterThan(1);
    expect(p.yaw).toBeLessThan(2);
    expect(p.pitch).toBeLessThan(-2.5);
    expect(p.pitch).toBeGreaterThan(-3.5);
    expect(Math.abs(p.roll)).toBeLessThan(1);
  });

  it('rejects invalid input', () => {
    expect(poseFromMatrix(null)).toBeNull();
    expect(poseFromMatrix([1, 2, 3])).toBeNull();
  });
});

describe('poseFromLandmarks (fallback without a matrix)', () => {
  it('recovers the pose of a rotated canonical face', () => {
    for (const [yaw, pitch] of [
      [0, 0],
      [45, 0],
      [-40, 3],
      [0, 25],
      [8, -6],
    ]) {
      const p = poseFromLandmarks(landmarks(yaw, pitch), 1280, 720);
      expect(Math.abs(p.yaw - yaw)).toBeLessThan(1.5);
      expect(Math.abs(p.pitch - pitch)).toBeLessThan(1.5);
    }
  });

  it('is used by poseOf when the matrix is missing', () => {
    const p = poseOf({ matrix: null, landmarks: landmarks(38, 0), width: 1280, height: 720 });
    expect(p.yaw).toBeGreaterThan(36);
    expect(poseOf({ matrix: matrix(-20, 0), landmarks: landmarks(38, 0), width: 1280, height: 720 }).yaw).toBeCloseTo(-20, 6);
  });
});

describe('shot gates (PRD 5.2)', () => {
  const gate = (shot, yaw, pitch) => checkPose(shot, poseFromMatrix(matrix(yaw, pitch)));

  it('front: |yaw| and |pitch| within 5 degrees', () => {
    expect(gate('front', 0, 0).ok).toBe(true);
    expect(gate('front', 4.9, -4.9).ok).toBe(true);
    expect(gate('front', 6, 0)).toEqual({ ok: false, hint: 'turnRight' });
    expect(gate('front', -6, 0)).toEqual({ ok: false, hint: 'turnLeft' });
    expect(gate('front', 0, 7)).toEqual({ ok: false, hint: 'chinDown' });
    expect(gate('front', 0, -7)).toEqual({ ok: false, hint: 'chinUp' });
    expect(gate('front', 12, 12)).toEqual({ ok: false, hint: 'lookStraight' });
  });

  it('left 45: yaw 35..55 toward the customer\'s left', () => {
    expect(gate('left', 45, 0).ok).toBe(true);
    expect(gate('left', 35.5, 2).ok).toBe(true);
    expect(gate('left', 54.5, -2).ok).toBe(true);
    expect(gate('left', 20, 0)).toEqual({ ok: false, hint: 'turnLeft' });
    expect(gate('left', 60, 0)).toEqual({ ok: false, hint: 'turnRight' });
    expect(gate('left', -45, 0)).toEqual({ ok: false, hint: 'turnLeft' });
    expect(gate('left', 45, 20)).toEqual({ ok: false, hint: 'chinDown' });
  });

  it('right 45: yaw -55..-35 toward the customer\'s right', () => {
    expect(gate('right', -45, 0).ok).toBe(true);
    expect(gate('right', -20, 0)).toEqual({ ok: false, hint: 'turnRight' });
    expect(gate('right', -60, 0)).toEqual({ ok: false, hint: 'turnLeft' });
    expect(gate('right', 45, 0)).toEqual({ ok: false, hint: 'turnRight' });
  });

  it('chin-up: pitch up 20..30 with the face straight', () => {
    expect(gate('chinUp', 0, 25).ok).toBe(true);
    expect(gate('chinUp', 0, 10)).toEqual({ ok: false, hint: 'chinUp' });
    expect(gate('chinUp', 0, 35)).toEqual({ ok: false, hint: 'chinDown' });
    expect(gate('chinUp', 20, 25)).toEqual({ ok: false, hint: 'lookStraight' });
  });

  it('gates landmark-only poses the same way', () => {
    const p = poseFromLandmarks(landmarks(45, 0), 1280, 720);
    expect(checkPose('left', p).ok).toBe(true);
    expect(checkPose('right', p).ok).toBe(false);
  });

  it('asks for a face when there is no pose', () => {
    expect(checkPose('front', null)).toEqual({ ok: false, hint: 'noFace' });
  });

  it('orders the shots and keeps quick mode to the front shot', () => {
    expect(SHOT_ORDER).toEqual(['front', 'left', 'right', 'chinUp']);
    expect(shotsForMode('quick')).toEqual(['front']);
    expect(shotsForMode('full')).toEqual(['front', 'left', 'right', 'chinUp']);
    expect(Object.keys(GATES)).toEqual(['front', 'left', 'right', 'chinUp']);
  });
});
