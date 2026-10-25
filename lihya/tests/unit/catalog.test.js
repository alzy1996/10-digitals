import { describe, it, expect } from 'vitest';
import STYLES from '../../src/data/styles.json';
import MUSTACHES from '../../src/data/mustaches.json';
import LINES from '../../src/data/lines.json';
import COLORS from '../../src/data/colors.json';
import FINISHES from '../../src/data/finishes.json';
import REASONS from '../../src/data/reasons.json';
import I18N from '../../src/lib/i18n/ns/catalog.json';
import { LOOK_ZONES, LINE_ENUMS, CHIN_SHAPES, LENGTH_CLASSES } from '../../src/lib/look.js';

const ZONES = ['M', 'S', 'C', 'J_L', 'J_R', 'K_L', 'K_R', 'B_L', 'B_R', 'N'];
const FACE_CODES = ['OV', 'RD', 'SQ', 'OB', 'HT', 'DM', 'TR'];
const AGE_BANDS = ['18-24', '25-34', '35-44', '45-54', '55+'];
const ARABIC = /[؀-ۿ]/;
const ARABIC_DIGITS = /[٠-٩۰-۹]/;
// Emoji and pictographs (the app never shows emoji).
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]|\u{FE0F}/u;

// PRD 4.1, transcribed independently of the seed file:
// id: [English, Arabic, faces, trim days, local fit]
const PRD_STYLES = {
  'clean-shave': ['Clean shave', 'حلاقة على الصفر', ['all'], 1, 4],
  'light-stubble': ['Light stubble', 'ظل خفيف', ['OV', 'SQ', 'OB', 'TR'], 2, 4],
  'short-stubble': ['Short stubble', 'شعر خفيف قصير', ['OV', 'SQ', 'RD'], 3, 4],
  'designer-stubble': ['Designer stubble', 'ستابل مصمم', ['OV', 'SQ', 'RD'], 3, 5],
  'heavy-stubble': ['Heavy stubble', 'ستابل كثيف', ['OV', 'SQ', 'OB'], 7, 4],
  beardstache: ['Beardstache', 'شنب كثيف مع ستابل', ['OV', 'SQ'], 7, 2],
  'chin-strap': ['Chin strap', 'لحية شريطية', ['OV', 'SQ'], 4, 3],
  'chin-curtain': ['Chin curtain (no mustache)', 'لحية بلا شنب', ['HT', 'DM'], 7, 3],
  goatee: ['Goatee', 'دقن (غوتي)', ['RD', 'OV', 'TR'], 4, 4],
  'extended-goatee': ['Extended goatee', 'غوتي ممتد', ['RD', 'SQ'], 4, 4],
  'circle-beard': ['Circle beard', 'سكسوكة', ['SQ', 'OV', 'TR'], 4, 5],
  'van-dyke': ['Van Dyke', 'فان دايك', ['RD', 'SQ', 'TR'], 7, 3],
  anchor: ['Anchor', 'لحية المرساة', ['RD', 'SQ'], 4, 3],
  balbo: ['Balbo', 'بالبو', ['SQ', 'RD'], 7, 3],
  royale: ['Royale', 'رويال', ['OV', 'SQ'], 4, 2],
  'soul-patch': ['Soul patch', 'شعرة الشفة', ['all'], 3, 2],
  hollywoodian: ['Hollywoodian', 'هوليوودي', ['RD', 'OV'], 7, 3],
  'mutton-chops': ['Mutton chops', 'سوالف عريضة', ['OB'], 7, 1],
  'friendly-muttons': ['Friendly mutton chops', 'سوالف موصولة بالشنب', ['OB'], 7, 1],
  'short-boxed': ['Short boxed beard', 'لحية قصيرة مربعة', ['OV', 'RD', 'OB'], 7, 5],
  corporate: ['Corporate beard', 'لحية رسمية مهذبة', ['OV', 'SQ', 'RD'], 7, 5],
  khatt: ['Razor-lined beard', 'لحية مخططة (خط حاد)', ['RD', 'OV', 'SQ'], 5, 5],
  'beard-fade': ['Faded beard', 'لحية متدرجة (فيد)', ['RD', 'SQ', 'OV'], 7, 5],
  'full-medium': ['Full beard, medium', 'لحية كاملة متوسطة', ['OV', 'HT', 'DM'], 14, 4],
  'full-long': ['Full beard, long', 'لحية كاملة طويلة', ['OV', 'HT', 'DM'], 14, 3],
  sunnah: ['Sunnah beard', 'لحية سُنّة مع حف الشارب', ['all'], 14, 5],
  ducktail: ['Ducktail', 'ذيل البطة', ['RD', 'SQ'], 14, 3],
  garibaldi: ['Garibaldi', 'غاريبالدي', ['HT', 'DM', 'OV'], 14, 2],
  verdi: ['Verdi', 'فيردي', ['OV', 'HT'], 14, 2],
  bandholz: ['Bandholz', 'باندهولز', ['OV', 'DM', 'HT'], 21, 2],
  spade: ['Spade', 'لحية المجرفة', ['HT', 'DM'], 14, 2],
  'old-dutch': ['Old Dutch', 'الهولندي القديم', ['HT', 'DM'], 14, 1],
  'french-fork': ['French fork', 'الشوكة الفرنسية', ['OV'], 21, 1],
  viking: ['Viking (braided)', 'فايكنغ مضفّرة', ['OV', 'DM'], 21, 1],
};

// PRD 4.1 "Zones (mm)": the zones the PRD states (J, K, B = both sides; "all X" = every zone).
const all = (mm) => Object.fromEntries(ZONES.map((z) => [z, mm]));
const PRD_ZONES = {
  'clean-shave': all(0),
  'light-stubble': all(1),
  'short-stubble': all(2),
  'designer-stubble': all(4),
  'heavy-stubble': all(7),
  beardstache: { M: 15, S: 3, C: 3, J_L: 3, J_R: 3, K_L: 3, K_R: 3, B_L: 3, B_R: 3, N: 3 },
  'chin-strap': { J_L: 6, J_R: 6, C: 6, M: 0, S: 0, K_L: 0, K_R: 0, B_L: 0, B_R: 0, N: 0 },
  'chin-curtain': { J_L: 15, J_R: 15, C: 20, M: 0, S: 0, K_L: 0, K_R: 0, B_L: 0, B_R: 0, N: 0 },
  goatee: { C: 15, S: 10, M: 0, J_L: 0, J_R: 0, K_L: 0, K_R: 0, B_L: 0, B_R: 0, N: 0 },
  'extended-goatee': { C: 15, J_L: 8, J_R: 8, M: 6 },
  'circle-beard': { M: 6, C: 8 },
  'van-dyke': { M: 10, C: 25, S: 6 },
  anchor: { M: 4, C: 8, J_L: 8, J_R: 8 },
  balbo: { M: 8, C: 10, J_L: 8, J_R: 8, S: 6, B_L: 0, B_R: 0 },
  royale: { M: 6, C: 10 },
  'soul-patch': { S: 6, M: 0, C: 0, J_L: 0, J_R: 0, K_L: 0, K_R: 0, B_L: 0, B_R: 0, N: 0 },
  hollywoodian: { M: 8, C: 12, J_L: 10, J_R: 10, K_L: 0, K_R: 0, B_L: 0, B_R: 0 },
  'mutton-chops': { B_L: 15, B_R: 15, K_L: 15, K_R: 15, C: 0, M: 0 },
  'friendly-muttons': { B_L: 15, B_R: 15, K_L: 15, K_R: 15, M: 10, C: 0 },
  'short-boxed': { K_L: 8, K_R: 8, J_L: 10, J_R: 10, C: 14, M: 8, B_L: 8, B_R: 8, N: 0 },
  corporate: { ...all(15), N: 0 },
  khatt: { ...all(10), N: 0 },
  'beard-fade': { B_L: 10, B_R: 10, K_L: 10, K_R: 10, J_L: 12, J_R: 12, C: 15 },
  'full-medium': all(30),
  'full-long': all(60),
  sunnah: { C: 80, M: 2 },
  ducktail: { K_L: 15, K_R: 15, J_L: 25, J_R: 25, C: 60 },
  garibaldi: all(70),
  verdi: { K_L: 20, K_R: 20, J_L: 40, J_R: 40, C: 70, M: 20 },
  bandholz: all(100),
  spade: all(50),
  'old-dutch': { J_L: 60, J_R: 60, C: 60, M: 0 },
  'french-fork': { C: 80 },
  viking: { C: 150 },
};

describe('styles.json (PRD 4.1)', () => {
  it('has the 34 PRD styles, unique ids', () => {
    expect(STYLES).toHaveLength(34);
    const ids = STYLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(34);
    expect([...ids].sort()).toEqual(Object.keys(PRD_STYLES).sort());
  });

  it('names, faces, trim interval and local fit match the PRD exactly', () => {
    for (const s of STYLES) {
      const [en, ar, faces, trim, local] = PRD_STYLES[s.id];
      expect(s.name.en, s.id).toBe(en);
      expect(s.name.ar, s.id).toBe(ar);
      expect(s.faces, s.id).toEqual(faces);
      expect(s.trimDays, s.id).toBe(trim);
      expect(s.localFit, s.id).toBe(local);
    }
  });

  it('keeps the Arabic harakat of the PRD', () => {
    const byId = Object.fromEntries(STYLES.map((s) => [s.id, s]));
    expect(byId.sunnah.name.ar).toContain('سُنّة');
    expect(byId.viking.name.ar).toContain('مضفّرة');
    expect(byId['chin-curtain'].name.ar).toBe('لحية بلا شنب');
  });

  it('every style has all 10 zones as numbers in 0..200 mm, matching the PRD zone expressions', () => {
    for (const s of STYLES) {
      expect(Object.keys(s.zones).sort(), s.id).toEqual([...ZONES].sort());
      for (const z of ZONES) {
        expect(typeof s.zones[z], `${s.id}.${z}`).toBe('number');
        expect(s.zones[z]).toBeGreaterThanOrEqual(0);
        expect(s.zones[z]).toBeLessThanOrEqual(200);
      }
      for (const [z, mm] of Object.entries(PRD_ZONES[s.id])) expect(s.zones[z], `${s.id}.${z}`).toBe(mm);
      expect(typeof s.zoneNote).toBe('string');
      expect(s.zoneNote.length).toBeGreaterThan(2);
    }
  });

  it('encodes the PRD shape words', () => {
    const byId = Object.fromEntries(STYLES.map((s) => [s.id, s]));
    expect(byId['beard-fade'].shape.fadeB).toEqual([0, 10]);
    expect(byId.balbo.shape.mustacheFloating).toBe(true);
    expect(byId['van-dyke'].shape.mustacheFloating).toBe(true);
    for (const id of ['extended-goatee', 'anchor', 'balbo']) expect(byId[id].shape.jFront, id).toBe(true);
    expect(byId.sunnah.shape.lengthAdjustable).toBe('C');
    expect(byId['van-dyke'].shape.chin).toBe('pointed');
    expect(byId.anchor.shape.chin).toBe('pointed');
    expect(byId.ducktail.shape.chin).toBe('pointed');
    expect(byId.garibaldi.shape.chin).toBe('wide-round');
    expect(byId.verdi.shape.chin).toBe('round');
    expect(byId.spade.shape.chin).toBe('flat');
    expect(byId['old-dutch'].shape.flare).toBe(true);
    expect(byId['french-fork'].shape.chin).toBe('split');
    expect(byId.viking.shape.chin).toBe('braided');
    expect(byId['circle-beard'].shape.chin).toBe('ring');
    expect(byId.royale.shape.chin).toBe('strip');
  });

  it('maps the PRD Lines column', () => {
    const byId = Object.fromEntries(STYLES.map((s) => [s.id, s]));
    expect(byId.khatt.lines.edge).toBe('razor');
    expect(byId.khatt.lines.cheek).toBe('straight');
    expect(byId['chin-strap'].lines.edge).toBe('razor'); // "sharp"
    expect(byId.anchor.lines.edge).toBe('razor'); // "sharp"
    expect(byId['designer-stubble'].lines.edge).toBe('crisp');
    expect(byId['beard-fade'].lines.sideburn).toBe('skin-fade');
    expect(byId.sunnah.lines.mustacheEdge).toBe('short');
    expect(byId.sunnah.mustacheId).toBe('sunnah-trimmed');
    for (const id of ['light-stubble', 'short-stubble', 'full-long', 'garibaldi', 'mutton-chops']) {
      expect(byId[id].lines.edge, id).toBe('soft'); // "natural"
    }
  });

  it('uses only valid enums and references', () => {
    const mustacheIds = new Set(MUSTACHES.map((m) => m.id));
    const orders = new Set();
    for (const s of STYLES) {
      for (const [type, values] of Object.entries(LINE_ENUMS)) expect(values, `${s.id} ${type}`).toContain(s.lines[type]);
      expect(Object.keys(s.lines).sort()).toEqual(['cheek', 'edge', 'mustacheEdge', 'neckline', 'sideburn']);
      expect(CHIN_SHAPES).toContain(s.shape.chin);
      expect(Object.keys(s.shape).sort()).toEqual(['chin', 'fadeB', 'flare', 'jFront', 'lengthAdjustable', 'mustacheFloating']);
      if (s.mustacheId !== null) expect(mustacheIds.has(s.mustacheId), s.id).toBe(true);
      if (s.faces[0] === 'all') expect(s.faces).toEqual(['all']);
      else for (const f of s.faces) expect(FACE_CODES).toContain(f);
      expect(LENGTH_CLASSES).toContain(s.lengthClass);
      expect(typeof s.theatrical).toBe('boolean');
      for (const t of s.tags) expect(['gulf', 'eid', 'razor']).toContain(t);
      for (const [band, v] of Object.entries(s.ageFit)) {
        expect(AGE_BANDS).toContain(band);
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(s.hidden).toBe(false);
      expect(s.signature).toBe(false);
      expect(Number.isInteger(s.order)).toBe(true);
      expect(orders.has(s.order)).toBe(false);
      orders.add(s.order);
    }
  });

  it('grow-ability weights sum to 1 over zones the style keeps; required densities cover the same zones', () => {
    for (const s of STYLES) {
      const keys = Object.keys(s.weights);
      if (s.id === 'clean-shave') {
        expect(keys).toEqual([]);
        expect(s.required).toEqual({});
        continue;
      }
      expect(keys.length, s.id).toBeGreaterThan(0);
      const sum = Object.values(s.weights).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1), s.id).toBeLessThan(1e-6);
      for (const z of keys) {
        expect(ZONES).toContain(z);
        expect(s.zones[z], `${s.id} weight on a shaved zone ${z}`).toBeGreaterThan(0);
      }
      expect(Object.keys(s.required).sort()).toEqual([...keys].sort());
      for (const v of Object.values(s.required)) {
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('full beards need cheeks and jaw at 70 or more; cheeks and jaw weigh most', () => {
    const full = STYLES.filter(
      (s) => s.zones.K_L >= 8 && s.zones.J_L >= 8 && s.zones.C >= 8 && s.zones.M > 0 && !s.theatrical,
    );
    expect(full.map((s) => s.id)).toEqual(expect.arrayContaining(['short-boxed', 'corporate', 'khatt', 'full-medium', 'full-long', 'sunnah']));
    for (const s of full) {
      for (const z of ['K_L', 'K_R', 'J_L', 'J_R']) expect(s.required[z], `${s.id} ${z}`).toBeGreaterThanOrEqual(70);
      const kj = s.weights.K_L + s.weights.K_R + s.weights.J_L + s.weights.J_R;
      expect(kj, s.id).toBeGreaterThanOrEqual(0.5);
    }
    const byId = Object.fromEntries(STYLES.map((s) => [s.id, s]));
    expect(byId.goatee.required.C).toBe(60);
    expect(byId['soul-patch'].required.S).toBe(50);
    expect(byId['light-stubble'].required.K_L).toBeLessThan(byId['full-medium'].required.K_L);
  });

  it('theatrical styles drop for 55+ and the Gulf presets are tagged', () => {
    const byId = Object.fromEntries(STYLES.map((s) => [s.id, s]));
    for (const id of ['garibaldi', 'verdi', 'bandholz', 'old-dutch', 'french-fork', 'viking', 'mutton-chops', 'friendly-muttons']) {
      expect(byId[id].theatrical, id).toBe(true);
      expect(byId[id].ageFit['55+'], id).toBeLessThan(0.8);
    }
    for (const id of ['sunnah', 'khatt', 'circle-beard', 'short-boxed', 'corporate']) expect(byId[id].tags, id).toContain('gulf');
    expect(byId.khatt.tags).toContain('razor');
    const sorted = [...STYLES].sort((a, b) => a.order - b.order);
    expect(sorted[0].id).toBe('sunnah');
    expect(sorted.slice(0, 5).every((s) => s.localFit === 5)).toBe(true);
  });
});

describe('mustaches.json (PRD 4.2)', () => {
  const PRD = {
    'natural-short': ['Natural short', 'شنب طبيعي قصير', 'Trimmed at the lip line'],
    'sunnah-trimmed': ['Trimmed short', 'شنب محفوف', 'Clipped very short above the lip'],
    chevron: ['Chevron', 'شيفرون', 'Thick and wide, covers the top lip edge'],
    pencil: ['Pencil', 'شنب رفيع', 'Thin line just above the lip'],
    english: ['English', 'إنجليزي', 'Narrow, long ends pulled sideways with wax'],
    handlebar: ['Handlebar', 'المقود', 'Long ends curled upward with wax'],
    horseshoe: ['Horseshoe', 'حدوة الحصان', 'Runs down the mouth corners to the jaw'],
    walrus: ['Walrus', 'الفظ', 'Very thick, hangs over the lip'],
    'fu-manchu': ['Fu Manchu', 'فو مانشو', 'Long thin ends hanging past the chin'],
    imperial: ['Imperial', 'إمبريال', 'Full, ends curl up onto the cheeks'],
    'painters-brush': ["Painter's brush", 'فرشاة الرسام', 'Thick, flat, wide brush shape'],
    dali: ['Dali', 'دالي', 'Thin, ends waxed straight up'],
    pyramid: ['Pyramid', 'هرمي', 'Narrow on top, wide at the bottom'],
  };
  const ENDS = ['trim', 'pulled', 'curl-up', 'down-to-jaw', 'hang', 'down-long', 'curl-cheek', 'brush', 'waxed-up', 'pyramid'];

  it('has the 13 PRD mustaches with exact names and shapes', () => {
    expect(MUSTACHES).toHaveLength(13);
    expect(MUSTACHES.map((m) => m.id).sort()).toEqual(Object.keys(PRD).sort());
    for (const m of MUSTACHES) {
      const [en, ar, shape] = PRD[m.id];
      expect(m.name).toEqual({ en, ar });
      expect(m.shape.en).toBe(shape);
      expect(m.shape.ar).toMatch(ARABIC);
      expect(ENDS).toContain(m.ends);
      expect(m.widthFactor).toBeGreaterThan(0.5);
      expect(m.widthFactor).toBeLessThan(2);
      expect(m.thicknessMm).toBeGreaterThan(0);
      expect(typeof m.overLip).toBe('boolean');
      expect(typeof m.waxed).toBe('boolean');
    }
  });
});

describe('lines.json (PRD 4.3)', () => {
  it('has the 5 line types with the PRD options in both languages', () => {
    const t = Object.fromEntries(LINES.types.map((x) => [x.id, x]));
    expect(Object.keys(t)).toEqual(['cheek', 'neckline', 'sideburn', 'edge', 'mustacheEdge']);
    const opts = (id) => t[id].options.map((o) => [o.id, o.name.en, o.name.ar]);
    expect(opts('cheek')).toEqual([
      ['natural', 'Natural', 'طبيعي'],
      ['low', 'Low, follows jaw', 'منخفض'],
      ['medium', 'Medium', 'متوسط'],
      ['high', 'High', 'مرتفع'],
      ['curved', 'Curved', 'منحني'],
      ['straight', 'Straight razor (khatt)', 'مستقيم حاد'],
    ]);
    expect(opts('neckline')).toEqual([
      ['1f', "1 finger above Adam's apple (long beards)", 'إصبع'],
      ['2f', '2 fingers, about 3 cm (standard)', 'إصبعين'],
      ['jaw', 'Follows jaw curve', 'مع خط الفك'],
      ['squared', 'Squared corner', 'زاوية مربعة'],
    ]);
    expect(opts('sideburn')).toEqual([
      ['hard', 'Hard part', 'خط فاصل'],
      ['skin-fade', 'Skin fade', 'فيد على الجلد'],
      ['blended', 'Blended', 'مدمج'],
      ['disconnected', 'Disconnected', 'منفصل'],
    ]);
    expect(opts('edge')).toEqual([
      ['soft', 'Soft (scissor)', 'ناعم'],
      ['crisp', 'Crisp (trimmer)', 'حاد'],
      ['razor', 'Razor (straight razor)', 'تحديد بالموس'],
    ]);
    expect(opts('mustacheEdge')).toEqual([
      ['over', 'Over the lip', 'فوق الشفة'],
      ['at', 'At the lip line', 'على خط الشفة'],
      ['short', 'Very short (Sunnah)', 'محفوف'],
    ]);
    for (const x of LINES.types) expect(x.name.ar).toMatch(ARABIC);
    expect(t.neckline.options.find((o) => o.id === '2f').mmAboveAdamsApple).toBe(30);
  });

  it('has the Gulf presets with valid patches', () => {
    expect(LINES.presets.map((p) => p.id)).toEqual(['light-awarid', 'eid-lineup', 'wedding-lineup']);
    expect(LINES.presets[0].name.ar).toBe('عوارض خفيفة');
    for (const p of LINES.presets) {
      expect(p.name.en.length).toBeGreaterThan(2);
      expect(p.name.ar).toMatch(ARABIC);
      for (const [type, v] of Object.entries(p.patch.lines || {})) expect(LINE_ENUMS[type]).toContain(v);
      for (const z of Object.keys(p.patch.zonesMax || {})) expect(LOOK_ZONES).toContain(z);
      if (p.patch.finish) expect(FINISHES.map((f) => f.id)).toContain(p.patch.finish);
    }
  });
});

describe('colors.json (PRD 4.4)', () => {
  const PRD = {
    natural: ['Natural (no color)', 'طبيعي', 'none'],
    'jet-black': ['Jet black', 'أسود فاحم', 'permanent'],
    'natural-black': ['Natural black', 'أسود طبيعي', 'permanent'],
    'dark-brown': ['Dark brown', 'بني غامق', 'permanent'],
    'medium-brown': ['Medium brown', 'بني متوسط', 'permanent'],
    'light-brown': ['Light brown', 'بني فاتح', 'permanent'],
    auburn: ['Auburn', 'أحمر نحاسي', 'permanent'],
    blonde: ['Blonde', 'أشقر', 'permanent'],
    'salt-pepper': ['Salt and pepper (keep)', 'ملح وفلفل', 'none'],
    silver: ['Silver or white (embrace)', 'فضي أو أبيض', 'toner'],
    'grey-blend': ['Grey blending 25 / 50 / 75%', 'تمويه الشيب', 'demi-permanent'],
    henna: ['Henna (orange-red)', 'حناء', 'vegetable'],
    'henna-katam': ['Henna + katam (brown-black)', 'حناء وكتم', 'vegetable'],
    'temp-color': ['Temporary color (wash-out)', 'لون مؤقت', 'temporary'],
  };
  const SAFETY = REASONS.safetyQuestions.map((q) => q.id);

  it('is an array of the 14 PRD colors (the analysis reads it as an array)', () => {
    expect(Array.isArray(COLORS)).toBe(true);
    expect(COLORS).toHaveLength(14);
    expect(COLORS.map((c) => c.id)).toEqual(Object.keys(PRD));
    for (const c of COLORS) {
      const [en, ar, type] = PRD[c.id];
      expect(c.name).toEqual({ en, ar });
      expect(c.type).toBe(type);
    }
  });

  it('has swatches for every dye and keeps the detected color for natural and salt and pepper', () => {
    for (const c of COLORS) {
      if (['natural', 'salt-pepper', 'grey-blend'].includes(c.id)) expect(c.hex, c.id).toBeNull();
      else expect(c.hex, c.id).toMatch(/^#[0-9a-f]{6}$/);
      if (c.type === 'permanent') expect(c.hex, `${c.id} feeds beard color matching`).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(COLORS.find((c) => c.id === 'grey-blend').greyBlend).toEqual([25, 50, 75]);
  });

  it('flags chemical dyes and their safety questions', () => {
    for (const c of COLORS) {
      expect(c.chemical, c.id).toBe(['permanent', 'demi-permanent', 'toner'].includes(c.type));
      for (const q of c.safety) expect(SAFETY).toContain(q);
      if (c.chemical) expect(c.safety).toEqual(SAFETY);
      if (c.type === 'none') expect(c.safety).toEqual([]);
    }
    const jet = COLORS.find((c) => c.id === 'jet-black');
    expect(jet.warn.en).toBe('Can look flat and harsh on lighter skin');
    expect(jet.warn.ar).toMatch(ARABIC);
    expect(COLORS.find((c) => c.id === 'henna').notes.en).toBe('Pure henna coats the hair and blocks later chemical color');
    expect(COLORS.find((c) => c.id === 'henna').safety).toContain('metallicSaltProducts');
  });

  it('asks the four PRD safety questions, keyed like the session safety state', () => {
    expect(SAFETY).toEqual(['patchTest48h', 'metallicSaltProducts', 'pureHenna', 'irritationToday']);
    for (const q of REASONS.safetyQuestions) {
      expect(q.text.en.length).toBeGreaterThan(10);
      expect(q.text.ar).toMatch(ARABIC);
      expect(q.riskWhen.length).toBeGreaterThan(0);
    }
  });
});

describe('finishes.json (PRD 4.5)', () => {
  it('has the 4 PRD finishes', () => {
    expect(FINISHES.map((f) => [f.id, f.name.en, f.name.ar])).toEqual([
      ['matte', 'Natural matte', 'مطفي طبيعي'],
      ['oiled', 'Oiled sheen', 'لمعة الزيت'],
      ['balm', 'Balm-shaped', 'مشكّل بالبلسم'],
      ['waxed', 'Waxed mustache', 'شنب بالشمع'],
    ]);
    for (const f of FINISHES) {
      expect(f.sheen).toBeGreaterThanOrEqual(0);
      expect(f.sheen).toBeLessThanOrEqual(1);
      expect(f.waxedMustache).toBe(f.id === 'waxed');
    }
  });
});

describe('reasons.json (PRD 6.3, 6.4)', () => {
  const PRD_CHIPS = [
    ['face_elongate', 'Makes a round face look longer', 'يُطيل مظهر الوجه الدائري'],
    ['face_soften', 'Softens a square jaw', 'يُنعّم زوايا الفك المربع'],
    ['face_widen', 'Adds width to a long face', 'يضيف عرضاً للوجه الطويل'],
    ['face_balance_chin', 'Balances a narrow chin', 'يوازن الذقن الضيقة'],
    ['grow_ok', 'Your beard grows full in these zones', 'لحيتك كثيفة في هذه المناطق'],
    ['grow_warn', 'Cheeks grow light: gaps may show', 'العوارض خفيفة: قد تظهر فراغات'],
    ['low_maint', 'Trim every 2 weeks', 'تشذيب كل أسبوعين'],
    ['high_contrast', 'Dark beard on lighter skin: sharp lines stand out', 'لحية داكنة على بشرة فاتحة: الخطوط الحادة تبرز'],
    ['eid_ready', 'Sharp lines for Eid and weddings', 'خطوط حادة للعيد والأعراس'],
  ];

  it('has the 9 PRD chips with the exact English and Arabic text', () => {
    expect(REASONS.chips.map((c) => [c.id, c.text.en, c.text.ar])).toEqual(PRD_CHIPS);
    for (const c of REASONS.chips) expect(c.key).toBe(`catalog.reason.${c.id}`);
  });

  it('has the 3 haircut pairing hints and zone warnings', () => {
    expect(REASONS.pairings.map((p) => p.id)).toEqual(['high_fade_full', 'mid_fade_designer', 'long_top_connected']);
    for (const p of REASONS.pairings) expect(p.text.ar).toMatch(ARABIC);
    const warnIds = REASONS.warnings.map((w) => w.id);
    for (const id of ['patchy_cheeks', 'patchy_jaw', 'patchy_chin', 'patchy_mustache', 'under40', 'work_rule']) expect(warnIds).toContain(id);
  });

  it('every template text equals its i18n string in both languages', () => {
    const groups = [REASONS.chips, REASONS.trimTemplates, REASONS.warnings, REASONS.pairings, REASONS.safetyQuestions];
    for (const list of groups) {
      for (const item of list) {
        expect(I18N.en[item.key], item.key).toBe(item.text.en);
        expect(I18N.ar[item.key], item.key).toBe(item.text.ar);
      }
    }
  });
});

describe('catalog i18n namespace', () => {
  it('has the same keys in both languages, all prefixed catalog.', () => {
    const en = Object.keys(I18N.en).sort();
    const ar = Object.keys(I18N.ar).sort();
    expect(ar).toEqual(en);
    for (const k of en) expect(k.startsWith('catalog.')).toBe(true);
  });

  it('Arabic strings are Arabic with Latin digits; no emoji anywhere', () => {
    for (const [k, v] of Object.entries(I18N.ar)) {
      expect(v, k).toMatch(ARABIC);
      expect(ARABIC_DIGITS.test(v), k).toBe(false);
    }
    const everything = JSON.stringify([STYLES, MUSTACHES, LINES, COLORS, FINISHES, REASONS, I18N]);
    expect(EMOJI.test(everything)).toBe(false);
    expect(ARABIC_DIGITS.test(everything)).toBe(false);
  });

  it('placeholders match between languages', () => {
    const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
    for (const k of Object.keys(I18N.en)) expect(vars(I18N.ar[k]), k).toBe(vars(I18N.en[k]));
  });
});
