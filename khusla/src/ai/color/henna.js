// Henna Guard preview (PRD 7.6): pure henna coats the hair and shows copper-red, strongest on grey.
// It never promises a cool blonde over henna.
import rules from '../../data/liftRules.json';

/** Lab of the henna stage on hair with the given natural Lab and grey %. */
export function hennaStageLab(naturalLab, greyPct = 0) {
  const [hL, ha, hb] = rules.henna.stage.lab;
  const greyW = Math.min(1, greyPct / 100) * (rules.henna.stage.greyBoost - 1) + 1;
  const mix = Math.min(1, 0.55 * greyW);
  return [
    naturalLab[0] + (Math.max(naturalLab[0], hL * 0.9) - naturalLab[0]) * mix * 0.4,
    naturalLab[1] + (ha - naturalLab[1]) * mix,
    naturalLab[2] + (hb - naturalLab[2]) * mix,
  ];
}

/** Copper-orange stages if lightening over henna is attempted (shown only as a warning). */
export function hennaLightenedStages() {
  return rules.henna.lightenedStages.map((s) => s.lab);
}
