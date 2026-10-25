import DEFAULT_GUARD_CHART from '../data/guards.json';

export { DEFAULT_GUARD_CHART };

const SHAVE_MAX_MM = 0.25;

/**
 * Map a target length to the nearest clipper guard of the shop's chart.
 * - 0 (or under 0.25 mm) means shaved.
 * - Longer than the longest guard means scissor-over-comb, "scissor, keep X mm".
 * - A tie between two guards picks the longer one: the barber can always take more off.
 * @returns {{kind:'shave'|'guard'|'scissor', guardId:string|null, label:{en:string,ar:string}, mm:number, targetMm:number}}
 */
export function mmToGuard(targetMm, chart = DEFAULT_GUARD_CHART) {
  const mm = Math.max(0, Number(targetMm) || 0);
  const guards = [...(chart && chart.length ? chart : DEFAULT_GUARD_CHART)]
    .filter((g) => Number.isFinite(Number(g.mm)))
    .sort((a, b) => a.mm - b.mm);
  if (mm <= SHAVE_MAX_MM) {
    return { kind: 'shave', guardId: null, label: { en: 'Shave', ar: 'حلاقة على الصفر' }, mm: 0, targetMm: mm };
  }
  const longest = guards[guards.length - 1];
  if (mm > longest.mm) {
    const keep = Math.round(mm);
    return {
      kind: 'scissor',
      guardId: null,
      label: { en: `scissor, keep ${keep} mm`, ar: `مقص، اترك ${keep} مم` },
      mm: keep,
      targetMm: mm,
    };
  }
  let best = guards[0];
  let bestD = Math.abs(mm - best.mm);
  for (const g of guards) {
    const d = Math.abs(mm - g.mm);
    if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && g.mm > best.mm)) {
      best = g;
      bestD = d;
    }
  }
  return { kind: 'guard', guardId: best.id, label: best.label, mm: best.mm, targetMm: mm };
}

/** Validate an owner-edited guard chart: unique ids, positive mm, strictly increasing. */
export function validateGuardChart(chart) {
  const errors = [];
  if (!Array.isArray(chart) || chart.length === 0) return ['empty'];
  const ids = new Set();
  let prev = -Infinity;
  chart.forEach((g, i) => {
    if (!g || typeof g.id !== 'string' || !g.id) errors.push(`row ${i + 1}: id`);
    else if (ids.has(g.id)) errors.push(`row ${i + 1}: duplicate id`);
    else ids.add(g.id);
    const mm = Number(g?.mm);
    if (!Number.isFinite(mm) || mm <= 0 || mm > 60) errors.push(`row ${i + 1}: mm`);
    else if (mm <= prev) errors.push(`row ${i + 1}: order`);
    else prev = mm;
  });
  return errors;
}
