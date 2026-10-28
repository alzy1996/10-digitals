// Metric scale from the iris (PRD 5.3): adult horizontal iris diameter ≈ 11.7 ± 0.5 mm.
export const IRIS_MM = 11.7;
// Iris landmarks (Face Landmarker with iris refinement): centers 468 and 473, contours 469–472 and 474–477.
export const IRIS_A = [469, 470, 471, 472];
export const IRIS_B = [474, 475, 476, 477];

/** Horizontal iris width in px for one eye: the pair of contour points with the largest x-distance. */
export function irisWidthPx(pts, ids) {
  let best = 0;
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = pts[ids[i]];
      const b = pts[ids[j]];
      const dx = Math.abs(a[0] - b[0]);
      if (dx > best) best = Math.hypot(a[0] - b[0], a[1] - b[1]);
    }
  }
  return best;
}

export function mmPerPxFromIris(widthPx) {
  return widthPx > 0 ? IRIS_MM / widthPx : null;
}

/**
 * @param {number[][]} pts landmark pixel coords
 * @param {number} yawDeg
 */
export function computeScale(pts, yawDeg = 0) {
  if (!pts || pts.length < 478) return { mmPerPx: null, source: 'none', confidence: 0, irisPx: 0 };
  const wa = irisWidthPx(pts, IRIS_A);
  const wb = irisWidthPx(pts, IRIS_B);
  let irisPx;
  if (Math.abs(yawDeg) < 10) irisPx = (wa + wb) / 2;
  else irisPx = Math.max(wa, wb); // the eye nearer the camera is seen more frontally
  const asym = Math.abs(wa - wb) / Math.max(wa, wb, 1);
  const sizeConf = Math.min(1, Math.max(0, (irisPx - 12) / 20));
  const confidence = Math.round(Math.max(0, sizeConf * (1 - asym * 2) * (Math.abs(yawDeg) < 10 ? 1 : 0.8)) * 100) / 100;
  return { mmPerPx: mmPerPxFromIris(irisPx), source: 'iris', confidence, irisPx };
}

export function pxToCm(px, mmPerPx) {
  return (px * mmPerPx) / 10;
}

export function cmToPx(cm, mmPerPx) {
  return (cm * 10) / mmPerPx;
}

/** Lengths are shown to the nearest 0.5 cm. */
export function roundLengthCm(cm) {
  return Math.round(cm * 2) / 2;
}
