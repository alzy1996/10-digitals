// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  rgbToLab,
  labToRgb,
  hexToLab,
  deltaE2000,
  linearRgbToLab,
  srgbToLinear,
  labToLch,
  median,
} from '../../src/ai/analysis/color.js';
import { MST_SWATCHES } from '../../src/ai/analysis/skinTone.js';

// Published sRGB (D65) -> CIELAB values (Bruce Lindbloom's calculator / CIE formulas).
const REFERENCE = [
  [[255, 255, 255], [100, 0, 0]],
  [[0, 0, 0], [0, 0, 0]],
  [[255, 0, 0], [53.24, 80.09, 67.2]],
  [[0, 255, 0], [87.73, -86.18, 83.18]],
  [[0, 0, 255], [32.3, 79.19, -107.86]],
  [[255, 255, 0], [97.14, -21.55, 94.48]],
  [[0, 255, 255], [91.11, -48.09, -14.13]],
  [[255, 0, 255], [60.32, 98.23, -60.82]],
  [[128, 128, 128], [53.59, 0, 0]],
];

// Independent reference implementation written from the standards (IEC 61966-2-1
// sRGB, CIE 15:2004 L*a*b* with the exact 6/29 breakpoint), used to check skin tones.
function referenceLab([R, G, B]) {
  const lin = [R, G, B].map((v) => {
    const c = v / 255;
    return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
  });
  const M = [
    [0.4124, 0.3576, 0.1805],
    [0.2126, 0.7152, 0.0722],
    [0.0193, 0.1192, 0.9505],
  ];
  const xyz = M.map((row) => row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]);
  const white = [0.95047, 1, 1.08883];
  const delta = 6 / 29;
  const f = (t) => (t > delta ** 3 ? Math.cbrt(t) : t / (3 * delta * delta) + 4 / 29);
  const [fx, fy, fz] = xyz.map((v, i) => f(v / white[i]));
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// Sharma, Wu, Dalal (2005), "The CIEDE2000 color-difference formula: implementation
// notes, supplementary test data, and mathematical observations", Table 1.
const SHARMA = [
  [[50.0, 2.6772, -79.7751], [50.0, 0.0, -82.7485], 2.0425],
  [[50.0, 3.1571, -77.2803], [50.0, 0.0, -82.7485], 2.8615],
  [[50.0, 2.8361, -74.02], [50.0, 0.0, -82.7485], 3.4412],
  [[50.0, -1.3802, -84.2814], [50.0, 0.0, -82.7485], 1.0],
  [[50.0, -1.1848, -84.8006], [50.0, 0.0, -82.7485], 1.0],
  [[50.0, -0.9009, -85.5211], [50.0, 0.0, -82.7485], 1.0],
  [[50.0, 0.0, 0.0], [50.0, -1.0, 2.0], 2.3669],
  [[50.0, -1.0, 2.0], [50.0, 0.0, 0.0], 2.3669],
  [[50.0, 2.49, -0.001], [50.0, -2.49, 0.0009], 7.1792],
  [[50.0, 2.49, -0.001], [50.0, -2.49, 0.001], 7.1792],
  [[50.0, 2.49, -0.001], [50.0, -2.49, 0.0011], 7.2195],
  [[50.0, 2.49, -0.001], [50.0, -2.49, 0.0012], 7.2195],
  [[50.0, -0.001, 2.49], [50.0, 0.0009, -2.49], 4.8045],
  [[50.0, -0.001, 2.49], [50.0, 0.001, -2.49], 4.8045],
  [[50.0, -0.001, 2.49], [50.0, 0.0011, -2.49], 4.7461],
  [[50.0, 2.5, 0.0], [50.0, 0.0, -2.5], 4.3065],
  [[50.0, 2.5, 0.0], [73.0, 25.0, -18.0], 27.1492],
  [[50.0, 2.5, 0.0], [61.0, -5.0, 29.0], 22.8977],
  [[50.0, 2.5, 0.0], [56.0, -27.0, -3.0], 31.903],
  [[50.0, 2.5, 0.0], [58.0, 24.0, 15.0], 19.4535],
  [[50.0, 2.5, 0.0], [50.0, 3.1736, 0.5854], 1.0],
  [[50.0, 2.5, 0.0], [50.0, 3.2972, 0.0], 1.0],
  [[50.0, 2.5, 0.0], [50.0, 1.8634, 0.5757], 1.0],
  [[50.0, 2.5, 0.0], [50.0, 3.2592, 0.335], 1.0],
  [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.263],
  [[61.2901, 3.7196, -5.3901], [61.4292, 2.248, -4.962], 1.8731],
  [[35.0831, -44.1164, 3.7933], [35.0232, -40.0716, 1.5901], 1.8645],
  [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
  [[36.4612, 47.858, 18.3852], [36.2715, 50.5065, 21.2231], 1.4146],
  [[90.8027, -2.0831, 1.441], [91.1528, -1.6435, 0.0447], 1.4441],
  [[90.9257, -0.5406, -0.9208], [88.6381, -0.8985, -0.7239], 1.5381],
  [[6.7747, -0.2908, -2.4247], [5.8714, -0.0985, -2.2286], 0.6377],
  [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
];

describe('sRGB -> CIELAB', () => {
  it.each(REFERENCE)('%j is within 0.5 of the published Lab', (rgb, lab) => {
    const got = rgbToLab(rgb);
    for (let k = 0; k < 3; k++) expect(Math.abs(got[k] - lab[k])).toBeLessThan(0.5);
  });

  it('matches an independent implementation on skin tones', () => {
    const skins = [
      [255, 224, 189],
      [234, 192, 134],
      [198, 134, 66],
      [141, 85, 36],
      [90, 56, 37],
      [61, 44, 35],
    ];
    for (const rgb of skins) {
      const got = rgbToLab(rgb);
      const ref = referenceLab(rgb);
      for (let k = 0; k < 3; k++) expect(Math.abs(got[k] - ref[k])).toBeLessThan(0.5);
    }
  });

  it('gives neutral a* and b* for equal linear RGB', () => {
    for (const v of [0.05, 0.2, 0.5, 0.9]) {
      const [, a, b] = linearRgbToLab([v, v, v]);
      expect(Math.abs(a)).toBeLessThan(1e-3);
      expect(Math.abs(b)).toBeLessThan(1e-3);
    }
  });

  it('round-trips the Monk Skin Tone swatches', () => {
    for (const hex of MST_SWATCHES) {
      const lab = hexToLab(hex);
      const rgb = labToRgb(lab);
      const n = parseInt(hex.slice(1), 16);
      expect(rgb).toEqual([(n >> 16) & 255, (n >> 8) & 255, n & 255]);
    }
  });

  it('linearises with the sRGB transfer function', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(255)).toBeCloseTo(1, 10);
    expect(srgbToLinear(10)).toBeCloseTo(10 / 255 / 12.92, 10);
  });

  it('reports chroma and hue angle', () => {
    const [, C, h] = labToLch([50, 0, 10]);
    expect(C).toBeCloseTo(10, 10);
    expect(h).toBeCloseTo(90, 10);
    expect(labToLch([50, 1, -1])[2]).toBeCloseTo(315, 10);
  });

  it('takes the median of even and odd lists', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(Number.isNaN(median([]))).toBe(true);
  });
});

describe('CIEDE2000 (Sharma 2005 test data)', () => {
  it.each(SHARMA.map((row, i) => [i + 1, ...row]))('pair %i', (_n, lab1, lab2, expected) => {
    expect(deltaE2000(lab1, lab2)).toBeCloseTo(expected, 4);
    expect(deltaE2000(lab2, lab1)).toBeCloseTo(expected, 4);
  });

  it('is zero for identical colours', () => {
    expect(deltaE2000([42, 10, -5], [42, 10, -5])).toBe(0);
  });
});
