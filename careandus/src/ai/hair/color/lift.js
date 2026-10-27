// Lift Reality Check planning model (PRD 4.10 + 7.4). Planning aid only: it suggests the
// process type, sessions and tests. It never prints brand mixing ratios. The colorist decides.
import rules from '../../../data/liftRules.json';
import levels from '../../../data/levels.json';
import { hexToLab } from '../analysis/color.js';

const LEVEL_LAB = Object.fromEntries(levels.map((l) => [l.level, hexToLab(l.swatch)]));
const LEVEL_PIGMENT = Object.fromEntries(levels.map((l) => [l.level, l.pigment]));

const clampLevel = (lv) => Math.max(1, Math.min(12, Math.round(lv)));

export function isProcessed(history = {}, flags = []) {
  return Boolean(
    history.bleach ||
      history.chemical ||
      ['darker', 'lighter', 'unsure'].includes(history.recentColor) ||
      flags.includes('previously-lightened') ||
      flags.includes('previous-darker'),
  );
}

export function hasArtificialColor(history = {}, flags = []) {
  return Boolean(
    history.bleach ||
      ['darker', 'lighter', 'unsure'].includes(history.recentColor) ||
      flags.includes('previously-lightened') ||
      flags.includes('previous-darker'),
  );
}

export function isLightened(history = {}, flags = [], startLevel = 0) {
  return Boolean(
    history.bleach ||
      history.recentColor === 'lighter' ||
      flags.includes('previously-lightened') ||
      startLevel >= rules.likelyLightenedFromLevel,
  );
}

export function developerFor(lift) {
  if (lift <= 0) return 10;
  const row = rules.developer.find((d) => d.use === 'lift' && lift <= d.maxLift);
  return row ? row.volume : null; // null: beyond developer range, lightener
}

/**
 * @param {object} p
 * @param {{rootLevel:number, midLevel?:number, endsLevel?:number, greyPct?:number, flags?:string[]}} p.hair
 * @param {{henna?:string, recentColor?:string, bleach?:boolean, chemical?:boolean}} p.history
 * @param {number} p.targetLevel
 * @param {string} [p.zone] 'all' | 'roots' | 'lengths' — where the target color goes
 * @param {'not-done'|'negative'|'positive'} [p.metallicTest]
 * @param {boolean} [p.patchRequired] session-only answer, never stored
 */
export function planLift({ hair, history = {}, targetLevel, zone = 'all', metallicTest = 'not-done', patchRequired = false }) {
  const flags = hair.flags || [];
  const root = clampLevel(hair.rootLevel);
  const mid = clampLevel(hair.midLevel ?? hair.rootLevel);
  const ends = clampLevel(hair.endsLevel ?? hair.midLevel ?? hair.rootLevel);
  const target = clampLevel(targetLevel);
  const greyPct = hair.greyPct || 0;

  const zoneLevels = zone === 'roots' ? [root] : zone === 'lengths' ? [mid, ends] : [root, mid, ends];
  const startLevel = Math.min(...zoneLevels); // the darkest hair that must reach the target
  const lightestStart = Math.max(...zoneLevels);
  const liftNeeded = target - startLevel;
  const processed = isProcessed(history, flags);
  const artificial = hasArtificialColor(history, flags);
  const lightened = isLightened(history, flags, lightestStart);

  const tests = new Set();
  const warnings = [];
  let process;
  let blocked = false;
  let blockReason = null;

  const henna = history.henna || 'none';
  const metallicNeeded = henna === 'compound' || henna === 'unsure';
  if (metallicNeeded) tests.add('metallic');
  if (patchRequired) tests.add('patch');

  let safeLift = processed ? rules.safeLiftPerSession.processed : rules.safeLiftPerSession.virgin;
  if (metallicTest === 'positive') {
    safeLift = rules.safeLiftPerSession.metallicPositive;
    blocked = true;
    blockReason = 'metallic_positive';
    process = 'blocked';
  }

  if (!blocked && liftNeeded > 0 && henna === 'pure') {
    blocked = true;
    blockReason = 'henna_lift';
    process = 'blocked';
    warnings.push('henna_copper');
  }

  if (!blocked) {
    if (liftNeeded <= 0) {
      process = 'deposit-only';
    } else if (artificial) {
      process = history.recentColor === 'darker' || flags.includes('previous-darker') ? 'correction' : 'lightener';
    } else if (liftNeeded > rules.lightenerAboveLift) {
      process = 'lightener';
    } else if (liftNeeded >= 3 && startLevel >= rules.highLift.minStartLevel) {
      process = 'high-lift';
    } else if (liftNeeded <= 3) {
      process = 'lift-color';
    } else {
      process = 'lightener';
    }
  }

  const sessionsTotal = blocked ? 0 : liftNeeded > 0 ? Math.ceil(liftNeeded / safeLift) : 1;
  const session1Level = blocked ? startLevel : liftNeeded > 0 ? Math.min(target, startLevel + safeLift) : target;

  if (!blocked && (process === 'lightener' || process === 'correction' || process === 'high-lift' || sessionsTotal > 1 || (processed && liftNeeded > 0))) {
    tests.add('strand');
  }
  if (henna === 'pure' && liftNeeded <= 0) warnings.push('henna_deposit');
  if (metallicNeeded && metallicTest !== 'negative' && !blocked) warnings.push('metallic_test_first');

  const fillerLikely = !blocked && target <= lightestStart - rules.fillerDarkerLevels && lightened;
  const needsNaturalTone = greyPct >= rules.greyCoverageNaturalTonePct;
  if (needsNaturalTone) warnings.push('grey_natural_tone');
  if (fillerLikely) warnings.push('filler');

  const feasibility = blocked ? 0 : Math.max(0, 1 - 0.25 * (sessionsTotal - 1));

  return {
    startLevel,
    targetLevel: target,
    liftNeeded,
    process,
    safeLift,
    sessionsTotal,
    session1Level,
    developerVolume: blocked ? null : process === 'deposit-only' ? 10 : developerFor(Math.min(liftNeeded, safeLift)),
    tests: [...tests],
    fillerLikely,
    needsNaturalTone,
    blocked,
    blockReason,
    notToday: blocked,
    warnings,
    feasibility,
    processed,
  };
}

/** Lab of a level's underlying pigment (what shows when that level is lightened). */
export function pigmentLab(level) {
  const lv = clampLevel(level);
  const base = LEVEL_LAB[lv];
  const [pa, pb] = rules.pigments[LEVEL_PIGMENT[lv]];
  return [base[0], pa, pb];
}

export function levelLab(level, scanned) {
  const lv = clampLevel(level);
  return scanned?.[lv] || LEVEL_LAB[lv];
}

/**
 * Color shown in the "After session 1" preview: the session-1 level with its underlying pigment,
 * toned toward the target as far as a toner can reach.
 */
export function session1Lab(plan, targetLab) {
  if (plan.blocked) return null;
  if (plan.session1Level >= plan.targetLevel) return targetLab;
  const pig = pigmentLab(plan.session1Level);
  const k = rules.tonerReach;
  return [pig[0], pig[1] + (targetLab[1] - pig[1]) * k, pig[2] + (targetLab[2] - pig[2]) * k];
}

/** Human-readable safe path for the "Not today" drawer. */
export function safePath(plan, history = {}) {
  if (plan.blockReason === 'metallic_positive') return { key: 'safe.metallic', vars: {} };
  if (plan.blockReason === 'henna_lift') return { key: 'safe.henna', vars: {} };
  if (plan.sessionsTotal > 1) return { key: 'safe.sessions', vars: { n: plan.sessionsTotal, level: plan.session1Level } };
  if (history.henna === 'unsure') return { key: 'safe.metallicFirst', vars: {} };
  return null;
}
