import { describe, expect, it } from 'vitest';
import { dayKey, muscatDayRange, addDaysKey, lastNDayKeys, nextAiReset } from '../../src/lib/time.js';

describe('Muscat dayKey', () => {
  it('19:59:59 UTC and 20:00:00 UTC fall on different Muscat days', () => {
    const a = dayKey(new Date('2026-10-25T19:59:59Z'));
    const b = dayKey(new Date('2026-10-25T20:00:00Z'));
    expect(a).toBe('2026-10-25');
    expect(b).toBe('2026-10-26');
  });
  it('day range is 00:00 to 24:00 Asia/Muscat', () => {
    const [start, end] = muscatDayRange('2026-10-25');
    expect(start.toISOString()).toBe('2026-10-24T20:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-25T20:00:00.000Z');
  });
  it('adds days and lists the last N days', () => {
    expect(addDaysKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(lastNDayKeys(7, new Date('2026-10-25T10:00:00Z'))).toEqual([
      '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25',
    ]);
  });
  it('AI cap resets at 04:00 Muscat (00:00 UTC)', () => {
    expect(nextAiReset(new Date('2026-10-25T23:30:00Z')).toISOString()).toBe('2026-10-26T00:00:00.000Z');
  });
});
