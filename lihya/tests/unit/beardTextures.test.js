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
  neckDepthMm,
} from '../../src/ai/render/beardTextures.js';
import { lineGuides } from '../../src/ai/render/lineGuides.js';
import { CANONICAL_VERTICES } from '../../src/ai/mesh/tessellation.js';
import {
  LINE_OFFSET_KEYS,
  fromStage,
  nearestOffset,
  rulerPath,
  rulerZones,
  ticksAlong,
  toStage,
  withLineOffset,
} from '../../src/screens/studio/lineHandles.js';
import { T } from '../../src/ai/render/layout.js';
import { createField, fillPolygon } from '../../src/ai/render/raster.js';
import { ZONE_POLYGONS, ZONE_IDS, CHIN_BOTTOM } from '../../src/ai/mesh/zones.js';
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

/* ------------------------------------------------------------------ Studio line guides */

describe('neckDepthMm', () => {
  it('is the full neckline depth at the front of the neck, raised by the offset', () => {
    expect(neckDepthMm('2f', 0, 0.5)).toBeCloseTo(20, 5);
    expect(neckDepthMm('1f', 0, 0.5)).toBeCloseTo(34, 5);
    expect(neckDepthMm('2f', 1, 0.5)).toBeCloseTo(10, 5);
    expect(neckDepthMm('2f', -1, 0.5)).toBeCloseTo(30, 5);
    // never closer to the jaw than 3 mm
    expect(neckDepthMm('jaw', 1, 0.5)).toBeCloseTo(3, 5);
  });

  it('tapers to nothing at the ears, and a squared neckline keeps more at the sides', () => {
    expect(neckDepthMm('2f', 0, 0)).toBe(0);
    expect(neckDepthMm('2f', 0, 1)).toBe(0);
    const side = 0.2;
    expect(neckDepthMm('squared', 0, side)).toBeGreaterThan(neckDepthMm('2f', 0, side));
    expect(neckDepthMm('2f', 0, side)).toBeCloseTo(neckDepthMm('2f', 0, 1 - side), 5);
  });
});

/** Canonical face seen from the front, 0..1 like MediaPipe (y down), 468 points, no iris. */
function frontLandmarks() {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < 468; i++) {
    minX = Math.min(minX, CANONICAL_VERTICES[3 * i]);
    maxX = Math.max(maxX, CANONICAL_VERTICES[3 * i]);
    minY = Math.min(minY, CANONICAL_VERTICES[3 * i + 1]);
    maxY = Math.max(maxY, CANONICAL_VERTICES[3 * i + 1]);
  }
  const span = Math.max(maxX - minX, maxY - minY);
  return Array.from({ length: 468 }, (_, i) => ({
    x: 0.2 + ((CANONICAL_VERTICES[3 * i] - minX) / span) * 0.6,
    y: 0.1 + ((maxY - CANONICAL_VERTICES[3 * i + 1]) / span) * 0.6,
    z: 0,
  }));
}

describe('lineGuides (cheek line, neckline and jaw on the photo)', () => {
  const shot = { id: 'front', width: 1000, height: 1000, landmarks: frontLandmarks() };
  const full = look({ ...allZones(8), N: 3 });
  const chin = shot.landmarks[CHIN_BOTTOM];
  const chinPx = [chin.x * 1000, chin.y * 1000];

  it('needs landmarks', () => {
    expect(lineGuides(null, full)).toBeNull();
    expect(lineGuides({ width: 10, height: 10, landmarks: [] }, full)).toBeNull();
  });

  it('puts the cheek handles on the cheeks and the neckline handle below the chin at its depth', () => {
    const g = lineGuides(shot, full);
    expect(g.mmPerPx).toBeGreaterThan(0);
    for (const side of ['L', 'R']) {
      const h = g.cheek.handles[side];
      expect(h[1]).toBeLessThan(chinPx[1]);
      expect(h[1]).toBeGreaterThan(shot.landmarks[1].y * 1000 - 100);
      expect(g.cheek.lines[side].length).toBeGreaterThan(2);
    }
    // customer's left is on the image right in a front shot
    expect(g.cheek.handles.L[0]).toBeGreaterThan(chinPx[0]);
    expect(g.cheek.handles.R[0]).toBeLessThan(chinPx[0]);
    const below = (g.neck.handle[1] - chinPx[1]) * g.mmPerPx;
    expect(below).toBeGreaterThan(15);
    expect(below).toBeLessThan(25);
    expect(g.neck.followsJaw).toBe(false);
    expect(g.jaw.pts.length).toBe(g.jaw.zones.length);
  });

  it('tracks: a higher offset is higher on the photo, and the handle sits on its own track', () => {
    const g = lineGuides(shot, full);
    const ys = g.cheek.track.map((s) => s.R[1]);
    expect(ys[0]).toBeGreaterThan(ys[ys.length - 1]);
    const ny = g.neck.track.map((s) => s.point[1]);
    for (let i = 1; i < ny.length; i++) expect(ny[i]).toBeLessThan(ny[i - 1]);
    const raised = lineGuides(shot, { ...full, lines: { ...full.lines, cheekOffset: 0.5, necklineOffset: 0.5 } });
    const sample = raised.cheek.track.find((s) => s.offset === 0.5);
    expect(raised.cheek.handles.R[0]).toBeCloseTo(sample.R[0], 6);
    expect(raised.cheek.handles.R[1]).toBeCloseTo(sample.R[1], 6);
    expect(raised.neck.handle[1]).toBeLessThan(g.neck.handle[1]);
  });

  it('marks a neckline that follows the jaw', () => {
    const g = lineGuides(shot, { ...full, lines: { ...full.lines, neckline: 'jaw' } });
    expect(g.neck.followsJaw).toBe(true);
  });
});

describe('Studio overlay geometry (handles and the ruler along the jaw)', () => {
  const crop = { x: 100, y: 200, w: 400, h: 500 };
  const box = { width: 200, height: 250 };

  it('maps shot pixels to the stage and back', () => {
    const q = toStage([300, 450], crop, box);
    expect(q).toEqual([100, 125]);
    const p = fromStage(q, crop, box);
    expect(p[0]).toBeCloseTo(300, 9);
    expect(p[1]).toBeCloseTo(450, 9);
  });

  it('picks the offset whose point is nearest the finger', () => {
    const track = [
      { offset: -1, point: [0, 100] },
      { offset: 0, point: [0, 50] },
      { offset: 1, point: [0, 0] },
    ];
    expect(nearestOffset(track, [5, 60], (s) => s.point)).toBe(0);
    expect(nearestOffset(track, [0, -40], (s) => s.point)).toBe(1);
    expect(nearestOffset([], [0, 0], (s) => s.point)).toBeNull();
  });

  it('a moved line is no longer a Gulf preset and stays in -1..1', () => {
    const p = withLineOffset({ ...look(allZones(5)), presetId: 'eid-lineup' }, LINE_OFFSET_KEYS.cheek, 3);
    expect(p.presetId).toBeNull();
    expect(p.lines.cheekOffset).toBeLessThanOrEqual(1);
    expect(withLineOffset(look(allZones(5)), LINE_OFFSET_KEYS.neck, -0.35).lines.necklineOffset).toBeCloseTo(-0.35, 9);
  });

  it('highlights the jaw zones a length slider changes', () => {
    expect(rulerZones('J')).toEqual(['J_R', 'J_L']);
    expect(rulerZones('C')).toEqual(['C']);
    expect(rulerZones('all')).toHaveLength(5);
    expect(rulerZones('M')).toEqual([]);
  });

  it('lays the ruler outside the beard hanging below the jaw', () => {
    const shot = { width: 1000, height: 1000, landmarks: frontLandmarks() };
    const zones = { ...allZones(10), N: 0 };
    const g = lineGuides(shot, look(zones));
    const path = rulerPath(g, zones, { marginMm: 4 });
    expect(path.pts.length).toBe(g.jaw.pts.length - 2);
    const chinK = g.jaw.chin - 1;
    const jawChin = g.jaw.pts[g.jaw.chin];
    const gapMm = Math.hypot(path.pts[chinK][0] - jawChin[0], path.pts[chinK][1] - jawChin[1]) * g.mmPerPx;
    // 0.95 x 10 mm of beard + 4 mm margin
    expect(gapMm).toBeGreaterThan(12);
    expect(path.pts[chinK][1]).toBeGreaterThan(jawChin[1]);
    expect(rulerPath(null, zones)).toBeNull();
  });

  it('puts ticks at a fixed spacing, pointing away from a point', () => {
    const ticks = ticksAlong(
      [
        [0, 0],
        [100, 0],
      ],
      10,
      { away: [50, -50] },
    );
    expect(ticks).toHaveLength(11);
    expect(ticks[1].p[0]).toBeCloseTo(10, 9);
    expect(ticks[0].n[1]).toBeGreaterThan(0);
    expect(ticks[0].major).toBe(true);
    expect(ticks[1].major).toBe(false);
  });
});
