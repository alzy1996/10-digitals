// Hair level by zone, flags, regrowth (PRD 5.6).
import levels from '../../data/levels.json';
import { hexToLab, hueDeg, chroma } from './color.js';
import { quantile } from './imageOps.js';

export const LEVEL_L = levels.map((l) => ({ level: l.level, L: hexToLab(l.swatch)[0] }));

/** Nearest level by L* (lightness defines level). `scanned` may replace the starting swatches. */
export function levelFromL(L, scanned) {
  const table = scanned
    ? Object.entries(scanned).map(([lv, lab]) => ({ level: Number(lv), L: lab[0] }))
    : LEVEL_L;
  let best = table[0];
  for (const row of table) if (Math.abs(row.L - L) < Math.abs(best.L - L)) best = row;
  return best.level;
}

/** Continuous level (for display/interpolation). */
export function levelContinuous(L) {
  const t = LEVEL_L;
  if (L <= t[0].L) return 1;
  if (L >= t[t.length - 1].L) return 12;
  for (let i = 0; i < t.length - 1; i += 1) {
    if (L >= t[i].L && L <= t[i + 1].L) return t[i].level + (L - t[i].L) / (t[i + 1].L - t[i].L);
  }
  return 6;
}

export function levelFlags(rootLevel, endsLevel) {
  const flags = [];
  if (endsLevel >= rootLevel + 2) flags.push('previously-lightened');
  if (endsLevel <= rootLevel - 2) flags.push('previous-darker');
  return flags;
}

/** Median of the central 80% (skip the top and bottom 10%). */
export function trimmedMedian(values) {
  if (!values.length) return NaN;
  const s = Float32Array.from(values).sort();
  const lo = Math.floor(s.length * 0.1);
  const hi = Math.max(lo + 1, Math.ceil(s.length * 0.9));
  const mid = s.subarray(lo, hi);
  return mid[mid.length >> 1];
}

/**
 * Zone statistics over the hair.
 * @returns {{rootL, midL, endsL, rootLevel, midLevel, endsLevel, flags, warmth, midLab, profileL:number[]}}
 */
export function hairZones(lab, alpha, r, n, scanned) {
  const root = [];
  const mid = [];
  const ends = [];
  const midA = [];
  const midB = [];
  const bins = Array.from({ length: 20 }, () => []);
  for (let i = 0; i < n; i += 1) {
    if (alpha[i] < 0.6) continue;
    const rv = r[i];
    const L = lab.L[i];
    if (rv <= 0.15) root.push(L);
    else if (rv < 0.7) {
      mid.push(L);
      midA.push(lab.A[i]);
      midB.push(lab.B[i]);
    } else ends.push(L);
    bins[Math.min(19, Math.floor(rv * 20))].push(L);
  }
  const rootL = trimmedMedian(root);
  const midL = trimmedMedian(mid.length ? mid : root);
  const endsL = trimmedMedian(ends.length ? ends : mid.length ? mid : root);
  const rootLevel = levelFromL(rootL, scanned);
  const midLevel = levelFromL(midL, scanned);
  const endsLevel = levelFromL(endsL, scanned);
  const midLab = [midL, trimmedMedian(midA), trimmedMedian(midB)];
  const h = hueDeg(midLab);
  const C = chroma(midLab);
  const warmth = C < 6 ? 'neutral' : h > 62 ? 'warm' : h < 50 ? 'cool' : 'neutral';
  return {
    rootL,
    midL,
    endsL,
    rootLevel,
    midLevel,
    endsLevel,
    flags: levelFlags(rootLevel, endsLevel),
    warmth,
    midLab,
    rootLowL: quantile(root, 0.25),
    profileL: bins.map((b) => (b.length ? trimmedMedian(b) : NaN)),
    counts: { root: root.length, mid: mid.length, ends: ends.length },
  };
}

/**
 * Regrowth: a sharp band in the first 40% of the length where L* jumps by > 8 between bins.
 * Returns cm (0 when no band).
 */
export function regrowthCm(profileL, maxDistPx, mmPerPx) {
  if (!mmPerPx) return 0;
  for (let i = 1; i < 8; i += 1) {
    const a = profileL[i - 1];
    const b = profileL[i];
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(b - a) > 8) {
      const rAt = i / 20;
      return Math.round(((rAt * maxDistPx * mmPerPx) / 10) * 2) / 2;
    }
  }
  return 0;
}
