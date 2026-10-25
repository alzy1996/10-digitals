// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  whiteCardFromImageData,
  grayWorldGains,
  applyGains,
  neutralGains,
  GRAY_WORLD_CAP,
} from '../../src/ai/capture/whiteCard.js';
import { linearRgbToLab, linearToSrgb, rgbToLab } from '../../src/ai/analysis/color.js';
import { SRGB_TO_LINEAR } from '../../src/ai/analysis/pixels.js';
import { CLASSES } from '../../src/ai/models/classes.js';

const W = 320;
const H = 240;

function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

const srgb = (lin) => lin.map((c) => Math.round(Math.min(255, Math.max(0, linearToSrgb(c)))));

/** Skin-and-wall scene with a warm-lit paper card at (cx, cy) of size cw x ch. */
function scene({ cardLinear = [0.78, 0.66, 0.44], card = { x: 200, y: 60, w: 80, h: 60 }, seed = 9 } = {}) {
  const rand = rng(seed);
  const data = new Uint8ClampedArray(W * H * 4);
  const skin = srgb([0.5, 0.3, 0.2]);
  const wall = srgb([0.3, 0.2, 0.25]);
  const paper = srgb(cardLinear);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const inCard = card && x >= card.x && x < card.x + card.w && y >= card.y && y < card.y + card.h;
      const base = inCard ? paper : x < 160 ? skin : wall;
      const n = Math.round((rand() - 0.5) * 2);
      data[o] = base[0] + n;
      data[o + 1] = base[1] + n;
      data[o + 2] = base[2] + n;
      data[o + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}

describe('white card (PRD 5.2 pro accuracy)', () => {
  it('region-grows the card from the tap and neutralises it', () => {
    const cardLinear = [0.78, 0.66, 0.44];
    const res = whiteCardFromImageData(scene({ cardLinear }), 240, 90);
    expect(res).not.toBeNull();
    expect(res.rect).toEqual({ x: 200, y: 60, w: 80, h: 60 });
    expect(res.gains[1]).toBe(1);
    const corrected = cardLinear.map((c, k) => c * res.gains[k]);
    const [, a, b] = linearRgbToLab(corrected);
    expect(Math.abs(a)).toBeLessThan(1);
    expect(Math.abs(b)).toBeLessThan(1);
  });

  it('works with cool light too', () => {
    const cardLinear = [0.55, 0.66, 0.8];
    const res = whiteCardFromImageData(scene({ cardLinear }), 230, 80);
    const [, a, b] = linearRgbToLab(cardLinear.map((c, k) => c * res.gains[k]));
    expect(Math.abs(a)).toBeLessThan(1);
    expect(Math.abs(b)).toBeLessThan(1);
  });

  it('refuses a tap on skin', () => {
    expect(whiteCardFromImageData(scene(), 60, 120)).toBeNull();
  });

  it('refuses a card that is too small', () => {
    expect(whiteCardFromImageData(scene({ card: { x: 220, y: 100, w: 6, h: 6 } }), 223, 103)).toBeNull();
  });

  it('refuses a blown-out (clipped) card', () => {
    expect(whiteCardFromImageData(scene({ cardLinear: [1.4, 1.4, 1.4] }), 240, 90)).toBeNull();
  });

  it('refuses a bright patch inside the face (teeth, eye whites)', () => {
    const face = [
      [180, 40],
      [300, 40],
      [300, 140],
      [180, 140],
    ];
    expect(whiteCardFromImageData(scene(), 240, 90, { exclude: face })).toBeNull();
    // A card that mostly overlaps the face is refused too, even when tapped outside it.
    const overlap = [
      [190, 50],
      [279, 50],
      [279, 130],
      [190, 130],
    ];
    expect(whiteCardFromImageData(scene(), 205, 65, { exclude: overlap.map(([x, y]) => [x + 10, y + 5]) })).toBeNull();
    expect(whiteCardFromImageData(scene(), 240, 90, { exclude: [[0, 0], [100, 0], [100, 100], [0, 100]] })).not.toBeNull();
  });

  it('refuses a coloured object that would need extreme gains', () => {
    // Chroma is within the card limit, but the blue gain would be 1.94.
    expect(whiteCardFromImageData(scene({ cardLinear: [0.75, 0.62, 0.32] }), 240, 90)).toBeNull();
    expect(whiteCardFromImageData(scene({ cardLinear: [0.75, 0.62, 0.4] }), 240, 90)).not.toBeNull();
  });

  it('refuses taps outside the image', () => {
    expect(whiteCardFromImageData(scene(), -5, 10)).toBeNull();
    expect(whiteCardFromImageData(scene(), 10, H + 3)).toBeNull();
  });
});

describe('gray world and gains', () => {
  function uniform(lin) {
    const c = srgb(lin);
    const data = new Uint8ClampedArray(64 * 64 * 4);
    for (let p = 0; p < 64 * 64; p++) data.set([c[0], c[1], c[2], 255], p * 4);
    return { data, width: 64, height: 64 };
  }

  it('leaves a neutral background alone', () => {
    const g = grayWorldGains(uniform([0.4, 0.4, 0.4]), null);
    for (const v of g) expect(v).toBeCloseTo(1, 2);
  });

  it('caps the gains at +/-15 %', () => {
    const g = grayWorldGains(uniform([0.6, 0.3, 0.2]), null);
    expect(g[0]).toBeCloseTo(1 - GRAY_WORLD_CAP, 6);
    expect(g[1]).toBe(1);
    expect(g[2]).toBeCloseTo(1 + GRAY_WORLD_CAP, 6);
  });

  it('only looks at background-class pixels', () => {
    const img = uniform([0.4, 0.36, 0.44]);
    const cats = new Uint8Array(64 * 64).fill(CLASSES.FACE_SKIN);
    expect(grayWorldGains(img, cats)).toEqual([1, 1, 1]);
    cats.fill(CLASSES.BACKGROUND, 0, 2048);
    const g = grayWorldGains(img, cats);
    expect(g[0]).toBeCloseTo(0.9, 2);
    // 0.36 / 0.44 = 0.818 is below the cap.
    expect(g[2]).toBeCloseTo(1 - GRAY_WORLD_CAP, 6);
  });

  it('applies gains in linear RGB', () => {
    const img = uniform([0.5, 0.4, 0.3]);
    const same = applyGains(img, [1, 1, 1]);
    expect(Array.from(same.data.slice(0, 4))).toEqual(Array.from(img.data.slice(0, 4)));
    const g = neutralGains([SRGB_TO_LINEAR[img.data[0]], SRGB_TO_LINEAR[img.data[1]], SRGB_TO_LINEAR[img.data[2]]]);
    const out = applyGains(img, g);
    const [, a, b] = rgbToLab([out.data[0], out.data[1], out.data[2]]);
    expect(Math.abs(a)).toBeLessThan(1.5);
    expect(Math.abs(b)).toBeLessThan(1.5);
  });

  it('keeps green as the reference channel', () => {
    expect(neutralGains([0.5, 0.4, 0.2])).toEqual([0.8, 1, 2]);
    expect(neutralGains([0, 0.4, 0.2])).toEqual([1, 1, 1]);
  });
});
