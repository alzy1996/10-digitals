// Henna, grey and dye simulator (PRD 7.4). Turns a colour choice into the strand
// palette the beard texture draws from:
//
//   grey      every strand is grey with probability = the customer's grey ratio.
//             Grey blending (demi-permanent) keeps greyTarget % of those grey strands
//             ("50 % grey kept"); the rest take the customer's natural shade.
//   henna     strongest orange-red on grey strands, a warm shift on dark strands.
//   katam     henna + katam: a second darkening layer, brown-black.
//   day       henna deepens over the first days: day 1 uses the catalog hex, day 3
//             (and later) hexDay3, in between it is interpolated in Lab.
//   dyes      every strand takes the swatch Lab; the per-strand luminance variation
//             (+-5..8 % L*) is kept so a dyed beard never looks painted.
//
// Colours are CIELAB (D65). The renderer converts them to linear RGB and divides by
// the white-card gains so that, measured in calibrated space, the beard mid-tone is
// the swatch (PRD 7.6).

import COLORS from '../../data/colors.json';
import { hexToLab, labToLinearRgb, linearRgbToLab } from '../analysis/color.js';
import { clamp, isNum, lerp } from './util.js';

/** Relative L* variation per strand (PRD 7.1: +-5 to 8 %). */
export const STRAND_L_VARIATION = 0.065;
/** Smallest absolute L* swing so very dark shades still show strand texture. */
export const STRAND_L_MIN_SWING = 1.4;

/** Lab of a natural grey / white beard hair (slightly warm, never pure white). */
export const GREY_HAIR_LAB = Object.freeze([74, -0.3, 4.5]);
/** Natural beard shade used when the profile has no measured colour. */
export const DEFAULT_NATURAL_LAB = Object.freeze([21, 2.5, 5]);

const BY_ID = new Map((Array.isArray(COLORS) ? COLORS : []).map((c) => [c.id, c]));

/** Catalog colour by id (null when unknown). */
export function catalogColor(id) {
  return BY_ID.get(id) || null;
}

const labOk = (lab) => Array.isArray(lab) && lab.length === 3 && lab.every(isNum);
const mixLab = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** The customer's natural beard Lab: measured colour, else the shade id's hex, else a default. */
export function naturalLab(profile) {
  const beard = profile && profile.beard;
  if (beard && labOk(beard.colorLab)) return beard.colorLab.slice();
  const shade = beard && beard.colorId ? catalogColor(beard.colorId) : null;
  if (shade && shade.hex) return hexToLab(shade.hex);
  return DEFAULT_NATURAL_LAB.slice();
}

/** Grey ratio 0..1 measured on the customer (0 when unknown). */
export function profileGreyShare(profile) {
  const g = profile && profile.beard ? profile.beard.greyRatio : null;
  return isNum(g) ? clamp(g / 100, 0, 1) : 0;
}

/** Henna depth 0 (day 1) .. 1 (day 3 and later). */
export function hennaDepth(day) {
  const d = isNum(day) ? day : 1;
  return clamp((d - 1) / 2, 0, 1);
}

function swatchLab(color, day) {
  if (!color || !color.hex) return null;
  const day1 = hexToLab(color.hex);
  if (!color.hexDay3) return day1;
  return mixLab(day1, hexToLab(color.hexDay3), hennaDepth(day));
}

/** Warm shift henna gives dark hair: a red-orange glint, a touch lighter in the light. */
function warmShift(lab, strength) {
  return [lab[0] + 1.5 * strength, lab[1] + 9 * strength, lab[2] + 7 * strength];
}

/**
 * Strand palette for a colour choice.
 *
 * @param {string} colorId colors.json id ('natural' when empty or unknown)
 * @param {object} [opts]
 * @param {object} [opts.profile] FaceProfile (natural colour and grey ratio)
 * @param {number|null} [opts.greyTarget] grey blending: % of the grey kept (25/50/75)
 * @param {number} [opts.day=1] henna day (1..3+)
 * @param {number} [opts.greyShare] overrides the profile grey ratio (0..1)
 * @returns {{ id, type, palette: Array<{ lab: number[], weight: number, grey: boolean }>,
 *   swatchLab: number[]|null, naturalLab: number[], greyShare: number,
 *   greyAfter: number, variation: number }}
 *   palette weights sum to 1; swatchLab is the colour the dyed strands should match
 *   (null for natural / salt and pepper).
 */
export function colorForTreatment(colorId, { profile = null, greyTarget = null, day = 1, greyShare } = {}) {
  const color = catalogColor(colorId) || catalogColor('natural') || { id: 'natural', type: 'none', hex: null };
  const nat = naturalLab(profile);
  const g0 = isNum(greyShare) ? clamp(greyShare, 0, 1) : profileGreyShare(profile);
  const swatch = swatchLab(color, day);
  const depth = hennaDepth(day);
  const entries = [];
  const add = (lab, weight, grey) => {
    if (weight > 1e-6) entries.push({ lab, weight, grey });
  };

  const id = color.id;
  if (id === 'henna') {
    add(swatch, g0, false);
    add(warmShift(nat, 0.75 + 0.25 * depth), 1 - g0, false);
  } else if (id === 'henna-katam') {
    add(swatch, g0, false);
    // Katam over henna darkens the dark strands too, keeping a faint warmth.
    const dark = warmShift([nat[0] * (0.92 - 0.04 * depth), nat[1], nat[2]], 0.25);
    add(dark, 1 - g0, false);
  } else if (Array.isArray(color.greyBlend) && color.greyBlend.length) {
    const keepPct = isNum(greyTarget) ? greyTarget : isNum(color.greyDefault) ? color.greyDefault : color.greyBlend[0];
    const keep = clamp(keepPct / 100, 0, 1);
    add(GREY_HAIR_LAB.slice(), g0 * keep, true);
    // Blended strands take a demi-permanent shade a little lighter than the natural one.
    add([nat[0] + 3, nat[1], nat[2]], g0 * (1 - keep), false);
    add(nat, 1 - g0, false);
  } else if (color.type === 'toner' && swatch) {
    // Toner acts on grey and white hair only: grey strands turn clean silver.
    add(swatch, g0, true);
    add(nat, 1 - g0, false);
  } else if (swatch && color.type === 'temporary') {
    // Wash-out colour covers dark hair fully and grey hair slightly less.
    add(swatch, 1 - g0, false);
    add(mixLab(swatch, GREY_HAIR_LAB, 0.15), g0, false);
  } else if (swatch) {
    add(swatch, 1, false);
  } else {
    // natural and salt-and-pepper (keep): the measured grey ratio as it is.
    add(GREY_HAIR_LAB.slice(), g0, true);
    add(nat, 1 - g0, false);
  }

  const total = entries.reduce((s, e) => s + e.weight, 0) || 1;
  const palette = entries.map((e) => ({ lab: e.lab, weight: e.weight / total, grey: e.grey }));
  const greyAfter = palette.filter((e) => e.grey).reduce((s, e) => s + e.weight, 0);
  return {
    id,
    type: color.type || 'none',
    palette,
    swatchLab: swatch,
    naturalLab: nat,
    greyShare: g0,
    greyAfter,
    variation: STRAND_L_VARIATION,
  };
}

/**
 * Picks a strand colour from a palette: returns linear RGB (divided by the
 * white-card gains) with the per-strand L* variation applied.
 * u1 picks the palette entry, u2 sets the luminance offset in [-1, 1].
 */
export function strandColor(treatment, u1, u2, gains = null, extraL = 0) {
  const pal = treatment.palette;
  let entry = pal[pal.length - 1];
  let acc = 0;
  for (const e of pal) {
    acc += e.weight;
    if (u1 < acc) {
      entry = e;
      break;
    }
  }
  const lab = entry.lab;
  const swing = Math.max(STRAND_L_MIN_SWING, lab[0] * treatment.variation);
  const greyJitter = entry.grey ? 6 * u2 : 0;
  const L = clamp(lab[0] + swing * u2 + greyJitter + extraL, 1, 98);
  const lin = labToLinearRgb([L, lab[1], lab[2]]);
  if (gains && gains.length === 3) {
    for (let i = 0; i < 3; i++) lin[i] = clamp(lin[i] / (gains[i] > 0.2 ? gains[i] : 1), 0, 1);
  }
  return { lin, grey: entry.grey };
}

/** Mean Lab of a palette (weighted), for bleed colours and quick previews. */
export function paletteMeanLab(treatment) {
  let L = 0;
  let a = 0;
  let b = 0;
  for (const e of treatment.palette) {
    L += e.lab[0] * e.weight;
    a += e.lab[1] * e.weight;
    b += e.lab[2] * e.weight;
  }
  return [L, a, b];
}

/** Linear RGB -> Lab passthrough so callers of this module need one import. */
export function linToLab(lin) {
  return linearRgbToLab(lin);
}
