// Reason chips (PRD 6.5): show the 3 with the biggest score contribution. Never more than 3.
import texts from '../../data/reasons.json';

export function reason(key, weight) {
  return { key, weight, text: texts[key] };
}

export function topReasons(list, max = 3) {
  const seen = new Set();
  return list
    .filter((r) => r && r.weight > 0 && texts[r.key] && !seen.has(r.key) && seen.add(r.key))
    .sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key))
    .slice(0, max);
}
