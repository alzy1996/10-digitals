// What the hand shutter warns about (S04). The auto-shutter only fires inside each
// shot's pose window; a hand shot skips that gate, so a "left 45°" photo taken
// facing the camera would feed the side silhouette and the Studio's side views.
// The shot is kept but the barber sees the issues first, like an uploaded photo.

/** Pose corrections among the capture hint keys (ai.hint.*). */
export const POSE_HINTS = Object.freeze(['turnLeft', 'turnRight', 'lookStraight', 'chinUp', 'chinDown']);

/** A front photo turned further than this (degrees) is checked too; smaller turns pass. */
export const FRONT_WARN_DEG = 15;

/**
 * Issues to show before a hand shot is used, pose first, or [] to use it straight
 * away. shotId: 'front'|'left'|'right'|'chinUp'; pose: { yaw, pitch } in degrees;
 * issues: the hint keys from shotFromImage. Side and chin-up shots are checked when
 * their pose is outside the window; the front shot only when it is turned more than
 * FRONT_WARN_DEG (the hand shutter is often used because the ±5° front window is
 * hard to hold, and a small turn does not change the reading). Light or blur alone
 * never stops a hand shot.
 */
export function manualShotWarnings(shotId, pose, issues) {
  const list = Array.isArray(issues) ? issues.filter((k) => typeof k === 'string' && k && k !== 'noFace') : [];
  const posed = list.filter((k) => POSE_HINTS.includes(k));
  if (!posed.length) return [];
  if (shotId === 'front') {
    const yaw = pose && Number.isFinite(pose.yaw) ? Math.abs(pose.yaw) : 0;
    const pitch = pose && Number.isFinite(pose.pitch) ? Math.abs(pose.pitch) : 0;
    if (yaw <= FRONT_WARN_DEG && pitch <= FRONT_WARN_DEG) return [];
  }
  const rest = list.filter((k) => !POSE_HINTS.includes(k));
  return [...new Set([...posed, ...rest])];
}
