// Grey % (PRD 5.6): hair pixels with chroma C* < 8 and L* more than 15 above the natural root level,
// measured in the first 4 cm from the root.
export function greyPercent(lab, alpha, distPx, n, { naturalL, mmPerPx }) {
  const limitPx = mmPerPx ? 40 / mmPerPx : Infinity;
  let total = 0;
  let grey = 0;
  for (let i = 0; i < n; i += 1) {
    if (alpha[i] < 0.6 || distPx[i] < 0 || distPx[i] > limitPx) continue;
    total += 1;
    const C = Math.hypot(lab.A[i], lab.B[i]);
    if (C < 8 && lab.L[i] > naturalL + 15) grey += 1;
  }
  if (total < 50) return { pct: 0, confidence: 0.3 };
  return { pct: Math.round((grey / total) * 100), confidence: Math.min(0.85, 0.5 + total / 40000) };
}
