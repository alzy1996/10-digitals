// Aftercare lines picked by technique, shade and texture (PRD 11.1): 3 to 5 lines.
export function aftercareKeys({ technique, shade, process, texture, hasCut }) {
  const keys = [];
  const add = (k) => !keys.includes(k) && keys.push(k);
  const mask = technique?.mask;
  if (shade) add('sulfate_free');
  if (process === 'lightener' || process === 'correction' || process === 'high-lift') {
    add('bond_mask');
    add('toner_6w');
  }
  if (shade && shade.level >= 8 && ['ash', 'pearl', 'violet', 'beige', 'natural'].includes(shade.tone)) add('purple_shampoo');
  if (shade && shade.level >= 5 && shade.level <= 7 && ['ash', 'matte', 'natural'].includes(shade.tone)) add('blue_shampoo');
  if (mask === 'gloss' || mask === 'drench') add('gloss_6w');
  if (mask === 'global' || mask === 'root' || mask === 'drench') add('roots_5w');
  if (shade?.highUpkeep) add('pastel_fade');
  if (shade && process !== 'deposit-only') add('wait_48h');
  if (texture === 'curly' || texture === 'coily') add('curl_care');
  add('heat_protect');
  if (hasCut) add('trim_ends');
  add('sun_scarf');
  return keys.slice(0, 5);
}

/** Suggested next visit in weeks from cut trim interval and color upkeep. */
export function nextVisitWeeks({ cut, technique }) {
  const colorWeeks = { high: 5, medium: 8, low: 12 }[technique?.upkeep] ?? null;
  const cutWeeks = cut?.trimWeeks ?? null;
  const vals = [colorWeeks, cutWeeks].filter(Boolean);
  return vals.length ? Math.min(...vals) : 8;
}
