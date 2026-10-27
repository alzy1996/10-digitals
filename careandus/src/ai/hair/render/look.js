// One place that turns a look (shade, technique, finish, light, weeks, mode) into draw uniforms.
import { hexToLab } from '../analysis/color.js';
import { planLift, session1Lab } from '../color/lift.js';
import { hennaStageLab } from '../color/henna.js';
import { rootBandCm, lineSoftness } from '../color/regrowth.js';
import { techniqueUniforms, levelLabOf } from './techniques.js';
import { lightUniforms } from './lightSwitch.js';
import { finishUniforms } from './finishes.js';
import { techniqueZone } from '../recommend/colorScore.js';

/** Lab of a shade: the salon's scanned swatch when linked, else the starting swatch. */
export function shadeLab(shade, swatchesById = {}) {
  if (!shade) return null;
  const scanned = shade.swatchRef && swatchesById[shade.swatchRef]?.labMeasured;
  if (Array.isArray(scanned) && scanned.length === 3) return scanned;
  return hexToLab(shade.swatch);
}

export function naturalLab(renderData, profile, scanned) {
  const z = renderData?.zones;
  if (z && Number.isFinite(z.rootL)) return [z.rootL, z.midLab?.[1] ?? 4, z.midLab?.[2] ?? 8];
  return levelLabOf(profile.hair.rootLevel, scanned);
}

/**
 * @param {object} o
 * @param {object} o.look { shadeId, shade2Id, technique, techniqueParams, finish, lightPreset, regrowthWeeks, hijab, mode: 'final'|'session1'|'henna', showMask }
 * @param {object} o.catalog { shades, techniques }
 * @param {object} o.profile HairProfile
 * @param {object} o.renderData
 * @param {object} o.aux from buildAux
 * @param {object} [o.swatchesById]
 * @param {Record<number, number[]>} [o.scannedLevels]
 * @param {object} [o.ctx] { metallicTest, patchRequired, growthCmPerMonth }
 */
export function lookDrawParams({ look, catalog, profile, renderData, aux, swatchesById, scannedLevels, ctx = {} }) {
  const base = {
    hairMeanL: aux?.hairMeanL ?? 30,
    maxCm: aux?.maxCm ?? 40,
    partX: aux?.partX ?? 0.5,
    light: lightUniforms(look.lightPreset || 'daylight'),
    finish: finishUniforms(look.finish || 'satin'),
    hijab: Boolean(look.hijab),
    showMask: look.showMask ? 1 : 0,
    amount: look.amount ?? 1,
  };
  const natural = naturalLab(renderData, profile, scannedLevels);
  if (look.mode === 'henna') {
    const t = hennaStageLab(natural, profile.hair.greyPct);
    return { ...base, tech: 1, target: t, target2: t, target3: t, foilEnds: t, plan: null };
  }
  const shade = catalog.shades.find((s) => s.id === look.shadeId);
  if (!shade) return { ...base, tech: 0, plan: null };
  const technique = catalog.techniques.find((t) => t.id === look.technique) || catalog.techniques.find((t) => t.id === 'global');
  const shade2 = catalog.shades.find((s) => s.id === look.shade2Id);
  let lab = shadeLab(shade, swatchesById);
  const targetLevel = technique.mask === 'gloss' ? Math.min(shade.level, profile.hair.rootLevel + 1) : shade.level;
  const plan = planLift({
    hair: profile.hair,
    history: profile.history,
    targetLevel,
    zone: techniqueZone(technique.mask),
    metallicTest: ctx.metallicTest,
    patchRequired: ctx.patchRequired,
  });
  if (look.mode === 'session1') {
    lab = session1Lab(plan, lab) || natural;
  }
  const tu = techniqueUniforms({
    technique,
    params: look.techniqueParams,
    shadeLab: lab,
    shadeLevel: look.mode === 'session1' ? plan.session1Level : shade.level,
    shade2Lab: shade2 ? shadeLab(shade2, swatchesById) : null,
    naturalLab: natural,
    naturalLevel: profile.hair.rootLevel,
    scanned: scannedLevels,
  });
  const weeks = look.regrowthWeeks || 0;
  const growth = ctx.growthCmPerMonth || 1.25;
  return {
    ...base,
    ...tu,
    finish: finishUniforms(look.finish || 'satin', technique.mask),
    regrowthCm: weeks ? rootBandCm(weeks, growth) : 0,
    regrowthSoft: 0.12 + lineSoftness(technique.mask) * 1.8,
    plan,
    shadeLab: lab,
  };
}
