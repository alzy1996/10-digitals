import { describe, expect, it } from 'vitest';
import { planLift, session1Lab, pigmentLab } from '../../src/ai/color/lift.js';
import { dryLength } from '../../src/ai/render/lengthTape.js';

const virgin = (lv) => ({ rootLevel: lv, midLevel: lv, endsLevel: lv, greyPct: 0, flags: [] });

describe('Lift Reality Check (PRD 4.10)', () => {
  it('level 3 virgin -> level 10 = 2 sessions with lightener', () => {
    const p = planLift({ hair: virgin(3), history: {}, targetLevel: 10 });
    expect(p.sessionsTotal).toBe(2);
    expect(p.process).toBe('lightener');
    expect(p.session1Level).toBe(7);
    expect(p.tests).toContain('strand');
  });
  it('level 6 previously colored -> level 9 = lightener, 1 session', () => {
    const p = planLift({ hair: virgin(6), history: { recentColor: 'lighter' }, targetLevel: 9 });
    expect(p.process).toBe('lightener');
    expect(p.sessionsTotal).toBe(1);
  });
  it('compound henna with a positive metallic-salt test is blocked', () => {
    const p = planLift({ hair: virgin(4), history: { henna: 'compound' }, targetLevel: 6, metallicTest: 'positive' });
    expect(p.blocked).toBe(true);
    expect(p.process).toBe('blocked');
    expect(p.blockReason).toBe('metallic_positive');
    expect(p.safeLift).toBe(0);
  });
  it('pure henna + lift = "Not today" with a copper warning', () => {
    const p = planLift({ hair: virgin(4), history: { henna: 'pure' }, targetLevel: 7 });
    expect(p.notToday).toBe(true);
    expect(p.warnings).toContain('henna_copper');
  });
  it('grey 60% -> coverage needs a natural tone', () => {
    const p = planLift({ hair: { ...virgin(5), greyPct: 60 }, history: {}, targetLevel: 5 });
    expect(p.needsNaturalTone).toBe(true);
    expect(p.warnings).toContain('grey_natural_tone');
  });
  it('level 9 -> level 5 = filler likely', () => {
    const p = planLift({ hair: virgin(9), history: {}, targetLevel: 5 });
    expect(p.fillerLikely).toBe(true);
    expect(p.process).toBe('deposit-only');
  });
  it('compound or unsure henna flags the metallic-salt test', () => {
    expect(planLift({ hair: virgin(4), history: { henna: 'unsure' }, targetLevel: 5 }).tests).toContain('metallic');
  });
  it('patch test comes only from the session answer', () => {
    expect(planLift({ hair: virgin(4), history: {}, targetLevel: 4 }).tests).not.toContain('patch');
    expect(planLift({ hair: virgin(4), history: {}, targetLevel: 4, patchRequired: true }).tests).toContain('patch');
  });
  it('high-lift for natural level 6+ with 3-4 levels', () => {
    expect(planLift({ hair: virgin(6), history: {}, targetLevel: 9 }).process).toBe('high-lift');
    expect(planLift({ hair: virgin(4), history: {}, targetLevel: 6 }).process).toBe('lift-color');
  });
  it('previous darker color going lighter is a correction', () => {
    expect(planLift({ hair: virgin(3), history: { recentColor: 'darker' }, targetLevel: 6 }).process).toBe('correction');
  });
  it('session-1 color shows the underlying pigment toned toward the target', () => {
    const p = planLift({ hair: virgin(3), history: {}, targetLevel: 10 });
    const s1 = session1Lab(p, [85, 0, 5]);
    const pig = pigmentLab(7);
    expect(s1[0]).toBeCloseTo(pig[0], 5);
    expect(s1[2]).toBeLessThan(pig[2]);
    expect(s1[2]).toBeGreaterThan(5);
  });
});

describe('Curl shrinkage (PRD 4.11)', () => {
  it('30 cm curly at 40% -> about 18 cm when dry', () => {
    expect(dryLength(30, 40)).toBe(18);
  });
  it('straight hair does not shrink', () => {
    expect(dryLength(42, 0)).toBe(42);
  });
});
