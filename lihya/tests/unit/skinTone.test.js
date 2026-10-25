// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  itaOf,
  itaBand,
  nearestMst,
  undertoneOf,
  hueAngle,
  skinFromSamples,
  trimByLightness,
  MST_SWATCHES,
  MST_LAB,
} from '../../src/ai/analysis/skinTone.js';
import { lchToLab, hexToLab } from '../../src/ai/analysis/color.js';

describe('ITA (PRD 5.6)', () => {
  it('computes atan2(L* - 50, b*) in degrees', () => {
    expect(itaOf([50, 0, 20])).toBeCloseTo(0, 10);
    expect(itaOf([75, 0, 25])).toBeCloseTo(45, 10);
    expect(itaOf([25, 0, 25])).toBeCloseTo(-45, 10);
  });

  it('assigns the PRD bands', () => {
    expect(itaBand(60)).toBe('veryLight');
    expect(itaBand(55.1)).toBe('veryLight');
    expect(itaBand(55)).toBe('light');
    expect(itaBand(41.5)).toBe('light');
    expect(itaBand(41)).toBe('intermediate');
    expect(itaBand(28.5)).toBe('intermediate');
    expect(itaBand(28)).toBe('tan');
    expect(itaBand(10.5)).toBe('tan');
    expect(itaBand(10)).toBe('brown');
    expect(itaBand(-30)).toBe('brown');
    expect(itaBand(-30.5)).toBe('dark');
  });
});

describe('Monk Skin Tone', () => {
  it('has the 10 published swatches', () => {
    expect(MST_SWATCHES).toEqual([
      '#f6ede4',
      '#f3e7db',
      '#f7ead0',
      '#eadaba',
      '#d7bd96',
      '#a07e56',
      '#825c43',
      '#604134',
      '#3a312a',
      '#292420',
    ]);
  });

  it('maps every swatch to itself and small shifts to the same tone', () => {
    MST_LAB.forEach((lab, k) => {
      expect(nearestMst(lab)).toBe(k + 1);
      expect(nearestMst([lab[0] + 0.6, lab[1] - 0.4, lab[2] + 0.4])).toBe(k + 1);
    });
  });

  it('orders from light to dark', () => {
    expect(nearestMst(hexToLab('#ffffff'))).toBe(1);
    expect(nearestMst(hexToLab('#1a1714'))).toBe(10);
    expect(nearestMst(hexToLab('#c8a27a'))).toBeGreaterThanOrEqual(5);
    expect(nearestMst(hexToLab('#c8a27a'))).toBeLessThanOrEqual(6);
  });
});

describe('undertone from the hue angle', () => {
  it('reads warm above 62, cool below 52, neutral between', () => {
    expect(undertoneOf(lchToLab([60, 35, 70]))).toBe('warm');
    expect(undertoneOf(lchToLab([60, 25, 45]))).toBe('cool');
    expect(undertoneOf(lchToLab([60, 25, 57]))).toBe('neutral');
    expect(undertoneOf(lchToLab([60, 30, 62.5]))).toBe('warm');
    expect(undertoneOf(lchToLab([60, 30, 51.5]))).toBe('cool');
    expect(hueAngle(lchToLab([60, 25, 57]))).toBeCloseTo(57, 8);
  });

  it('reads olive when a* < 9, b* > 14 and h > 58', () => {
    expect(undertoneOf([55, 7, 18])).toBe('olive');
    expect(undertoneOf(lchToLab([60, 25, 70]))).toBe('olive');
    // a* = 10 is not olive: h = 60.9 is between the thresholds.
    expect(undertoneOf([55, 10, 18])).toBe('neutral');
    // b* = 13 is not olive: h = 61.7 is between the thresholds.
    expect(undertoneOf([55, 7, 13])).toBe('neutral');
    // h = 56 fails the olive hue condition.
    expect(undertoneOf(lchToLab([60, 16, 56]))).toBe('neutral');
  });
});

describe('skin samples', () => {
  const skin = [62, 13, 19];
  const jitter = (k) => [skin[0] + ((k * 7) % 5) - 2, skin[1] + ((k * 3) % 3) - 1, skin[2] + ((k * 5) % 3) - 1];

  it('drops the top 5 % (shine) and the bottom 10 % (shadow, stubble)', () => {
    const samples = [];
    for (let k = 0; k < 870; k++) samples.push(jitter(k));
    for (let k = 0; k < 40; k++) samples.push([95, 1, 4]);
    for (let k = 0; k < 90; k++) samples.push([20, 3, 5]);
    const kept = trimByLightness(samples);
    expect(kept.every((c) => c[0] < 90 && c[0] > 30)).toBe(true);
    const res = skinFromSamples(samples);
    expect(Math.abs(res.lab[0] - skin[0])).toBeLessThan(1.5);
    expect(Math.abs(res.lab[2] - skin[2])).toBeLessThan(1.5);
  });

  it('weights cheeks and forehead about equally', () => {
    const left = Array.from({ length: 400 }, (_, k) => jitter(k));
    const right = Array.from({ length: 400 }, (_, k) => jitter(k + 1));
    const forehead = Array.from({ length: 3000 }, () => [72, 11, 18]);
    const res = skinFromSamples({ all: [...left, ...right, ...forehead], left, right, forehead });
    expect(res.lab[0]).toBeGreaterThan(62);
    expect(res.lab[0]).toBeLessThan(66);
  });

  it('returns the FaceProfile skin fields', () => {
    const res = skinFromSamples(Array.from({ length: 600 }, (_, k) => jitter(k)), { whiteCard: true });
    expect(Object.keys(res).sort()).toEqual(['confidence', 'ita', 'itaBand', 'lab', 'mst', 'undertone']);
    expect(res.mst).toBeGreaterThanOrEqual(1);
    expect(res.mst).toBeLessThanOrEqual(10);
    expect(res.confidence).toBeGreaterThan(0.5);
    expect(res.confidence).toBeLessThanOrEqual(1);
    expect(skinFromSamples([])).toBeNull();
  });

  it('is more confident with a white card', () => {
    const samples = Array.from({ length: 600 }, (_, k) => jitter(k));
    expect(skinFromSamples(samples, { whiteCard: true }).confidence).toBeGreaterThan(skinFromSamples(samples).confidence);
  });
});
