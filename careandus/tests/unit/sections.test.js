// Care & Us: the three services share one data layer. These tests pin what each
// service may store (labels, colours and numbers only, never a photo) and that the
// nails and beard AI facades resolve inside the merged app.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/firebase.js', () => ({ db: {}, auth: { currentUser: null }, demoMode: false, usingEmulators: true, projectId: 'demo-careandus', getAppCheckToken: async () => null }));

const { sanitizeNailDesign } = await import('../../src/services/sections/nails.js');
const { sanitizeBeardParams, sanitizeCutCard } = await import('../../src/services/sections/beard.js');
const { sanitizeSectionParams } = await import('../../src/services/consultations.js');
const { cleanSections, sectionsOn } = await import('../../src/services/salons.js');
const { cleanSectionList } = await import('../../src/services/staff.js');
const { SECTIONS, FIELDS } = await import('../../src/services/schema.js');

const design = {
  base: { polishId: 'pol-1', hex: '#B5121B', hex2: null, finish: 'gloss', name: 'Classic Red', brand: 'Some Brand', code: 'R01' },
  perFinger: { ring: { polishId: 'pol-2', hex: '#F2D7D9', finish: 'shimmer' }, toe: { hex: '#000000', finish: 'gloss' } },
  shape: 'almond',
  length: 9,
  art: 'none',
  artHex: '#FBFBFA',
  type: 'gel',
  thumb: 'data:image/jpeg;base64,AAAA',
};

describe('services list', () => {
  it('has hair, nails and beard in a fixed order', () => {
    expect(SECTIONS).toEqual(['hair', 'nails', 'beard']);
    expect(sectionsOn({ beard: true, hair: true })).toEqual(['hair', 'beard']);
  });
  it('a salon needs at least one service; unknown keys are dropped', () => {
    expect(cleanSections({ nails: true, spa: true })).toEqual({ hair: false, nails: true, beard: false });
    expect(() => cleanSections({ hair: false, nails: false, beard: false })).toThrow('no-section');
  });
  it('staff and invites carry a non-empty list of known services', () => {
    expect(cleanSectionList(['beard', 'spa', 'hair'])).toEqual(['hair', 'beard']);
    expect(() => cleanSectionList([])).toThrow('no-section');
  });
});

describe('nails design', () => {
  it('keeps colours, polish ids, shape and art; drops names, brands, unknown fingers and images', () => {
    const d = sanitizeNailDesign(design);
    expect(Object.keys(d).sort()).toEqual([...FIELDS.nailDesign].sort());
    expect(d.base).toEqual({ polishId: 'pol-1', hex: '#B5121B', hex2: null, finish: 'gloss' });
    expect(Object.keys(d.perFinger)).toEqual(['ring']);
    expect(d.length).toBe(3);
    expect(JSON.stringify(d)).not.toContain('base64');
    expect(JSON.stringify(d)).not.toContain('Some Brand');
  });
  it('refuses a design without a valid base colour', () => {
    expect(() => sanitizeNailDesign({ base: { hex: 'red' } })).toThrow('nail-design-base');
  });
});

describe('beard design', () => {
  it('clamps zones to 0-300 mm and keeps only known line and shape keys', () => {
    const p = sanitizeBeardParams({
      styleId: 'boxed-short',
      zones: { M: 400, C: -5, J_L: 12, X: 4 },
      lines: { cheek: 'natural', cheekOffset: 3, extra: 'no' },
      shape: { chin: 'square', fadeB: [3, 900, 1], photo: 'x' },
      photo: 'data:image/png;base64,AAAA',
    });
    expect(p.zones).toEqual({ M: 300, C: 0, J_L: 12 });
    expect(p.lines).toEqual({ cheek: 'natural', cheekOffset: 1 });
    expect(p.shape).toEqual({ chin: 'square', fadeB: [3, 300] });
    expect(JSON.stringify(p)).not.toContain('base64');
  });
  it('keeps the Cut Card short', () => {
    const c = sanitizeCutCard({ zonesMm: { M: 8 }, guards: { M: '#2' }, cheekLineMm: 4, necklineMm: 25, notes: { M: 'x'.repeat(500) }, safetyFlags: Array(30).fill('flag') });
    expect(c.notes.M.length).toBe(200);
    expect(c.safetyFlags.length).toBe(20);
  });
});

describe('one params entry point', () => {
  it('routes each service to its own sanitizer', () => {
    expect(sanitizeSectionParams('nails', design).shape).toBe('almond');
    expect(sanitizeSectionParams('beard', { zones: { M: 8 } }).zones).toEqual({ M: 8 });
    expect(sanitizeSectionParams('hair', { cutId: 'bob', junk: 1 })).not.toHaveProperty('junk');
  });
});

describe('AI facades resolve in the merged app', () => {
  it('nails facade', async () => {
    const nails = await import('../../src/ai/nails/index.js');
    expect(typeof nails.TryOnEngine).toBe('function');
    expect(typeof nails.recommendShades).toBe('function');
  });
  it('beard facade', async () => {
    const beard = await import('../../src/ai/beard/index.js');
    expect(Object.keys(beard).length).toBeGreaterThan(10);
  });
});

describe('nail keys match the Nail Mirror catalog', () => {
  it('finishes, shapes and product types are exactly the taxonomy keys', async () => {
    const tax = await import('../../src/data/nails/taxonomy.js');
    const schema = await import('../../src/services/schema.js');
    expect(schema.NAIL_FINISHES).toEqual(tax.FINISHES.map((f) => f.key));
    expect(schema.NAIL_SHAPES).toEqual(tax.SHAPES.map((s) => s.key));
    expect(schema.NAIL_TYPES).toEqual(tax.PRODUCT_TYPES.map((t) => t.key));
  });
});
