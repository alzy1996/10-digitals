// Looks (PRD 6.4): top 6 = best cut (+ fringe) × best color (+ technique), 0.5·cut + 0.5·color,
// diversified so no two looks share both cut family and color family. Deterministic.
import { rankCuts } from './cutScore.js';
import { rankColors } from './colorScore.js';
import { topReasons } from './reasons.js';

const CUT_FAMILY = {
  'very-short': 'crop',
  short: 'crop',
  jaw: 'bob',
  chin: 'bob',
  collarbone: 'lob',
  shoulder: 'mid',
  long: 'long',
  'very-long': 'long',
  any: 'curl',
};

export function cutFamily(cut) {
  return CUT_FAMILY[cut.length] || 'mid';
}

/**
 * @param {{cuts, fringes, shades, techniques}} catalog salon-filtered catalog
 * @param {object} profile HairProfile
 * @param {object} goals { change: 'cut'|'color'|'both'|'style', upkeep, tieBack, visibleZone }
 * @param {object} ctx { metallicTest, patchRequired }
 */
export function recommendLooks(catalog, profile, goals = {}, ctx = {}) {
  const change = goals.change || 'both';
  const cuts = rankCuts(catalog.cuts, catalog.fringes, profile, goals);
  const { ranked: colors, notToday } = rankColors(catalog.shades, catalog.techniques, profile, goals, ctx);
  const shadeById = Object.fromEntries(catalog.shades.map((s) => [s.id, s]));

  const cutPool = change === 'color' ? [null] : cuts.slice(0, 8);
  const colorPool = change === 'cut' || change === 'style' ? [null] : colors.slice(0, 10);
  const combos = [];
  for (const c of cutPool) {
    for (const k of colorPool) {
      const cutScore = c ? c.score : null;
      const colorScore = k ? k.score : null;
      const score = cutScore !== null && colorScore !== null ? 0.5 * cutScore + 0.5 * colorScore : (cutScore ?? colorScore ?? 0);
      combos.push({
        id: `${c ? c.id : 'keep'}~${k ? k.id : 'natural'}`,
        cut: c,
        color: k,
        score: Math.round(score * 10) / 10,
        cutFamily: c ? cutFamily(c.cut) : 'keep',
        colorFamily: k ? shadeById[k.shadeId].family : 'natural',
        reasons: topReasons([...(c?.reasons || []), ...(k?.reasons || [])]),
      });
    }
  }
  combos.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const looks = [];
  const usedPairs = new Set();
  const usedCuts = new Set();
  const usedColors = new Set();
  for (const lk of combos) {
    if (looks.length >= 6) break;
    const pair = `${lk.cutFamily}/${lk.colorFamily}`;
    if (usedPairs.has(pair)) continue;
    // prefer variety: skip an exact repeat of cut or color while alternatives remain
    if (looks.length < 4 && ((lk.cut && usedCuts.has(lk.cut.id)) || (lk.color && usedColors.has(lk.color.id)))) continue;
    usedPairs.add(pair);
    if (lk.cut) usedCuts.add(lk.cut.id);
    if (lk.color) usedColors.add(lk.color.id);
    looks.push(lk);
  }
  if (looks.length < 6) {
    for (const lk of combos) {
      if (looks.length >= 6) break;
      const pair = `${lk.cutFamily}/${lk.colorFamily}`;
      if (looks.includes(lk) || usedPairs.has(pair)) continue;
      usedPairs.add(pair);
      looks.push(lk);
    }
  }
  return { looks, cuts, colors, notToday };
}
