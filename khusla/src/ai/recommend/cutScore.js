// Cut score (PRD 6.1):
// cutScore = 100 × (0.35·Face + 0.25·Texture + 0.15·Life + 0.10·Age + 0.15·TrendLocal) − penalties
import { reason, topReasons } from './reasons.js';

const LAYERED = new Set(['modern-shag', 'wolf-cut', 'curly-shag', 'mid-layers', 'textured-lob', 'long-layers', 'butterfly', 'face-framing-long', 'hush-cut', 'jellyfish', 'stacked-bob', 'curly-bob']);
const BLUNT = new Set(['blunt-bob', 'blunt-long', 'itty-bitty-bob', 'french-bob', 'hime-cut', 'jellyfish']);
const FACE_FRAMING = new Set(['face-framing-long', 'butterfly', 'long-layers', 'hush-cut', 'curtain', 'airy', 'birkin', 'mid-layers', 'textured-lob']);

/** Typical strand length in cm for each length band (used for "Big change" and the tape default). */
export const BAND_CM = { 'very-short': 4, short: 10, jaw: 18, chin: 22, collarbone: 30, shoulder: 36, long: 50, 'very-long': 65 };
const ABOVE_SHOULDER = new Set(['very-short', 'short', 'jaw', 'chin']);

const FACE_REASON = { square: 'face_soften_square', round: 'face_lengthen_round', oblong: 'face_widen_oblong', heart: 'face_balance_heart' };

export function upkeepPrefs(upkeep = 'medium') {
  if (upkeep === 'low') return { visitWeeks: 12, stylingMin: 0 };
  if (upkeep === 'high') return { visitWeeks: 5, stylingMin: 20 };
  return { visitWeeks: 8, stylingMin: 10 };
}

export function cutTargetCm(cut, currentCm) {
  if (cut.length === 'any') return currentCm ?? BAND_CM.shoulder;
  return BAND_CM[cut.length] ?? currentCm ?? BAND_CM.shoulder;
}

export function fringeFit(fringe, scores) {
  if (!fringe || fringe.id === 'none') return null;
  let s = 0;
  for (const [shape, p] of Object.entries(scores)) {
    const fit = fringe.best?.includes(shape) ? 1 : fringe.faces.includes(shape) ? 0.7 : 0.2;
    s += p * fit;
  }
  return s;
}

/**
 * @returns {{id, score, parts, reasons, hidden, bigChange, targetCm}}
 */
export function scoreCut(cut, profile, goals = {}, fringe = null) {
  const scores = profile.faceShape.scores;
  const hair = profile.hair;
  const texture = hair.texture;
  let face = 0;
  for (const [shape, p] of Object.entries(scores)) face += p * (cut.faces.includes(shape) ? 1 : 0.2);
  const ff = fringeFit(fringe, scores);
  if (ff !== null) face = 0.8 * face + 0.2 * ff;

  let tex = cut.textures.includes(texture) ? 1 : 0.3;
  if (hair.density === 'fine' && LAYERED.has(cut.id)) tex -= 0.2;
  if (hair.density === 'thick' && BLUNT.has(cut.id)) tex -= 0.2;
  tex = Math.max(0, tex);

  const { visitWeeks } = upkeepPrefs(goals.upkeep);
  let life = Math.max(0, 1 - Math.abs((cut.trimWeeks || 8) - visitWeeks) / 12);
  const hidden = Boolean(goals.tieBack && ABOVE_SHOULDER.has(cut.length));
  if (goals.upkeep === 'low' && (cut.length === 'very-short' || cut.length === 'short')) life *= 0.8;

  let age = 0.8;
  if (profile.ageBand?.band === '55+' && (FACE_FRAMING.has(cut.id) || FACE_FRAMING.has(fringe?.id))) age += 0.1;

  const localFit = cut.localFit ?? 0.5;
  const trend = 0.5 * (cut.trend2026 ? 1 : 0) + 0.5 * localFit;

  const targetCm = cutTargetCm(cut, hair.lengthCm);
  const bigChange = hair.lengthCm != null && hair.lengthCm - targetCm > 15;
  const tooLong = hair.lengthCm != null && targetCm > hair.lengthCm + 4; // a cut cannot add length
  const penalties = tooLong ? 25 : 0;

  const score = 100 * (0.35 * face + 0.25 * tex + 0.15 * life + 0.1 * age + 0.15 * trend) - penalties;
  const top = profile.faceShape.top;
  const reasons = topReasons([
    FACE_REASON[top] && cut.faces.includes(top) ? reason(FACE_REASON[top], 35 * face) : null,
    cut.textures.includes(texture) ? reason('texture_fit', 25 * tex) : null,
    cut.trend2026 ? reason('trend_2026', 7.5) : null,
    (cut.trimWeeks || 0) >= 10 ? reason('low_upkeep', 15 * life) : null,
  ]);
  return {
    id: cut.id,
    score: Math.round(score * 10) / 10,
    parts: { face, texture: tex, life, age, trend },
    reasons,
    hidden: hidden || tooLong,
    bigChange,
    targetCm,
  };
}

export function bestFringe(cut, fringes, profile) {
  let best = fringes.find((f) => f.id === 'none') || null;
  let bestScore = -Infinity;
  for (const f of fringes) {
    if (f.hidden) continue;
    if (!f.textures.includes(profile.hair.texture)) continue;
    if ((cut.length === 'very-short' || cut.id === 'buzz') && f.id !== 'none') continue;
    const s = scoreCut(cut, profile, {}, f).parts.face + (f.trend2026 ? 0.02 : 0);
    if (s > bestScore + 1e-9 || (Math.abs(s - bestScore) < 1e-9 && best && f.id < best.id)) {
      bestScore = s;
      best = f;
    }
  }
  return best;
}

export function rankCuts(cuts, fringes, profile, goals = {}) {
  return cuts
    .filter((c) => !c.hidden)
    .map((c) => {
      const fringe = bestFringe(c, fringes, profile);
      return { cut: c, fringe, ...scoreCut(c, profile, goals, fringe) };
    })
    .filter((r) => !r.hidden)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
