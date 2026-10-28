// Nail screens' pure helpers: shade lists from the salon's polishes, sold-out substitutes,
// stored designs back to names, the polish CSV, and the routes contract.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/firebase.js', () => ({ db: {}, auth: { currentUser: null }, demoMode: false, usingEmulators: true, projectId: 'demo-careandus', getAppCheckToken: async () => null }));

const lib = await import('../../src/screens/nails/lib.js');
const { sanitizeNailDesign } = await import('../../src/services/sections/nails.js');
const { DEFAULT_DESIGN, withBase, withFinger } = await import('../../src/ai/nails/index.js');
const { LIBRARY } = await import('../../src/data/nails/library.js');

const red = { id: 'pol-red', name: 'House Red', nameAr: 'أحمر البيت', brand: 'OPI', code: 'R1', hex: '#B5121B', finish: 'creme', type: 'gel', stock: 0, priceOmr: 8.5, hidden: false };
const red2 = { id: 'pol-red2', name: 'Cherry', nameAr: 'كرزي', hex: '#A8101E', finish: 'creme', stock: 4, hidden: false };
const blue = { id: 'pol-blue', name: 'Navy', nameAr: 'كحلي', hex: '#1F2A55', finish: 'gloss', stock: 3, hidden: true };
const off = { id: 'pol-off', name: 'Old', hex: '#FFFFFF', finish: 'creme', active: false };

describe('familyOf', () => {
  it('puts a colour in the family of its closest library shade', () => {
    expect(lib.familyOf('#B5121B')).toBe('reds');
    expect(lib.familyOf('#F8F8F5')).toBe('whites');
    expect(lib.familyOf('not-a-colour')).toBeNull();
  });
});

describe('buildShades', () => {
  it('salon bottles first, with a family and a price, inactive ones dropped', () => {
    const c = lib.buildShades([blue, red, off]);
    expect(c.hasInventory).toBe(true);
    expect(c.inventory.map((p) => p.id)).toEqual(['pol-blue', 'pol-red']);
    expect(c.shades[0].salon).toBe(true);
    expect(c.shades.length).toBe(2 + LIBRARY.length);
    expect(c.byId.get('pol-red').price).toBe(8.5);
    expect(c.byId.get('pol-red').family).toBe('reds');
  });
  it('the library never carries a brand (brands and prices come only from the salon)', () => {
    const c = lib.buildShades([]);
    expect(c.hasInventory).toBe(false);
    expect(c.shades.every((p) => p.brand === '')).toBe(true);
  });
  it('Try at home: hidden polishes stay out, the library only when the salon has none', () => {
    const c = lib.buildShades([blue, red], { includeLibrary: false, includeHidden: false });
    expect(c.shades.map((p) => p.id)).toEqual(['pol-red']);
    expect(lib.buildShades([], { includeLibrary: false }).shades.length).toBe(LIBRARY.length);
  });
});

describe('findSubstitute', () => {
  it('suggests the closest bottle on the shelf for a sold-out one', () => {
    const inv = lib.buildShades([red, red2, blue]).inventory;
    const s = lib.findSubstitute(inv.find((p) => p.id === 'pol-red'), inv);
    expect(s.to.id).toBe('pol-red2');
    expect(s.d).toBeGreaterThan(0);
  });
  it('nothing for a polish in stock', () => {
    expect(lib.findSubstitute(red2, [red, blue])).toBeNull();
  });
});

describe('designs', () => {
  it('a design built in the studio stores ids and colours only, no names or brands', () => {
    const c = lib.buildShades([red, red2]);
    const d = withFinger(withBase(DEFAULT_DESIGN, c.byId.get('pol-red')), 'ring', c.byId.get('pol-red2'));
    const stored = sanitizeNailDesign(d);
    expect(JSON.stringify(stored)).not.toMatch(/House Red|OPI|price/);
    expect(stored.base).toEqual({ polishId: 'pol-red', hex: '#B5121B', hex2: null, finish: 'creme' });
    const back = lib.hydrateDesign(stored, c.byId);
    expect(back.base.name).toBe('House Red');
    expect(back.base.brand).toBe('OPI');
    expect(back.perFinger.ring.nameAr).toBe('كرزي');
    expect(lib.designPolishes(stored, c.byId).map((p) => p.id).sort()).toEqual(['pol-red', 'pol-red2']);
  });
  it('fingerPaints fills every finger with the base where no accent is set', () => {
    const d = { ...DEFAULT_DESIGN, perFinger: { ring: { hex: '#000000', finish: 'matte' } } };
    const f = lib.fingerPaints(d);
    expect(f).toHaveLength(5);
    expect(f.find((x) => x.key === 'ring').paint.hex).toBe('#000000');
    expect(f.find((x) => x.key === 'thumb').paint.hex).toBe(DEFAULT_DESIGN.base.hex);
  });
  it('a shape keeps its minimum length; lengths map to the nearest label', () => {
    expect(lib.applyShape({ ...DEFAULT_DESIGN, length: 0 }, 'stiletto').length).toBe(0.55);
    expect(lib.applyShape(DEFAULT_DESIGN, 'nope')).toBe(DEFAULT_DESIGN);
    expect(lib.lengthKey(0.5)).toBe('medium');
    expect(lib.lengthKey(undefined)).toBe('natural');
  });
  it('next visit by product type', () => {
    expect(lib.nextVisitWeeksFor('lacquer')).toBe(1);
    expect(lib.nextVisitWeeksFor('biab')).toBe(4);
    expect(lib.nextVisitWeeksFor(undefined)).toBe(3);
  });
});

describe('polish CSV', () => {
  it('the template imports cleanly', () => {
    const r = lib.validatePolishesCsv(lib.POLISH_CSV_TEMPLATE);
    expect(r.invalid).toEqual([]);
    expect(r.valid).toHaveLength(2);
    expect(r.valid[0]).toMatchObject({ name: 'Classic Red', hex: '#B5121B', finish: 'creme', type: 'gel', stock: 6, priceOmr: 8.5, hidden: false, active: true });
    expect(r.valid[1].stock).toBeNull();
    expect(decodeURIComponent(lib.polishTemplateHref().split(',').slice(1).join(','))).toContain('name,nameAr,brand');
  });
  it('bad rows are listed with reasons; a missing column stops the import', () => {
    const r = lib.validatePolishesCsv('name,nameAr,hex,finish,stock,priceOmr,hidden\n,,#B5121B,creme,,,\nX,,B5121B,mirror,2.5,-1,maybe\nY,,#12345,creme,,1.2345,');
    expect(r.valid).toEqual([]);
    expect(r.invalid[0].reasons).toEqual(['csv.err.name']);
    expect(r.invalid[1].reasons).toEqual(['nails.csv_err_finish', 'nails.csv_err_stock', 'csv.err.price', 'nails.csv_err_hidden']);
    expect(r.invalid[2].reasons).toEqual(['nails.csv_err_hex', 'csv.err.decimals']);
    expect(lib.validatePolishesCsv('name,hex\nA,#000000')).toMatchObject({ error: 'header', missing: ['nameAr', 'finish'] });
  });
  it('a hex without # is accepted', () => {
    expect(lib.validatePolishesCsv('name,nameAr,hex,finish\nA,,b5121b,gloss').valid[0].hex).toBe('#B5121B');
  });
});

describe('routes contract', () => {
  it('exports the entry points, home entry and owner tabs', async () => {
    const r = await import('../../src/screens/nails/routes.jsx');
    expect(r.ENTRY).toBe('/nails');
    expect(r.HOME_ENTRY('s1')).toBe('/t/s1/nails');
    expect(r.OWNER_TABS.map((x) => x.to)).toEqual(['/nails/owner/polishes', '/nails/owner/looks', '/nails/owner/requests']);
    const els = r.routes({ StaffOnly: ({ children }) => children, InSession: ({ children }) => children });
    expect(els.every((e) => e.key && (e.props.path.startsWith('/nails') || e.props.path.startsWith('/t/:salonId/nails')))).toBe(true);
  });
});

describe('nails AI adapter', () => {
  it('MobileSAM Perfect Fit is off without a configured model location', async () => {
    const ai = await import('../../src/ai/nails/index.js');
    expect(ai.samEnabled()).toBe(false);
    await expect(ai.loadSam()).rejects.toThrow('sam-off');
    expect(ai.HAND_MODEL_URL).toMatch(/^https:\/\/storage\.googleapis\.com\/mediapipe-models\/hand_landmarker\//);
  });
});
