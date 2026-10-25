import { describe, expect, it } from 'vitest';
import cuts from '../../src/data/cuts.json';
import fringes from '../../src/data/fringes.json';
import shades from '../../src/data/shades.json';
import techniques from '../../src/data/techniques.json';
import { recommendLooks } from '../../src/ai/recommend/looks.js';
import { scoreCut } from '../../src/ai/recommend/cutScore.js';

const catalog = { cuts, fringes, shades, techniques };

function profile(over = {}) {
  return {
    faceShape: { top: 'oval', scores: { oval: 0.72, heart: 0.2, round: 0.05, square: 0.02, oblong: 0.01, diamond: 0, triangle: 0 } },
    skin: { mst: 5, undertone: 'warm', ita: 24 },
    eyes: { color: 'dark-brown' },
    contrast: 'high',
    ageBand: { band: '25-34' },
    hair: { rootLevel: 2, midLevel: 3, endsLevel: 5, flags: ['previously-lightened'], greyPct: 4, texture: 'wavy', density: 'thick', lengthBand: 'long', lengthCm: 46, warmth: 'warm' },
    history: { henna: 'none', recentColor: 'lighter', bleach: true, chemical: false },
    ...over,
  };
}

describe('Recommendation engine (PRD 6)', () => {
  it('is deterministic: same profile -> same 6 looks in the same order', () => {
    const a = recommendLooks(catalog, profile(), { change: 'both', upkeep: 'medium' });
    const b = recommendLooks(catalog, profile(), { change: 'both', upkeep: 'medium' });
    expect(a.looks).toHaveLength(6);
    expect(a.looks.map((l) => l.id)).toEqual(b.looks.map((l) => l.id));
  });
  it('never puts a blocked plan in Looks', () => {
    const p = profile({ history: { henna: 'pure', recentColor: 'none', bleach: false, chemical: false }, hair: { ...profile().hair, flags: [], rootLevel: 3, midLevel: 3, endsLevel: 3 } });
    const r = recommendLooks(catalog, p, { change: 'color', upkeep: 'low' });
    for (const lk of r.looks) expect(lk.color?.blocked).not.toBe(true);
    expect(r.notToday.length).toBeGreaterThan(0);
    expect(r.notToday.every((n) => n.blocked || n.plan.sessionsTotal >= 3)).toBe(true);
  });
  it('diversifies looks: no two share both cut family and color family', () => {
    const r = recommendLooks(catalog, profile(), { change: 'both' });
    const pairs = r.looks.map((l) => `${l.cutFamily}/${l.colorFamily}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });
  it('shows at most 3 reason chips per look', () => {
    const r = recommendLooks(catalog, profile(), { change: 'both' });
    for (const lk of r.looks) expect(lk.reasons.length).toBeLessThanOrEqual(3);
  });
  it('"must tie it back" hides cuts above the shoulder', () => {
    const r = recommendLooks(catalog, profile(), { change: 'cut', tieBack: true });
    for (const c of r.cuts) expect(['very-short', 'short', 'jaw', 'chin']).not.toContain(c.cut.length);
  });
  it('flags a big change when the cut is more than 15 cm shorter', () => {
    const pixie = cuts.find((c) => c.id === 'classic-pixie');
    expect(scoreCut(pixie, profile(), {}).bigChange).toBe(true);
  });
  it('grey 50%+ ranks coverage/blending first', () => {
    const p = profile({ hair: { ...profile().hair, greyPct: 60, flags: [], endsLevel: 4, rootLevel: 4, midLevel: 4 }, history: { henna: 'none', recentColor: 'none', bleach: false, chemical: false } });
    const r = recommendLooks(catalog, p, { change: 'color', upkeep: 'low' });
    const top = r.colors[0];
    expect(['global', 'babylights'].includes(top.techniqueId) || shades.find((s) => s.id === top.shadeId).tone === 'natural').toBe(true);
  });
  it('runs in under 100 ms', () => {
    const t = performance.now();
    recommendLooks(catalog, profile(), { change: 'both' });
    expect(performance.now() - t).toBeLessThan(100);
  });
});
