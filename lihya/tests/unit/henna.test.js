import { describe, it, expect } from 'vitest';
import COLORS from '../../src/data/colors.json';
import {
  colorForTreatment,
  strandColor,
  paletteMeanLab,
  hennaDepth,
  naturalLab,
  GREY_HAIR_LAB,
  DEFAULT_NATURAL_LAB,
  STRAND_L_VARIATION,
  STRAND_L_MIN_SWING,
} from '../../src/ai/render/henna.js';
import { hexToLab, labToLinearRgb, linearRgbToLab, deltaE2000 } from '../../src/ai/analysis/color.js';

const profile = (greyRatio, colorLab = [20, 2, 4]) => ({ beard: { zones: {}, greyRatio, colorLab } });
const sum = (pal) => pal.reduce((s, e) => s + e.weight, 0);
const byId = (id) => COLORS.find((c) => c.id === id);

describe('colorForTreatment', () => {
  it('natural keeps the measured grey ratio (each strand grey with that probability)', () => {
    const t = colorForTreatment('natural', { profile: profile(40) });
    expect(sum(t.palette)).toBeCloseTo(1, 6);
    expect(t.greyAfter).toBeCloseTo(0.4, 6);
    expect(t.palette.find((e) => e.grey).lab).toEqual([...GREY_HAIR_LAB]);
    expect(t.swatchLab).toBeNull();
  });

  it('salt and pepper simulates the grey ratio as it is', () => {
    expect(colorForTreatment('salt-pepper', { profile: profile(65) }).greyAfter).toBeCloseTo(0.65, 6);
  });

  it('grey blending keeps 25, 50 or 75 % of the grey', () => {
    for (const keep of [25, 50, 75]) {
      const t = colorForTreatment('grey-blend', { profile: profile(60), greyTarget: keep });
      expect(t.greyAfter).toBeCloseTo(0.6 * (keep / 100), 6);
      expect(sum(t.palette)).toBeCloseTo(1, 6);
    }
    // Default from the catalog (50 %).
    expect(colorForTreatment('grey-blend', { profile: profile(60) }).greyAfter).toBeCloseTo(0.3, 6);
  });

  it('henna is strongest on grey strands and only warms the dark ones', () => {
    const t = colorForTreatment('henna', { profile: profile(50) });
    const swatch = hexToLab(byId('henna').hex);
    const onGrey = t.palette[0];
    const onDark = t.palette[1];
    expect(deltaE2000(onGrey.lab, swatch)).toBeLessThan(0.01);
    const nat = naturalLab(profile(50));
    expect(onDark.lab[1]).toBeGreaterThan(nat[1] + 5);
    expect(onDark.lab[2]).toBeGreaterThan(nat[2] + 4);
    expect(Math.abs(onDark.lab[0] - nat[0])).toBeLessThan(4);
    expect(t.greyAfter).toBe(0);
  });

  it('henna deepens from day 1 to day 3', () => {
    expect(hennaDepth(1)).toBe(0);
    expect(hennaDepth(2)).toBe(0.5);
    expect(hennaDepth(3)).toBe(1);
    expect(hennaDepth(7)).toBe(1);
    const d1 = colorForTreatment('henna', { profile: profile(100), day: 1 }).swatchLab;
    const d3 = colorForTreatment('henna', { profile: profile(100), day: 3 }).swatchLab;
    expect(d3[0]).toBeLessThan(d1[0]);
    expect(deltaE2000(d3, hexToLab(byId('henna').hexDay3))).toBeLessThan(0.01);
  });

  it('henna + katam is a darker brown-black layer than henna alone', () => {
    const h = paletteMeanLab(colorForTreatment('henna', { profile: profile(70) }));
    const hk = paletteMeanLab(colorForTreatment('henna-katam', { profile: profile(70) }));
    expect(hk[0]).toBeLessThan(h[0] - 10);
    expect(hk[1]).toBeLessThan(h[1]);
  });

  it('a permanent dye covers every strand with the swatch', () => {
    for (const id of ['jet-black', 'dark-brown', 'auburn', 'blonde']) {
      const t = colorForTreatment(id, { profile: profile(45) });
      expect(t.palette).toHaveLength(1);
      expect(deltaE2000(t.palette[0].lab, hexToLab(byId(id).hex))).toBeLessThan(0.01);
      expect(t.greyAfter).toBe(0);
    }
  });

  it('a toner only changes the grey strands', () => {
    const t = colorForTreatment('silver', { profile: profile(30, [22, 3, 5]) });
    const toned = t.palette.find((e) => e.grey);
    expect(toned.weight).toBeCloseTo(0.3, 6);
    expect(deltaE2000(toned.lab, hexToLab(byId('silver').hex))).toBeLessThan(0.01);
    expect(t.palette.find((e) => !e.grey).lab).toEqual([22, 3, 5]);
  });

  it('falls back to natural for an unknown id and to a soft black without a profile', () => {
    const t = colorForTreatment('no-such-color', {});
    expect(t.id).toBe('natural');
    expect(t.palette).toHaveLength(1);
    expect(t.palette[0].lab).toEqual([...DEFAULT_NATURAL_LAB]);
  });
});

describe('strandColor', () => {
  const t = colorForTreatment('medium-brown', {});
  const lab = hexToLab(byId('medium-brown').hex);

  it('keeps a luminance variation of about 6.5 % L* per strand', () => {
    const lo = linearRgbToLab(strandColor(t, 0.5, -1).lin);
    const hi = linearRgbToLab(strandColor(t, 0.5, 1).lin);
    const swing = Math.max(STRAND_L_MIN_SWING, lab[0] * STRAND_L_VARIATION);
    expect(lab[0] - lo[0]).toBeCloseTo(swing, 1);
    expect(hi[0] - lab[0]).toBeCloseTo(swing, 1);
    const mid = linearRgbToLab(strandColor(t, 0.5, 0).lin);
    expect(deltaE2000(mid, lab)).toBeLessThan(0.05);
  });

  it('divides by the white-card gains so the colour is right in calibrated space', () => {
    const gains = [1.2, 1, 0.8];
    const raw = strandColor(t, 0.5, 0).lin;
    const cam = strandColor(t, 0.5, 0, gains).lin;
    for (let i = 0; i < 3; i++) expect(cam[i] * gains[i]).toBeCloseTo(raw[i], 6);
  });

  it('picks palette entries by weight', () => {
    const grey = colorForTreatment('natural', { profile: profile(25) });
    let greyCount = 0;
    const N = 400;
    for (let i = 0; i < N; i++) if (strandColor(grey, (i + 0.5) / N, 0).grey) greyCount += 1;
    expect(greyCount / N).toBeCloseTo(0.25, 2);
  });

  it('round-trips the swatch through linear RGB', () => {
    const back = linearRgbToLab(labToLinearRgb(lab));
    expect(deltaE2000(back, lab)).toBeLessThan(0.01);
  });
});
