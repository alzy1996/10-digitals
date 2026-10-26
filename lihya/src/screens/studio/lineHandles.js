// Geometry for the Studio's on-photo overlays (PRD 7.2, 9.5): the cheek-line and
// neckline drag handles and the barber's ruler laid along the jaw. The guides come from
// renderStudio.lineGuides (the shot's own pixels); the Studio shows the shot as a face
// crop in a box of CSS pixels, so every point goes through toStage / fromStage. The
// photo is never mirrored, in Arabic too, so these are plain image coordinates.

import { clampParams } from '../../lib/look.js';
import { cheekLineHeight, necklinePosition } from '../../lib/cutcard.js';
import { formatMm } from '../../lib/format.js';

/** Line offsets a handle or a slider moves (positive = the line moves up). */
export const LINE_OFFSET_KEYS = Object.freeze({ cheek: 'cheekOffset', neck: 'necklineOffset' });

/** Shot pixel -> stage pixel, for `crop` (shot pixels) shown in `box` ({ width, height } CSS pixels). */
export function toStage(p, crop, box) {
  return [((p[0] - crop.x) * box.width) / crop.w, ((p[1] - crop.y) * box.height) / crop.h];
}

/** Stage pixel -> shot pixel (inverse of toStage). */
export function fromStage(q, crop, box) {
  return [crop.x + (q[0] * crop.w) / box.width, crop.y + (q[1] * crop.h) / box.height];
}

/**
 * The offset of the track sample nearest to point p (shot pixels). `pick(sample)`
 * returns the sample's point (the side of a cheek handle, or the neckline point).
 */
export function nearestOffset(track, p, pick) {
  let best = null;
  let bestD = Infinity;
  for (const s of track || []) {
    const q = pick(s);
    if (!q) continue;
    const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = s.offset;
    }
  }
  return best;
}

/** The look with one line offset set (a moved line is no longer a Gulf preset), clamped. */
export function withLineOffset(params, key, value) {
  const lines = (params && params.lines) || {};
  return clampParams({ ...params, lines: { ...lines, [key]: value }, presetId: null });
}

/**
 * What a line offset means for the barber: "50 mm above the jaw" for the cheek line,
 * "26 mm above the Adam's apple" for the neckline (the same numbers as the Cut Card).
 */
export function lineOffsetText({ t, lang, key, lines, value, front, mmPerPx }) {
  const l = lines || {};
  if (key === LINE_OFFSET_KEYS.cheek) {
    const h = cheekLineHeight({ type: l.cheek, offset: value, front, mmPerPx });
    return t('studio.lines.aboveJaw', { mm: formatMm(h.mm, lang) });
  }
  const n = necklinePosition(l.neckline, value);
  return n.mmAboveAdamsApple === null ? '' : t('studio.lines.aboveApple', { mm: formatMm(n.mmAboveAdamsApple, lang) });
}

/** Jaw zones a length control changes, for the ruler's highlight ([] = none on the jaw). */
export function rulerZones(zoneKey) {
  switch (zoneKey) {
    case 'all':
      return ['B_R', 'J_R', 'C', 'J_L', 'B_L'];
    case 'J':
      return ['J_R', 'J_L'];
    case 'B':
    case 'fade':
      return ['B_R', 'B_L'];
    case 'C':
    case 'J_L':
    case 'J_R':
    case 'B_L':
    case 'B_R':
      return [zoneKey];
    default:
      return [];
  }
}

const smooth = (arr) => arr.map((v, i) => (arr[Math.max(0, i - 1)] + 2 * v + arr[Math.min(arr.length - 1, i + 1)]) / 4);

/**
 * The barber's ruler along the jaw, just outside the beard (PRD 9.5: laid along the
 * jaw, never over the beard being edited): each jaw point pushed out past the beard
 * hanging there and past the neckline, in shot pixels.
 * Returns { pts, zones } (jaw points 1..n-2, ear points left out) or null.
 */
export function rulerPath(guides, zones, { marginMm = 4 } = {}) {
  if (!guides || !(guides.mmPerPx > 0)) return null;
  const { jaw, neck, mmPerPx } = guides;
  const z = zones || {};
  const neckOn = Number(z.N) > 0.2 && neck && Array.isArray(neck.depths);
  let out = jaw.pts.map((_, k) => {
    const len = Number(z[jaw.zones[k]]) || 0;
    const hang = len > 0.2 ? 0.95 * len : 0;
    const neckMm = neckOn ? neck.depths[k] || 0 : 0;
    return Math.max(hang, neckMm) + marginMm;
  });
  out = smooth(smooth(out));
  const pts = [];
  const zs = [];
  for (let k = 1; k < jaw.pts.length - 1; k++) {
    const d = out[k] / mmPerPx;
    pts.push([jaw.pts[k][0] + jaw.dirs[k][0] * d, jaw.pts[k][1] + jaw.dirs[k][1] * d]);
    zs.push(jaw.zones[k]);
  }
  return { pts, zones: zs };
}

/**
 * Ticks every `step` pixels along a polyline: [{ p, n, major }] with n the unit normal
 * on the side of `away` (a point the ticks point away from), major every `majorEvery`.
 */
export function ticksAlong(poly, step, { majorEvery = 2, away = null } = {}) {
  const out = [];
  if (!poly || poly.length < 2 || !(step > 1)) return out;
  let carry = 0;
  let count = 0;
  for (let k = 1; k < poly.length; k++) {
    const a = poly[k - 1];
    const b = poly[k];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    let n = [-dy / len, dx / len];
    if (away) {
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if ((mid[0] - away[0]) * n[0] + (mid[1] - away[1]) * n[1] < 0) n = [-n[0], -n[1]];
    }
    let s = carry;
    while (s <= len) {
      out.push({ p: [a[0] + (dx * s) / len, a[1] + (dy * s) / len], n, major: count % majorEvery === 0 });
      count += 1;
      s += step;
    }
    carry = s - len;
  }
  return out;
}
