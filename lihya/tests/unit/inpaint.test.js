import { describe, it, expect } from 'vitest';
import STYLES from '../../src/data/styles.json';
import { paramsFromStyle } from '../../src/lib/look.js';
import { needsOutline, buildOutlineTextures, currentLook, OUTLINE_COLORS, outlineKey } from '../../src/ai/render/inpaint.js';
import { T } from '../../src/ai/render/layout.js';
import { ZONE_IDS } from '../../src/ai/mesh/zones.js';
import { hexToRgb } from '../../src/ai/analysis/color.js';

const style = (id) => paramsFromStyle(STYLES.find((s) => s.id === id));
const profileAt = (mm, overrides = {}) => ({
  beard: {
    zones: Object.fromEntries(ZONE_IDS.map((z) => [z, { density: 80, lengthMm: overrides[z] ?? mm, confidence: 0.8 }])),
    greyRatio: 0,
    colorLab: [18, 2, 3],
  },
});
const allZones = (mm) => Object.fromEntries(ZONE_IDS.map((z) => [z, mm]));
const look = (zones, lines = {}) => ({
  zones,
  lines: { cheek: 'natural', cheekOffset: 0, neckline: '1f', necklineOffset: 0, sideburn: 'blended', edge: 'soft', mustacheEdge: 'at', ...lines },
  shape: { chin: 'natural' },
});

describe('needsOutline', () => {
  it('is not needed without a measured beard (nothing to cut)', () => {
    expect(needsOutline(style('short-boxed'), null)).toEqual({ needed: false, zones: [] });
  });

  it('lists every zone that must get shorter than today, beyond a 2 mm tolerance', () => {
    const r = needsOutline(style('goatee'), profileAt(20, { C: 15, S: 10 }));
    expect(r.needed).toBe(true);
    for (const z of ['M', 'J_L', 'J_R', 'K_L', 'K_R', 'B_L', 'B_R', 'N']) expect(r.zones).toContain(z);
    expect(r.zones).not.toContain('C');
    expect(r.zones).toEqual(ZONE_IDS.filter((z) => r.zones.includes(z)));
  });

  it('allows 2 mm of difference', () => {
    expect(needsOutline(look(allZones(9)), profileAt(11)).needed).toBe(false);
    expect(needsOutline(look(allZones(8)), profileAt(10.5)).needed).toBe(true);
  });

  it('going longer never needs Outline mode', () => {
    expect(needsOutline(look(allZones(40)), profileAt(5)).needed).toBe(false);
  });

  it('a lower cheek line or a raised neckline on a grown beard needs it', () => {
    const lowered = needsOutline(look(allZones(20), { cheek: 'low' }), profileAt(20));
    expect(lowered.zones).toEqual(expect.arrayContaining(['K_L', 'K_R']));
    const neck = needsOutline(look(allZones(20), { neckline: 'jaw' }), profileAt(20));
    expect(neck.zones).toContain('N');
    expect(needsOutline(look(allZones(20)), profileAt(20)).needed).toBe(false);
  });
});

describe('buildOutlineTextures', () => {
  const keep = hexToRgb(OUTLINE_COLORS.keep);
  const cut = hexToRgb(OUTLINE_COLORS.cut);
  const line = hexToRgb(OUTLINE_COLORS.line);
  const closest = (rgb) => {
    const d = (c) => Math.hypot(rgb[0] - c[0], rgb[1] - c[1], rgb[2] - c[2]);
    const all = { keep: d(keep), cut: d(cut), line: d(line) };
    return Object.keys(all).sort((a, b) => all[a] - all[b])[0];
  };
  const counts = (tex) => {
    const c = { keep: 0, cut: 0, line: 0 };
    const { color } = tex.face;
    for (let i = 0; i < color.length; i += 4) {
      if (color[i + 3] < 30) continue;
      c[closest([color[i], color[i + 1], color[i + 2]])] += 1;
    }
    return c;
  };

  it('tints kept hair green, hair that comes off red, and draws the new edge', () => {
    const t = buildOutlineTextures(style('short-boxed'), profileAt(25), { size: 256 });
    const c = counts(t);
    expect(c.keep).toBeGreaterThan(1000);
    expect(c.cut).toBeGreaterThan(200);
    expect(c.line).toBeGreaterThan(100);
    expect(t.shell).not.toBeNull();
  });

  it('partial mode (beard view) shows only what comes off, no green', () => {
    const t = buildOutlineTextures(style('goatee'), profileAt(20), { size: 256, zones: ['K_L', 'K_R', 'J_L', 'J_R', 'M'] });
    const c = counts(t);
    expect(c.keep).toBe(0);
    expect(c.cut).toBeGreaterThan(500);
  });

  it('never draws on the lips or the nose', () => {
    const t = buildOutlineTextures(style('short-boxed'), profileAt(25), { size: 512 });
    const S = 512;
    for (const i of [13, 14, 4, 1]) {
      const [x, y] = T(i).map((v) => Math.floor(v * S));
      expect(t.face.color[4 * (y * S + x) + 3], `landmark ${i}`).toBe(0);
    }
  });

  it('the current look keeps natural lines and today\'s lengths', () => {
    const cur = currentLook(style('khatt'), profileAt(12));
    expect(cur.lines.cheek).toBe('natural');
    expect(cur.zones.C).toBe(12);
    expect(outlineKey(style('khatt'), profileAt(12))).not.toBe(outlineKey(style('khatt'), profileAt(14)));
  });
});
