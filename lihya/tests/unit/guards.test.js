import { describe, expect, it } from 'vitest';
import { DEFAULT_GUARD_CHART, mmToGuard, validateGuardChart } from '../../src/lib/guards.js';

describe('mm to guard', () => {
  it('0 mm is a shave', () => {
    expect(mmToGuard(0).kind).toBe('shave');
  });
  it('1.4 mm rounds to the nearest guard, #0.5 (1.5 mm)', () => {
    const g = mmToGuard(1.4);
    expect(g.kind).toBe('guard');
    expect(g.guardId).toBe('0.5');
  });
  it('1.5 mm is exactly #0.5', () => {
    expect(mmToGuard(1.5).guardId).toBe('0.5');
  });
  it('25 mm is #8', () => {
    expect(mmToGuard(25).guardId).toBe('8');
  });
  it('26 mm is scissor-over-comb, keep 26 mm', () => {
    const g = mmToGuard(26);
    expect(g.kind).toBe('scissor');
    expect(g.mm).toBe(26);
    expect(g.label.en).toBe('scissor, keep 26 mm');
  });
  it('a tie picks the longer guard (safer)', () => {
    // halfway between #3 (10) and #4 (13)
    expect(mmToGuard(11.5).guardId).toBe('4');
  });
  it('uses an owner-edited chart', () => {
    const chart = [
      { id: 'a', label: { en: 'A', ar: 'A' }, mm: 2 },
      { id: 'b', label: { en: 'B', ar: 'B' }, mm: 9 },
    ];
    expect(mmToGuard(4, chart).guardId).toBe('a');
    expect(mmToGuard(10, chart).kind).toBe('scissor');
  });
  it('validates the default chart and rejects bad ones', () => {
    expect(validateGuardChart(DEFAULT_GUARD_CHART)).toEqual([]);
    expect(validateGuardChart([{ id: 'x', mm: 5 }, { id: 'x', mm: 3 }]).length).toBeGreaterThan(0);
  });
});
