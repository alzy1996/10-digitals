// Color score (PRD 6.2) and technique choice (6.3):
// colorScore = 100 × (0.30·Harmony + 0.30·Feasibility + 0.15·Upkeep + 0.10·Contrast + 0.15·TrendLocal) − penalties
import { planLift, safePath } from '../color/lift.js';
import { reason, topReasons } from './reasons.js';

const WARM_TONES = new Set(['gold', 'copper']);
const COOL_TONES = new Set(['ash', 'pearl', 'violet', 'matte']);
const NEUTRAL_TONES = new Set(['natural', 'beige', 'mocha']);
const WARM_SHADES = new Set(['caramel', 'honey', 'warm-chestnut', 'golden-blonde', 'buttery-blonde', 'teddy-bronde', 'cowboy-copper', 'soft-copper', 'ginger', 'auburn', 'strawberry-blonde']);
const COOL_SHADES = new Set(['mushroom-brown', 'burgundy', 'plum', 'blue-black', 'smoky-brunette', 'ash-blonde', 'pearl-blonde', 'platinum', 'icy-white', 'silver']);
const OLIVE_SHADES = new Set(['espresso', 'dark-chocolate', 'caramel', 'mahogany', 'cherry-cola', 'teddy-bronde']);
const NEUTRAL_SHADES = new Set(['beige-blonde', 'teddy-bronde', 'espresso', 'dark-chocolate', 'soft-black', 'jet-black']);

const LEVEL_UPKEEP = { low: 0, medium: 1, high: 2 };

export function harmony(shade, undertone, eyes) {
  let h;
  const tone = shade.tone;
  if (undertone === 'warm') {
    h = WARM_TONES.has(tone) || WARM_SHADES.has(shade.id) ? 1 : NEUTRAL_TONES.has(tone) ? 0.7 : tone === 'mahogany' || tone === 'red' ? 0.7 : 0.35;
  } else if (undertone === 'cool') {
    h = COOL_TONES.has(tone) || COOL_SHADES.has(shade.id) ? 1 : NEUTRAL_TONES.has(tone) ? 0.7 : 0.4;
  } else if (undertone === 'olive') {
    h = OLIVE_SHADES.has(shade.id) || tone === 'mocha' ? 1 : tone === 'ash' || tone === 'matte' || shade.id === 'silver' ? 0.3 : 0.6;
  } else {
    h = NEUTRAL_TONES.has(tone) || NEUTRAL_SHADES.has(shade.id) ? 0.9 : 0.75;
  }
  let eyeBoost = 0;
  if ((eyes === 'green' || eyes === 'hazel') && (tone === 'copper' || shade.id === 'auburn')) eyeBoost = 0.1;
  if (eyes === 'blue' && (tone === 'ash' || tone === 'pearl' || shade.id === 'golden-blonde')) eyeBoost = 0.1;
  if ((eyes === 'dark-brown' || eyes === 'brown') && (shade.id === 'caramel' || shade.id === 'honey')) eyeBoost = 0.1;
  return { harmony: Math.min(1, h + eyeBoost), eyeBoost };
}

/** Where the color goes for a technique: affects which hair must reach the target level. */
export function techniqueZone(mask) {
  if (mask === 'root' || mask === 'shadow') return 'roots';
  if (['balayage', 'foilyage', 'ombre', 'sombre', 'money', 'peekaboo', 'chroma', 'melt', 'highlights', 'partial', 'babylights', 'chunky'].includes(mask)) return 'lengths';
  return 'all';
}

/** PRD 6.3 technique choice for a shade. Returns technique ids, best first. */
export function candidateTechniques(shade, profile, goals, techniques) {
  const hair = profile.hair;
  const lift = shade.level - hair.rootLevel;
  const upkeep = goals.upkeep || 'medium';
  const has = (id) => techniques.some((t) => t.id === id && !t.hidden);
  const out = [];
  const push = (id) => has(id) && !out.includes(id) && out.push(id);
  if (shade.highUpkeep) push('peekaboo');
  if (goals.visibleZone === 'front') {
    push('money-piece');
    push('babylights');
  }
  if (hair.greyPct >= 30 && upkeep === 'low') push('babylights');
  if (lift > 3 && upkeep === 'low') {
    push('balayage');
    push('shadow-root');
  }
  if (lift <= 0) {
    if (Math.abs(lift) <= 1) push('gloss-toner');
    push('global');
  } else if (lift <= 3) {
    if (upkeep === 'high') push('global');
    push('balayage');
    push('babylights');
  } else {
    push('balayage');
    push('foilyage');
  }
  if (hair.greyPct >= 50) {
    push('global');
    push('babylights');
  }
  push('global');
  return out;
}

export function scoreColor(shade, technique, profile, goals = {}, ctx = {}) {
  const hair = profile.hair;
  const zone = techniqueZone(technique.mask);
  // gloss limits change to 1 level, deposit-only
  const targetLevel = technique.mask === 'gloss' ? Math.min(shade.level, hair.rootLevel + 1) : shade.level;
  const plan = planLift({
    hair,
    history: profile.history,
    targetLevel,
    zone,
    metallicTest: ctx.metallicTest || 'not-done',
    patchRequired: ctx.patchRequired,
  });
  const { harmony: harm, eyeBoost } = harmony(shade, profile.skin.undertone, profile.eyes.color);
  const feas = plan.feasibility;
  const her = LEVEL_UPKEEP[goals.upkeep || 'medium'];
  const fade = shade.highUpkeep ? 1 : shade.family === 'red' ? 0.5 : 0;
  const upk = Math.max(0, 1 - Math.max(0, LEVEL_UPKEEP[technique.upkeep] + fade - her) / 2);
  const dLevel = Math.abs(shade.level - hair.rootLevel);
  let con;
  if (profile.contrast === 'high') con = 1;
  else if (profile.contrast === 'medium') con = dLevel <= 3 ? 1 : 0.8;
  else con = shade.family === 'vivid' ? 0.3 : dLevel <= 2 ? 1 : 0.5;
  const localFit = shade.localFit ?? 0.5;
  const trend = 0.5 * (shade.trend2026 ? 1 : 0) + 0.5 * localFit;
  let bonus = 0;
  if (hair.greyPct >= 50 && (shade.tone === 'natural' || technique.id === 'babylights' || technique.id === 'global')) bonus += 12;
  const blocked = plan.blocked;
  const score = blocked ? 0 : 100 * (0.3 * harm + 0.3 * feas + 0.15 * upk + 0.1 * con + 0.15 * trend) + bonus;
  const u = profile.skin.undertone;
  const reasons = topReasons([
    u === 'warm' && harm >= 0.9 ? reason('warm_harmony', 30 * harm) : null,
    u === 'cool' && harm >= 0.9 ? reason('cool_harmony', 30 * harm) : null,
    eyeBoost > 0 ? reason('eyes_pop', 6) : null,
    plan.sessionsTotal === 1 && !blocked ? reason('one_session', 30 * feas * 0.9) : null,
    plan.sessionsTotal === 2 ? reason('two_sessions', 12) : null,
    technique.upkeep === 'low' ? reason('low_upkeep', 15 * upk) : null,
    technique.id === 'money-piece' || (goals.visibleZone === 'front' && technique.id === 'babylights') ? reason('front_visible', 14) : null,
    hair.greyPct >= 30 && (technique.id === 'babylights' || technique.id === 'balayage') ? reason('grey_blend', 16) : null,
    shade.trend2026 ? reason('trend_2026', 7.5) : null,
  ]);
  return {
    id: `${shade.id}|${technique.id}`,
    shadeId: shade.id,
    techniqueId: technique.id,
    score: Math.round(score * 10) / 10,
    parts: { harmony: harm, feasibility: feas, upkeep: upk, contrast: con, trend },
    plan,
    blocked,
    reasons,
  };
}

/** Rank shade × technique pairs; returns { ranked, notToday }. Deterministic. */
export function rankColors(shades, techniques, profile, goals = {}, ctx = {}) {
  const visibleTech = techniques.filter((t) => !t.hidden);
  const results = [];
  const notToday = [];
  for (const shade of shades) {
    if (shade.hidden) continue;
    const cands = candidateTechniques(shade, profile, goals, visibleTech);
    let best = null;
    for (const tid of cands) {
      const tech = visibleTech.find((t) => t.id === tid);
      if (!tech) continue;
      const r = scoreColor(shade, tech, profile, goals, ctx);
      if (!best || r.score > best.score) best = r;
    }
    if (!best) continue;
    if (best.blocked || best.plan.sessionsTotal >= 3) notToday.push(best);
    if (!best.blocked) results.push(best);
  }
  results.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  // safe path for each "Not today" plan: the best reachable shade in one session, closest in level
  for (const nt of notToday) {
    const path = safePath(nt.plan, profile.history);
    const target = shades.find((s) => s.id === nt.shadeId);
    const levelGap = (r) => Math.abs(shades.find((s) => s.id === r.shadeId).level - target.level);
    const alt = results
      .filter((r) => r.plan.sessionsTotal === 1 && r.shadeId !== nt.shadeId)
      .sort((a, b) => levelGap(a) - levelGap(b) || b.score - a.score || a.id.localeCompare(b.id))[0];
    nt.safePath = path;
    nt.alternative = alt ? { shadeId: alt.shadeId, techniqueId: alt.techniqueId } : null;
  }
  notToday.sort((a, b) => a.id.localeCompare(b.id));
  return { ranked: results, notToday };
}
