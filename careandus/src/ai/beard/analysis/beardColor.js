// Beard colour (PRD 5.6, last point): median Lab of the non-grey hair pixels in
// the beard zones, matched by CIEDE2000 to the nearest natural shade of the colour
// catalog (src/data/colors.json, PRD 4.4). With too few beard hairs (clean-shaven
// or very light stubble) the scalp hair above the forehead is used instead; with
// neither, the colour falls back to 'natural-black'.

import { hexToLab, deltaE2000, median } from './color.js';

export const FALLBACK_COLOR_ID = 'natural-black';
/** Lab of a typical natural black beard, used only when the catalog has no swatch for the fallback. */
const FALLBACK_LAB = Object.freeze([18, 1.5, 2.5]);
export const MIN_HAIR_SAMPLES = 60;

/** Catalog entries a natural beard colour can match: the permanent dye shades (black to blonde). */
export function naturalShades(colors) {
  return (Array.isArray(colors) ? colors : []).filter(
    (c) => c && typeof c.id === 'string' && typeof c.hex === 'string' && /^#?[0-9a-f]{6}$/i.test(c.hex.trim()) && c.type === 'permanent',
  );
}

/** Nearest catalog shade id to a Lab colour, or the fallback id. */
export function nearestShade(lab, colors) {
  const shades = naturalShades(colors);
  let best = null;
  let bestD = Infinity;
  for (const c of shades) {
    const d = deltaE2000(lab, hexToLab(c.hex));
    if (d < bestD) {
      bestD = d;
      best = c.id;
    }
  }
  return best || FALLBACK_COLOR_ID;
}

/** Per-channel median of Lab samples. */
export function medianLab(samples) {
  if (!samples.length) return null;
  return [median(samples.map((s) => s[0])), median(samples.map((s) => s[1])), median(samples.map((s) => s[2]))];
}

const round1 = (v) => Math.round(v * 10) / 10;

/**
 * { colorId, colorLab, source } from beard hair samples, with scalp hair samples as
 * the second choice. source: 'beard' | 'scalp' | 'default'.
 */
export function beardColor(beardSamples, scalpSamples, colors) {
  let source = 'default';
  let lab = null;
  if (beardSamples && beardSamples.length >= MIN_HAIR_SAMPLES) {
    lab = medianLab(beardSamples);
    source = 'beard';
  } else if (scalpSamples && scalpSamples.length >= MIN_HAIR_SAMPLES) {
    lab = medianLab(scalpSamples);
    source = 'scalp';
  }
  if (!lab) {
    const fb = naturalShades(colors).find((c) => c.id === FALLBACK_COLOR_ID);
    return { colorId: FALLBACK_COLOR_ID, colorLab: (fb ? hexToLab(fb.hex) : FALLBACK_LAB).map(round1), source };
  }
  return { colorId: nearestShade(lab, colors), colorLab: lab.map(round1), source };
}
