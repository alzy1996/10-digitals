// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { CANONICAL_VERTICES } from '../../src/ai/mesh/tessellation.js';
import { zonePolygonsPx, pointInPolygon, ZONE_IDS } from '../../src/ai/mesh/zones.js';
import {
  zoneDensities,
  silhouetteLengths,
  growabilityOf,
  lengthFromDensity,
  hairnessAt,
  featureMaps,
  GROW_WEIGHTS,
  CONFIRM_BELOW,
} from '../../src/ai/analysis/beardDensity.js';
import { CLASSES } from '../../src/ai/models/classes.js';
import { SRGB_TO_LINEAR, linearToSrgb8 } from '../../src/ai/analysis/pixels.js';

const W = 420;
const H = 500;
const S = 18;

function frontalLandmarks() {
  const out = [];
  for (let i = 0; i < 468; i++) {
    const x = CANONICAL_VERTICES[3 * i];
    const y = CANONICAL_VERTICES[3 * i + 1];
    const z = CANONICAL_VERTICES[3 * i + 2];
    out.push({ x: (W / 2 + x * S) / W, y: (200 - y * S) / H, z: (-z * S) / W });
  }
  return out;
}

function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Skin-coloured image with fine sensor noise. */
function skinImage(seed = 3) {
  const rand = rng(seed);
  const data = new Uint8ClampedArray(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    const n = (rand() - 0.5) * 4;
    data[p * 4] = 205 + n;
    data[p * 4 + 1] = 150 + n;
    data[p * 4 + 2] = 120 + n;
    data[p * 4 + 3] = 255;
  }
  return { data, width: W, height: H };
}

function paint(img, inside, colorAt) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      const o = (y * W + x) * 4;
      const [r, g, b] = colorAt(o, x, y);
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
    }
  }
}

const landmarks = frontalLandmarks();
const P = landmarks.map((l) => [l.x * W, l.y * H]);
const polys = zonePolygonsPx(landmarks, W, H);
const inZone = (id) => (x, y) => pointInPolygon([x, y], polys[id]);

/** Dark, textured, low-saturation strands (black-brown beard). */
function darkHair(seed) {
  const rand = rng(seed);
  return () => {
    const v = rand() < 0.55 ? 22 + rand() * 20 : 60 + rand() * 35;
    return [v * 1.06, v * 0.97, v * 0.9];
  };
}

describe('beard density (PRD 5.5)', () => {
  it('reads flat skin as near zero in every zone', () => {
    const res = zoneDensities({ img: skinImage(), landmarks, P });
    for (const id of ZONE_IDS) expect(res.zones[id].density).toBeLessThanOrEqual(5);
    for (const id of ZONE_IDS) expect(res.zones[id].confidence).toBeGreaterThanOrEqual(CONFIRM_BELOW);
    expect(res.hairTotal).toBeLessThan(20);
  });

  it('reads dark noisy texture inside the chin zone as dense', () => {
    const img = skinImage();
    paint(img, inZone('C'), darkHair(11));
    const res = zoneDensities({ img, landmarks, P });
    expect(res.zones.C.density).toBeGreaterThanOrEqual(75);
    expect(res.zones.C.confidence).toBeGreaterThan(0.5);
    for (const id of ['M', 'K_L', 'K_R', 'B_L', 'B_R', 'J_L', 'J_R', 'N']) expect(res.zones[id].density).toBeLessThanOrEqual(15);
    expect(res.colorSamples.length).toBeGreaterThan(50);
  });

  it('does not read a smooth shadow as hair', () => {
    const img = skinImage();
    paint(img, inZone('C'), (o) => [0, 1, 2].map((c) => linearToSrgb8(SRGB_TO_LINEAR[img.data[o + c]] * 0.4)));
    const res = zoneDensities({ img, landmarks, P });
    expect(res.zones.C.density).toBeLessThanOrEqual(15);
  });

  it('counts grey and white hairs and reports them as grey', () => {
    const img = skinImage();
    const rand = rng(5);
    paint(img, inZone('K_L'), () => {
      const v = rand() < 0.5 ? 200 + rand() * 40 : 120 + rand() * 30;
      return [v, v, v * 0.98];
    });
    const res = zoneDensities({ img, landmarks, P });
    expect(res.zones.K_L.density).toBeGreaterThanOrEqual(40);
    expect(res.zones.K_L.grey).toBeGreaterThan(0);
    expect(res.zones.K_R.density).toBeLessThanOrEqual(5);
  });

  it('treats segmenter hair pixels as hair and ignores background pixels', () => {
    const img = skinImage();
    const categories = new Uint8Array(W * H).fill(CLASSES.FACE_SKIN);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (inZone('M')(x + 0.5, y + 0.5)) categories[y * W + x] = CLASSES.HAIR;
        if (inZone('B_L')(x + 0.5, y + 0.5)) categories[y * W + x] = CLASSES.BACKGROUND;
      }
    }
    const res = zoneDensities({ img, landmarks, P, categories });
    expect(res.zones.M.density).toBeGreaterThanOrEqual(90);
    expect(res.zones.B_L.n).toBe(0);
    const maps = featureMaps(img, [0, 0, W - 1, H - 1]);
    expect(hairnessAt(maps, 200 * W + 200, { L: 65, sat: 0.4, tex: 0.5 }, CLASSES.HAIR)).toBeGreaterThanOrEqual(0.75);
  });

  it('measures the beard silhouette beyond the chin contour', () => {
    const img = skinImage();
    const chinY = P[152][1];
    const cx = P[152][0];
    const hair = darkHair(21);
    // A 16 px thick beard below the chin, plus the chin zone itself.
    paint(img, (x, y) => inZone('C')(x, y) || (y > chinY - 2 && y <= chinY + 16 && Math.abs(x - cx) < 70), hair);
    const density = zoneDensities({ img, landmarks, P, extendDownPx: 40 });
    const out = silhouetteLengths({ density, P, categories: null, width: W, mmPerPx: 0.5, which: ['C'] });
    expect(out.C.mm).toBeGreaterThanOrEqual(6);
    expect(out.C.mm).toBeLessThanOrEqual(12);
    const clean = zoneDensities({ img: skinImage(), landmarks, P, extendDownPx: 40 });
    const none = silhouetteLengths({ density: clean, P, categories: null, width: W, mmPerPx: 0.5, which: ['C', 'J_L', 'J_R'] });
    for (const z of ['C', 'J_L', 'J_R']) expect(none[z].mm).toBeLessThanOrEqual(1.5);
  });
});

describe('grow-ability and length estimates', () => {
  it('is the weighted mean density', () => {
    const zones = Object.fromEntries(ZONE_IDS.map((z) => [z, { density: 50 }]));
    expect(growabilityOf(zones)).toBe(50);
    zones.C.density = 100;
    const expected = Math.round(50 + 50 * (GROW_WEIGHTS.C / Object.values(GROW_WEIGHTS).reduce((a, b) => a + b, 0)));
    expect(growabilityOf(zones)).toBe(expected);
    expect(growabilityOf(zones, { C: 1 })).toBe(100);
  });

  it('has weights that sum to 1', () => {
    const sum = Object.values(GROW_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('estimates stubble length from density when the length cannot be seen', () => {
    expect(lengthFromDensity(5)).toBe(0);
    expect(lengthFromDensity(60)).toBe(2);
    expect(lengthFromDensity(100)).toBe(3);
  });
});
