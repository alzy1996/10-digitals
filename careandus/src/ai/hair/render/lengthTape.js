// Length Tape geometry (PRD 3.2, 7.7): the tape line on her photo <-> new length in cm, with curl shrinkage.
import shrinkage from '../../../data/shrinkage.json';
import { roundLengthCm } from '../analysis/scale.js';

export function shrinkageFor(texture, clientPct) {
  if (typeof clientPct === 'number') return clientPct;
  return shrinkage[texture]?.pct ?? 0;
}

/** Dry length after shrinkage: 30 cm curly at 40% -> 18 cm. */
export function dryLength(wetCm, pct) {
  return roundLengthCm(wetCm * (1 - pct / 100));
}

/** Hair hangs roughly vertically in front of the shoulders: tape at y means Δcm = (tipY - y) px. */
export function newLengthFromY({ y, tipY, currentCm, mmPerPx }) {
  const deltaCm = ((tipY - y) * mmPerPx) / 10;
  return { newCm: roundLengthCm(Math.max(0, currentCm - deltaCm)), deltaCm: -roundLengthCm(deltaCm) };
}

export function yFromNewLength({ newCm, tipY, currentCm, mmPerPx }) {
  return tipY - (((currentCm - newCm) * 10) / mmPerPx);
}

export function clampTapeY(y, { minY, maxY }) {
  return Math.max(minY, Math.min(maxY, y));
}
