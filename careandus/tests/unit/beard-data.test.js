// Beard on the Care & Us data layer: what the beard screens store (the look, the Cut Card
// summary, the style catalog docs) stays short labels and numbers, never a photo.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/firebase.js', () => ({ db: {}, auth: { currentUser: null }, demoMode: false, usingEmulators: true, projectId: 'demo-careandus', getAppCheckToken: async () => null }));

const { compactBeardCutCard, mergeBeardStyles, beardStyleData, sortBeardStyles, sanitizeBeardParams } = await import('../../src/services/sections/beard.js');
const { beardProducts, addOnCount } = await import('../../src/screens/beard/state/data.js');
const { buildCutCard } = await import('../../src/screens/beard/lib/cutcard.js');
const { getStyle, paramsFromStyle } = await import('../../src/ai/beard/lib/look.js');
const { sessionPath } = await import('../../src/screens/beard/state/SessionContext.jsx');
const { ENTRY, HOME_ENTRY, OWNER_TABS } = await import('../../src/screens/beard/routes.jsx');
const STYLES = (await import('../../src/data/beard/styles.json')).default;

describe('beard look params', () => {
  it('every catalog look keeps its shape through sanitizeBeardParams', () => {
    for (const style of STYLES) {
      const p = paramsFromStyle(style);
      const clean = sanitizeBeardParams(p);
      expect(clean.styleId).toBe(style.id);
      expect(Object.keys(clean.zones).length).toBe(10);
      expect(clean.lines.cheek).toBe(p.lines.cheek);
      expect(JSON.stringify(clean)).not.toMatch(/data:|blob:|base64/);
    }
  });
});

describe('Cut Card summary', () => {
  it('compacts the full card to zones, guards, lines and notes the rules accept', () => {
    const style = getStyle('goatee');
    const card = buildCutCard({ params: paramsFromStyle(style), profile: null, style, now: new Date('2026-10-28T08:00:00Z') });
    const c = compactBeardCutCard(card);
    expect(Object.keys(c).sort()).toEqual(['cheekLineMm', 'guards', 'necklineMm', 'notes', 'safetyFlags', 'zonesMm']);
    expect(Object.keys(c.zonesMm).length).toBeLessThanOrEqual(10);
    expect(Object.keys(c.guards).length).toBeLessThanOrEqual(10);
    for (const v of Object.values(c.zonesMm)) expect(v >= 0 && v <= 300).toBe(true);
    for (const v of Object.values(c.guards)) expect(String(v).length).toBeLessThanOrEqual(20);
    const joined = [...Object.values(c.zonesMm), ...Object.values(c.guards), ...Object.values(c.notes), c.cheekLineMm, c.necklineMm].join(',');
    expect(joined.length).toBeLessThanOrEqual(2600);
  });

  it('returns null for no card', () => {
    expect(compactBeardCutCard(null)).toBe(null);
  });
});

describe('beard style catalog', () => {
  it('merges the salon docs over the seed (owner edits win, signature styles added)', () => {
    const merged = mergeBeardStyles(STYLES, [
      { id: 'goatee', hidden: true, localFit: 1, _pending: true },
      { id: 'sig-goatee-abc123', name: { en: 'House goatee', ar: 'سكسوكة البيت' }, signature: true, baseId: 'goatee', order: 9999, hidden: false },
    ]);
    const goatee = merged.find((s) => s.id === 'goatee');
    expect(goatee.hidden).toBe(true);
    expect(goatee.localFit).toBe(1);
    expect(goatee._pending).toBeUndefined();
    expect(goatee.zones).toEqual(getStyle('goatee').zones);
    expect(merged.some((s) => s.id === 'sig-goatee-abc123')).toBe(true);
    expect(merged.length).toBe(STYLES.length + 1);
  });

  it('style docs carry the owner fields within bounds and drop unknown keys', () => {
    const d = beardStyleData({ ...getStyle('goatee'), hidden: 'yes', localFit: 9, thumb: 'data:image/png;base64,AAAA', order: 1e9 });
    expect(d.hidden).toBe(false);
    expect(d.localFit).toBe(5);
    expect(d.order).toBe(100000);
    expect(d.thumb).toBeUndefined();
    expect(d.name.en).toBeTruthy();
  });

  it('sorts by order, then id', () => {
    expect(sortBeardStyles([{ id: 'b', order: 2 }, { id: 'a', order: 2 }, { id: 'c', order: 1 }]).map((s) => s.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('beard prices', () => {
  const products = [
    { id: 'p1', name: 'Beard trim', section: 'beard', category: 'service', priceOmr: 3, active: true },
    { id: 'p2', name: 'Beard oil', section: 'beard', category: 'retail', priceOmr: 4.5, active: true },
    { id: 'p3', name: 'Blow dry', section: 'hair', category: 'service', priceOmr: 8, active: true },
    { id: 'p4', name: 'Old', section: 'beard', category: 'service', priceOmr: 1, active: false },
    { id: 'p5', name: 'Untagged', category: 'service', priceOmr: 2, active: true },
  ];
  it('shows only active beard products when the salon tagged any', () => {
    expect(beardProducts(products).map((p) => p.id)).toEqual(['p1', 'p2']);
  });
  it('falls back to untagged products, never another service', () => {
    expect(beardProducts(products.filter((p) => p.section !== 'beard')).map((p) => p.id)).toEqual(['p5']);
  });
  it('counts add-ons like the hair Agreement (treatments and retail)', () => {
    expect(addOnCount(['p1', 'p2'], products)).toBe(1);
  });
});

describe('beard routes contract', () => {
  it('chair and home paths', () => {
    expect(ENTRY).toBe('/beard/capture');
    expect(HOME_ENTRY('abc')).toBe('/t/abc/beard');
    expect(sessionPath('chair', 'abc', 'studio')).toBe('/beard/studio');
    expect(sessionPath('home', 'abc', 'code')).toBe('/t/abc/beard/code');
    expect(OWNER_TABS.every((t) => t.to.startsWith('/owner/') && t.labelKey.startsWith('beard.'))).toBe(true);
  });
});
