/**
 * Camera pose maths: a pose is { target: Vector3, distance, tiltDeg, headingDeg, fov }.
 * tiltDeg is the pitch above the horizon (90 = straight down); headingDeg is the compass direction
 * the camera looks toward (0 = north, clockwise). three.js: x = east, y = up, z = -north.
 */
import { MathUtils, Vector3 } from 'three'

/**
 * cubic-bezier(0.2, 0, 0, 1) (PLAN.md §9 easing), solved for y(x).
 * @param {number} x 0..1
 */
export function easeStandard(x) {
  const p1x = 0.2
  const p1y = 0
  const p2x = 0
  const p2y = 1
  const cx = 3 * p1x
  const bx = 3 * (p2x - p1x) - cx
  const ax = 1 - cx - bx
  const cy = 3 * p1y
  const by = 3 * (p2y - p1y) - cy
  const ay = 1 - cy - by
  const sx = (t) => ((ax * t + bx) * t + cx) * t
  const sy = (t) => ((ay * t + by) * t + cy) * t
  const dsx = (t) => (3 * ax * t + 2 * bx) * t + cx
  if (x <= 0) return 0
  if (x >= 1) return 1
  let t = x
  for (let i = 0; i < 8; i++) {
    const e = sx(t) - x
    if (Math.abs(e) < 1e-6) break
    const d = dsx(t)
    if (Math.abs(d) < 1e-6) break
    t -= e / d
  }
  if (t < 0 || t > 1 || Math.abs(sx(t) - x) > 1e-4) {
    let lo = 0
    let hi = 1
    t = x
    for (let i = 0; i < 30; i++) {
      const v = sx(t)
      if (Math.abs(v - x) < 1e-6) break
      if (v < x) lo = t
      else hi = t
      t = (lo + hi) / 2
    }
  }
  return sy(t)
}

/** Unit offset from target to camera for a tilt/heading. */
export function offsetDir(tiltDeg, headingDeg, out = new Vector3()) {
  const t = MathUtils.degToRad(tiltDeg)
  const h = MathUtils.degToRad(headingDeg)
  const c = Math.cos(t)
  return out.set(-Math.sin(h) * c, Math.sin(t), Math.cos(h) * c)
}

/**
 * Read the pose of a camera orbiting `target`.
 * @param {import('three').PerspectiveCamera} camera
 * @param {Vector3} target
 */
export function readPose(camera, target) {
  const off = camera.position.clone().sub(target)
  const distance = off.length()
  const tiltDeg = MathUtils.radToDeg(Math.asin(MathUtils.clamp(off.y / Math.max(distance, 1e-9), -1, 1)))
  const horiz = Math.hypot(off.x, off.z)
  let headingDeg
  if (horiz < 1e-6) {
    // straight down: derive heading from the camera's up vector projected on the ground
    const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
    headingDeg = MathUtils.radToDeg(Math.atan2(up.x, -up.z))
  } else {
    headingDeg = MathUtils.radToDeg(Math.atan2(-off.x, off.z))
  }
  return { target: target.clone(), distance, tiltDeg, headingDeg, fov: camera.fov }
}

/**
 * Put the camera at a pose (does not touch controls; caller syncs controls.target).
 */
export function applyPose(camera, pose) {
  const dir = offsetDir(Math.min(pose.tiltDeg, 89.6), pose.headingDeg)
  // tilt is capped below 90 so the heading stays defined (OrbitControls keeps camera.up = +Y)
  camera.position.copy(pose.target).addScaledVector(dir, pose.distance)
  camera.lookAt(pose.target)
  if (Math.abs(camera.fov - pose.fov) > 1e-6) {
    camera.fov = pose.fov
    camera.updateProjectionMatrix()
  }
  camera.updateMatrixWorld()
}

function lerpAngle(a, b, t) {
  let d = ((b - a + 540) % 360) - 180
  return a + d * t
}

/** Interpolate two poses (distance in log space, heading the short way round). */
export function lerpPose(a, b, t) {
  return {
    target: a.target.clone().lerp(b.target, t),
    distance: Math.exp(Math.log(a.distance) + (Math.log(b.distance) - Math.log(a.distance)) * t),
    tiltDeg: a.tiltDeg + (b.tiltDeg - a.tiltDeg) * t,
    headingDeg: lerpAngle(a.headingDeg, b.headingDeg, t),
    fov: a.fov + (b.fov - a.fov) * t,
  }
}

/**
 * Smallest distance that fits all `points` (world) around `target` for a tilt/heading.
 * @param {Vector3[]} points
 * @param {Vector3} target
 * @param {number} tiltDeg
 * @param {number} headingDeg
 * @param {number} fovDeg   vertical fov
 * @param {number} aspect   width / height of the usable area
 * @param {number} [margin] fraction of the half-extent kept free (0.1 = 10 %)
 */
export function fitDistance(points, target, tiltDeg, headingDeg, fovDeg, aspect, margin = 0.08) {
  const o = offsetDir(Math.min(tiltDeg, 89.9), headingDeg)
  const fwd = o.clone().negate()
  const h = MathUtils.degToRad(headingDeg)
  let right = new Vector3().crossVectors(fwd, new Vector3(0, 1, 0))
  if (right.lengthSq() < 1e-8) right.set(Math.cos(h), 0, Math.sin(h))
  right.normalize()
  const up = new Vector3().crossVectors(right, fwd).normalize()
  const tanV = Math.tan(MathUtils.degToRad(fovDeg) / 2) * (1 - margin)
  const tanH = tanV * aspect
  let D = 0
  const rel = new Vector3()
  for (const p of points) {
    rel.copy(p).sub(target)
    const x = rel.dot(right)
    const y = rel.dot(up)
    const z = rel.dot(fwd)
    D = Math.max(D, Math.abs(x) / tanH - z, Math.abs(y) / tanV - z)
  }
  return D
}

/**
 * Centre of the bounding box of world points.
 * @param {Vector3[]} points
 */
export function boxCenter(points) {
  const min = new Vector3(Infinity, Infinity, Infinity)
  const max = new Vector3(-Infinity, -Infinity, -Infinity)
  for (const p of points) {
    min.min(p)
    max.max(p)
  }
  return min.add(max).multiplyScalar(0.5)
}
