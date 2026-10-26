import { describe, expect, it } from 'vitest';
import levels from '../../src/data/levels.json';
import { hexToLab } from '../../src/ai/analysis/color.js';
import { levelFromL, levelFlags } from '../../src/ai/analysis/hairLevel.js';

describe('Level matching (PRD 4.4)', () => {
  it('maps each starting swatch back to its own level', () => {
    for (const l of levels) expect(levelFromL(hexToLab(l.swatch)[0])).toBe(l.level);
  });
  it('raises the right flags for mixed roots and ends', () => {
    expect(levelFlags(3, 6)).toEqual(['previously-lightened']);
    expect(levelFlags(7, 4)).toEqual(['previous-darker']);
    expect(levelFlags(5, 6)).toEqual([]);
  });
  it('uses scanned levels when the salon has them', () => {
    const scanned = { 1: [10, 0, 0], 2: [20, 0, 0], 3: [30, 0, 0] };
    expect(levelFromL(21, scanned)).toBe(2);
  });
});
