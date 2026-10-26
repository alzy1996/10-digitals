import { describe, expect, it } from 'vitest';
import { deltaE2000, rgbToLab, labToRgb, ita, itaBand, nearestMst, MST_HEX, hexToLab, undertone, labToLinear, linearToLab } from '../../src/ai/analysis/color.js';
import { lightMatrix, bradfordXyz, cctToXy, xyToXyz } from '../../src/ai/color/bradford.js';
import { mul3, D65 } from '../../src/ai/analysis/color.js';

// Sharma, Wu, Dalal (2005) CIEDE2000 test data: [L1,a1,b1, L2,a2,b2, dE]
const SHARMA = [
  [50, 2.6772, -79.7751, 50, 0, -82.7485, 2.0425],
  [50, 3.1571, -77.2803, 50, 0, -82.7485, 2.8615],
  [50, 2.8361, -74.02, 50, 0, -82.7485, 3.4412],
  [50, -1.3802, -84.2814, 50, 0, -82.7485, 1.0],
  [50, -1.1848, -84.8006, 50, 0, -82.7485, 1.0],
  [50, -0.9009, -85.5211, 50, 0, -82.7485, 1.0],
  [50, 0, 0, 50, -1, 2, 2.3669],
  [50, -1, 2, 50, 0, 0, 2.3669],
  [50, 2.49, -0.001, 50, -2.49, 0.0009, 7.1792],
  [50, 2.49, -0.001, 50, -2.49, 0.001, 7.1792],
  [50, 2.49, -0.001, 50, -2.49, 0.0011, 7.2195],
  [50, 2.49, -0.001, 50, -2.49, 0.0012, 7.2195],
  [50, -0.001, 2.49, 50, 0.0009, -2.49, 4.8045],
  [50, -0.001, 2.49, 50, 0.001, -2.49, 4.8045],
  [50, -0.001, 2.49, 50, 0.0011, -2.49, 4.7461],
  [50, 2.5, 0, 50, 0, -2.5, 4.3065],
  [50, 2.5, 0, 73, 25, -18, 27.1492],
  [50, 2.5, 0, 61, -5, 29, 22.8977],
  [50, 2.5, 0, 56, -27, -3, 31.903],
  [50, 2.5, 0, 58, 24, 15, 19.4535],
  [50, 2.5, 0, 50, 3.1736, 0.5854, 1.0],
  [50, 2.5, 0, 50, 3.2972, 0, 1.0],
  [50, 2.5, 0, 50, 1.8634, 0.5757, 1.0],
  [50, 2.5, 0, 50, 3.2592, 0.335, 1.0],
  [60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387, 1.2644],
  [63.0109, -31.0961, -5.8663, 62.8187, -29.7946, -4.0864, 1.263],
  [61.2901, 3.7196, -5.3901, 61.4292, 2.248, -4.962, 1.8731],
  [35.0831, -44.1164, 3.7933, 35.0232, -40.0716, 1.5901, 1.8645],
  [22.7233, 20.0904, -46.694, 23.0331, 14.973, -42.5619, 2.0373],
  [36.4612, 47.858, 18.3852, 36.2715, 50.5065, 21.2231, 1.4146],
  [90.8027, -2.0831, 1.441, 91.1528, -1.6435, 0.0447, 1.4441],
  [90.9257, -0.5406, -0.9208, 88.6381, -0.8985, -0.7239, 1.5381],
  [6.7747, -0.2908, -2.4247, 5.8714, -0.0985, -2.2286, 0.6377],
  [2.0776, 0.0795, -1.135, 0.9033, -0.0636, -0.5514, 0.9082],
];

describe('CIEDE2000', () => {
  it('matches the published Sharma 2005 test pairs', () => {
    for (const [L1, a1, b1, L2, a2, b2, expected] of SHARMA) {
      expect(deltaE2000([L1, a1, b1], [L2, a2, b2])).toBeCloseTo(expected, 4);
    }
  });
  it('is symmetric and zero for identical colors', () => {
    expect(deltaE2000([40, 10, 20], [40, 10, 20])).toBe(0);
    expect(deltaE2000([40, 10, 20], [42, 8, 25])).toBeCloseTo(deltaE2000([42, 8, 25], [40, 10, 20]), 10);
  });
});

describe('sRGB -> Lab', () => {
  const ref = [
    [[255, 255, 255], [100, 0, 0]],
    [[0, 0, 0], [0, 0, 0]],
    [[255, 0, 0], [53.2408, 80.0925, 67.2032]],
    [[0, 255, 0], [87.7347, -86.1827, 83.1793]],
    [[0, 0, 255], [32.297, 79.1875, -107.8602]],
    [[128, 128, 128], [53.5850, 0, 0]],
    [[255, 255, 0], [97.1393, -21.5537, 94.4780]],
  ];
  it('is within 0.5 of reference values', () => {
    for (const [rgb, lab] of ref) {
      const out = rgbToLab(rgb);
      for (let i = 0; i < 3; i += 1) expect(Math.abs(out[i] - lab[i])).toBeLessThan(0.5);
    }
  });
  it('round-trips through Lab', () => {
    for (const rgb of [[20, 30, 40], [200, 120, 60], [93, 64, 41]]) {
      const back = labToRgb(rgbToLab(rgb));
      back.forEach((v, i) => expect(Math.abs(v - rgb[i])).toBeLessThanOrEqual(1));
    }
  });
});

describe('ITA and Monk Skin Tone', () => {
  it('computes ITA bands', () => {
    expect(itaBand(ita([80, 5, 12]))).toBe('very-light');
    expect(itaBand(ita([65, 10, 17]))).toBe('light');
    expect(itaBand(ita([60, 11, 14]))).toBe('intermediate');
    expect(itaBand(ita([56, 12, 18]))).toBe('tan');
    expect(itaBand(ita([40, 12, 20]))).toBe('brown');
    expect(itaBand(ita([25, 10, 15]))).toBe('dark');
  });
  it('maps each MST swatch to itself', () => {
    MST_HEX.forEach((hex, i) => expect(nearestMst(hexToLab(hex)).mst).toBe(i + 1));
  });
  it('classifies undertone by hue angle', () => {
    expect(undertone([60, 12, 30])).toBe('warm');
    expect(undertone([60, 18, 12])).toBe('cool');
    expect(undertone([60, 12, 17])).toBe('neutral');
    expect(undertone([60, 6, 18])).toBe('olive');
  });
});

describe('Bradford light transform', () => {
  it('daylight (6500 K) is identity', () => {
    const m = lightMatrix(6500);
    expect(m[0][0]).toBe(1);
    expect(m[1][1]).toBe(1);
  });
  it('round-trips D65 -> 2700 K -> D65 within 0.5 dE', () => {
    const warm = xyToXyz(cctToXy(2700));
    const fwd = bradfordXyz(D65, warm);
    const back = bradfordXyz(warm, D65);
    for (const lab of [[30, 10, 15], [55, -5, 20], [80, 2, -10], [45, 30, 25]]) {
      const lin = labToLinear(lab);
      const xyz = mul3([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.072175], [0.0193339, 0.119192, 0.9503041]], lin);
      const rt = mul3(back, mul3(fwd, xyz));
      const inv = [[3.2404542, -1.5371385, -0.4985314], [-0.969266, 1.8760108, 0.041556], [0.0556434, -0.2040259, 1.0572252]];
      const out = linearToLab(mul3(inv, rt));
      expect(deltaE2000(lab, out)).toBeLessThan(0.5);
    }
  });
  it('warm light makes white warmer (higher b*)', () => {
    const m = lightMatrix(2700, 0.7);
    const white = linearToLab(mul3(m, [1, 1, 1]));
    expect(white[2]).toBeGreaterThan(10);
  });
  it('planckian 2700 K chromaticity is close to the published value', () => {
    const [x, y] = cctToXy(2700);
    expect(x).toBeCloseTo(0.46, 2);
    expect(y).toBeCloseTo(0.41, 2);
  });
});
