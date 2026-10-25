import { describe, it, expect } from 'vitest';
import COLORS from '../../src/data/colors.json';
import STYLES from '../../src/data/styles.json';
import { paramsFromStyle } from '../../src/lib/look.js';
import {
  generateBeardTextures,
  getBeardTextures,
  clearTextureCache,
  normalizeLook,
  faceFields,
  hasBeard,
  textureKey,
  OCC_RANGE,
} from '../../src/ai/render/beardTextures.js';
import { T } from '../../src/ai/render/layout.js';
import { createField, fillPolygon } from '../../src/ai/render/raster.js';
import { ZONE_POLYGONS, ZONE_IDS } from '../../src/ai/mesh/zones.js';
import { hash32 } from '../../src/ai/render/util.js';
import { srgbToLinear, linearRgbToLab, hexToLab, deltaE2000, median } from '../../src/ai/analysis/color.js';

const style = (id) => paramsFromStyle(STYLES.find((s) => s.id === id));
const allZones = (mm) => Object.fromEntries(ZONE_IDS.map((z) => [z, mm]));
const look = (zones, extra = {}) => ({
  zones,
  lines: { cheek: 'natural', cheekOffset: 0, neckline: '2f', necklineOffset: 0, sideburn: 'blended', edge: 'soft', mustacheEdge: 'at' },
  shape: { chin: 'natural' },
  colorId: 'natural',
  finish: 'matte',
  ...extra,
});

/** Mean alpha (0..1) of a face texture inside a zone polygon. */
function zoneAlpha(tex, zoneId) {
  const { width: S, color } = tex.face;
  const mask = createField(S, S);
  fillPolygon(
    mask,
    ZONE_POLYGONS[zoneId].map((i) => T(i).map((v) => v * S)),
    1,
  );
  let a = 0;
  let w = 0;
  for (let i = 0; i < S * S; i++) {
    if (mask.data[i] < 0.99) continue;
    a += color[4 * i + 3] / 255;
    w += 1;
  }
  return a / w;
}

const alphaAtLandmark = (tex, i) => {
  const S = tex.face.width;
  const [x, y] = T(i).map((v) => Math.min(S - 1, Math.floor(v * S)));
  return tex.face.color[4 * (y * S + x) + 3];
};

const digest = (arr) => hash32(Array.from(arr.subarray(0, 200000), (v) => String.fromCharCode(v)).join(''));

describe('generateBeardTextures', () => {
  it('draws the same beard for the same look (seeded)', () => {
    const p = style('short-boxed');
    const a = generateBeardTextures(p, null, { size: 256 });
    const b = generateBeardTextures(p, null, { size: 256 });
    expect(digest(a.face.color)).toBe(digest(b.face.color));
    expect(digest(a.face.light)).toBe(digest(b.face.light));
    const c = generateBeardTextures(p, null, { size: 256, seed: 12345 });
    expect(digest(c.face.color)).not.toBe(digest(a.face.color));
  });

  it('a clean shave draws nothing and has no shell', () => {
    const t = generateBeardTextures(style('clean-shave'), null, { size: 256 });
    expect(t.empty).toBe(true);
    expect(t.shell).toBeNull();
    expect(Array.from(t.face.color).every((v) => v === 0)).toBe(true);
    expect(hasBeard(style('clean-shave'))).toBe(false);
    expect(hasBeard(style('goatee'))).toBe(true);
  });

  it('never puts hair on the lips, the nose or the eyes', () => {
    const t = generateBeardTextures(style('full-medium'), null, { size: 512 });
    for (const i of [12, 13, 14, 15, 4, 1, 5, 159, 386, 168]) expect(alphaAtLandmark(t, i), `landmark ${i}`).toBe(0);
  });

  it("puts each side's hair on the customer's own side (_L has u > 0.5)", () => {
    const t = generateBeardTextures(look({ ...allZones(0), K_L: 12 }), null, { size: 256 });
    expect(zoneAlpha(t, 'K_L')).toBeGreaterThan(0.6);
    expect(zoneAlpha(t, 'K_R')).toBeLessThan(0.02);
  });

  it('a goatee stays on the chin', () => {
    const t = generateBeardTextures(style('goatee'), null, { size: 256 });
    expect(zoneAlpha(t, 'C')).toBeGreaterThan(0.45);
    for (const z of ['K_L', 'K_R', 'B_L', 'B_R', 'M']) expect(zoneAlpha(t, z), z).toBeLessThan(0.05);
  });

  it('stubble shows skin through it; a full beard covers it', () => {
    const stubble = generateBeardTextures(look(allZones(3)), null, { size: 512 });
    const full = generateBeardTextures(look(allZones(30)), null, { size: 512 });
    const s = zoneAlpha(stubble, 'K_L');
    expect(s).toBeGreaterThan(0.3);
    expect(s).toBeLessThan(0.9);
    expect(zoneAlpha(full, 'K_L')).toBeGreaterThan(0.9);
    expect(zoneAlpha(full, 'C')).toBeGreaterThan(0.95);
  });

  it('long beards hang below the jaw in the shell; short ones barely pass it', () => {
    const long = generateBeardTextures(style('full-long'), null, { size: 256 });
    const short = generateBeardTextures(style('short-boxed'), null, { size: 256 });
    const maxOf = (arr) => arr.reduce((m, v) => Math.max(m, v), 0);
    expect(long.shell).not.toBeNull();
    expect(long.shell.lengthMm).toBeGreaterThan(45);
    expect(maxOf(long.shell.hangMm)).toBeGreaterThan(35);
    expect(maxOf(short.shell.hangMm)).toBeLessThan(14);
  });

  it('razor lines are sharper than crisp, crisp sharper than soft', () => {
    const width = (edge) => {
      const P = normalizeLook(look({ ...allZones(10), N: 0 }, { lines: { cheek: 'straight', edge } }));
      const f = faceFields(P, 256, Object.fromEntries(ZONE_IDS.map((z) => [z, 1])));
      return f.clip.data.filter((v) => v > 0.05 && v < 0.95).length;
    };
    const razor = width('razor');
    const crisp = width('crisp');
    const soft = width('soft');
    expect(razor).toBeLessThan(crisp);
    expect(crisp).toBeLessThan(soft);
  });

  it('a weak zone in the patch map draws thinner hair', () => {
    const zones = Object.fromEntries(ZONE_IDS.map((z) => [z, { density: 85, lengthMm: 0, confidence: 1 }]));
    zones.K_L = { density: 15, lengthMm: 0, confidence: 1 };
    const t = generateBeardTextures(look(allZones(8)), { beard: { zones, greyRatio: 0 } }, { size: 256 });
    expect(zoneAlpha(t, 'K_L')).toBeLessThan(zoneAlpha(t, 'K_R') - 0.2);
  });
});

describe('texture cache', () => {
  it('regenerates only when the params change', () => {
    clearTextureCache();
    const p = style('designer-stubble');
    const a = getBeardTextures(p, null, { size: 256 });
    const b = getBeardTextures(JSON.parse(JSON.stringify(p)), null, { size: 256 });
    expect(b).toBe(a);
    const c = getBeardTextures({ ...p, zones: { ...p.zones, C: 6 } }, null, { size: 256 });
    expect(c).not.toBe(a);
    expect(textureKey(p, null, { size: 256 })).not.toBe(textureKey({ ...p, colorId: 'henna' }, null, { size: 256 }));
  });
});

describe('colour accuracy (PRD 7.6)', () => {
  // The rendered mid-tone (strand colour x occlusion, frontal light) measured in
  // calibrated space (camera value x white-card gains) against the swatch.
  function renderedMidTone(colorId, gains) {
    const greyOnly = ['henna', 'henna-katam', 'silver'].includes(colorId);
    const profile = {
      beard: { zones: {}, greyRatio: greyOnly ? 100 : 0, colorLab: [18, 2, 3] },
      calibration: { gains: gains || null },
    };
    const tex = generateBeardTextures(look(allZones(20), { colorId }), profile, { size: 256 });
    const { color, light } = tex.face;
    const g = gains || [1, 1, 1];
    const L = [];
    const A = [];
    const B = [];
    for (let i = 0; i < color.length / 4; i++) {
      if (color[4 * i + 3] < 242) continue;
      const occ = (light[4 * i] / 255) * OCC_RANGE;
      const lab = linearRgbToLab([0, 1, 2].map((k) => srgbToLinear(color[4 * i + k]) * occ * g[k]));
      L.push(lab[0]);
      A.push(lab[1]);
      B.push(lab[2]);
    }
    expect(L.length).toBeGreaterThan(2000);
    return [median(L), median(A), median(B)];
  }

  const swatches = COLORS.filter((c) => c.hex);

  it('the catalog has dye swatches to test', () => {
    expect(swatches.length).toBeGreaterThanOrEqual(8);
  });

  for (const c of swatches) {
    it(`${c.id}: deltaE2000 <= 5 with the white card, <= 8 without`, () => {
      const swatch = hexToLab(c.hex);
      const withCard = renderedMidTone(c.id, [1.12, 1, 0.86]);
      const without = renderedMidTone(c.id, null);
      expect(deltaE2000(withCard, swatch)).toBeLessThanOrEqual(5);
      expect(deltaE2000(without, swatch)).toBeLessThanOrEqual(8);
    });
  }
});
