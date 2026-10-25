// Guided capture pose gate (PRD 5.2): auto-shutter when the pose holds 400 ms,
// the image is sharp and the exposure is OK.
// Convention: yaw > 0 when she turns toward HER left (verified manually, see BUILD_NOTES.md).
export const SHOTS = ['front', 'left', 'right', 'back'];
export const HOLD_MS = 400;

export const TARGETS = {
  front: { yaw: [-8, 8], pitch: [-12, 12], roll: [-7, 7] },
  left: { yaw: [30, 60], pitch: [-15, 15], roll: [-12, 12] },
  right: { yaw: [-60, -30], pitch: [-15, 15], roll: [-12, 12] },
};

const inRange = (v, [lo, hi]) => v >= lo && v <= hi;

/** Returns a hint key (or null when the pose is right). */
export function poseHint(shot, pose) {
  const t = TARGETS[shot];
  if (!t) return null;
  if (!inRange(pose.yaw, t.yaw)) {
    if (shot === 'front') return pose.yaw > 0 ? 'capture.turnRight' : 'capture.turnLeft';
    const mid = (t.yaw[0] + t.yaw[1]) / 2;
    if (Math.abs(pose.yaw) < Math.abs(mid)) return shot === 'left' ? 'capture.turnMoreLeft' : 'capture.turnMoreRight';
    return 'capture.turnLess';
  }
  if (!inRange(pose.pitch, t.pitch)) return pose.pitch > 0 ? 'capture.chinDown' : 'capture.chinUp';
  if (!inRange(pose.roll, t.roll)) return 'capture.headStraight';
  return null;
}

/** Small state machine: feed it frames; it says when to fire. */
export function createHoldTimer(holdMs = HOLD_MS) {
  let since = null;
  return {
    update(ok, now) {
      if (!ok) {
        since = null;
        return { fire: false, progress: 0 };
      }
      if (since === null) since = now;
      const p = Math.min(1, (now - since) / holdMs);
      return { fire: p >= 1, progress: p };
    },
    reset() {
      since = null;
    },
  };
}
