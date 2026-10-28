// Technique ids -> shader mask ids and per-technique uniforms (PRD 7.2).
import levels from '../../../data/levels.json';
import { hexToLab } from '../analysis/color.js';

export const TECH_IDS = {
  none: 0, global: 1, root: 2, drench: 3, highlights: 4, partial: 5, babylights: 6, lowlights: 7,
  balayage: 8, foilyage: 9, ombre: 10, sombre: 11, reverse: 12, melt: 13, shadow: 14,
  money: 15, peekaboo: 16, split: 17, chunky: 18, chroma: 19, gloss: 20,
};

const LEVEL_LAB = Object.fromEntries(levels.map((l) => [l.level, hexToLab(l.swatch)]));

export function levelLabOf(level, scanned) {
  const lv = Math.max(1, Math.min(12, Math.round(level)));
  return scanned?.[lv] || LEVEL_LAB[lv];
}

/** Shift a shade Lab by n levels (keeps its tone shift, moves lightness to the new level). */
export function shiftLevels(lab, fromLevel, n, scanned) {
  const to = Math.max(1, Math.min(12, Math.round(fromLevel + n)));
  const base = levelLabOf(fromLevel, scanned);
  const dest = levelLabOf(to, scanned);
  return [dest[0] + (lab[0] - base[0]), lab[1] + (dest[1] - base[1]) * 0.5, lab[2] + (dest[2] - base[2]) * 0.5];
}

/**
 * Uniforms for one technique render.
 * @param {object} p { technique, params, shadeLab, shadeLevel, shade2Lab, naturalLab, naturalLevel, scanned }
 */
export function techniqueUniforms({ technique, params, shadeLab, shadeLevel, shade2Lab, naturalLab, naturalLevel, scanned }) {
  const mask = technique?.mask || 'none';
  const pr = { ...(technique?.params || {}), ...(params || {}) };
  let target = shadeLab;
  let target2 = shade2Lab || naturalLab;
  let target3 = null;
  let foilEnds = shiftLevels(shadeLab, shadeLevel, 1, scanned);
  if (mask === 'sombre' || mask === 'ombre') {
    // only 2 levels of lift for ombre/sombre
    const maxLevel = (naturalLevel || shadeLevel) + 2;
    if (shadeLevel > maxLevel) target = shiftLevels(shadeLab, shadeLevel, maxLevel - shadeLevel, scanned);
  }
  if (mask === 'shadow' && !shade2Lab) target2 = naturalLab;
  if (mask === 'melt') {
    target2 = shade2Lab || naturalLab;
    target3 = [(target[0] + target2[0]) / 2, (target[1] + target2[1]) / 2, (target[2] + target2[2]) / 2];
  }
  if (mask === 'split' && !shade2Lab) target2 = shiftLevels(shadeLab, shadeLevel, -2, scanned);
  if (mask === 'chroma' && !shade2Lab) target2 = shiftLevels(shadeLab, shadeLevel, 1, scanned);
  return {
    tech: TECH_IDS[mask] ?? 1,
    start: pr.start ?? 0,
    density: pr.density ?? 1,
    softness: pr.softness ?? 0.3,
    target,
    target2: target2 || target,
    target3: target3 || target,
    foilEnds,
  };
}
