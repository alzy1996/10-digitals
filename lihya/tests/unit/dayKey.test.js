import { describe, expect, it } from 'vitest';
import { addDaysToKey, dayKey, dayKeysBetween, lastNDayKeys, muscatDayRange, muscatIso } from '../../src/lib/time.js';

describe('Muscat dayKey', () => {
  it('19:59:59 UTC and 20:00:00 UTC fall on different Muscat days', () => {
    const a = new Date('2026-10-25T19:59:59Z');
    const b = new Date('2026-10-25T20:00:00Z');
    expect(dayKey(a)).toBe('2026-10-25');
    expect(dayKey(b)).toBe('2026-10-26');
    expect(dayKey(a)).not.toBe(dayKey(b));
  });

  it('uses Muscat, not UTC, just after Muscat midnight', () => {
    expect(dayKey(new Date('2026-03-31T20:30:00Z'))).toBe('2026-04-01');
  });

  it('day range covers exactly 24 hours from Muscat midnight', () => {
    const { start, end } = muscatDayRange('2026-10-26');
    expect(start.toISOString()).toBe('2026-10-25T20:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-26T20:00:00.000Z');
  });

  it('adds days across month and year ends', () => {
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('lists the last 7 days oldest first', () => {
    const keys = lastNDayKeys(7, new Date('2026-10-25T08:00:00Z'));
    expect(keys).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    expect(dayKeysBetween('2026-10-30', '2026-11-02')).toHaveLength(4);
  });

  it('formats ISO with the +04:00 offset', () => {
    expect(muscatIso(new Date('2026-10-25T05:12:00Z'))).toBe('2026-10-25T09:12:00+04:00');
  });

  it('rejects malformed keys', () => {
    expect(() => muscatDayRange('25-10-2026')).toThrow();
  });
});
