import { describe, expect, it } from 'vitest';
import {
  BOM,
  parseCsv,
  detectDelimiter,
  parseProductsCsv,
  parseClientsCsv,
  parsePriceOmr,
  parseActive,
  toCsv,
  productsTemplateCsv,
  exportConsultationsCsv,
  exportClientsCsv,
  exportStatsCsv,
} from '../../src/reports/csv.js';
import { summarizeDay, addOnsSummary, filterConsultations } from '../../src/reports/summary.js';
import { formatDuration, daysPhrase, trimPhrase } from '../../src/reports/text.js';

const strip = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
const reasons = (res, row) => res.errors.find((e) => e.row === row)?.reasons || [];

describe('parseCsv (RFC 4180)', () => {
  it('reads quoted commas, quotes and newlines inside quotes', () => {
    const text = 'a,b,c\r\n"x, y","say ""hi""","line 1\nline 2"\r\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'line 1\nline 2'],
    ]);
  });

  it('handles CRLF, LF and CR line ends and a missing final newline', () => {
    expect(parseCsv('a,b\r\n1,2\n3,4\r5,6')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
      ['5', '6'],
    ]);
  });

  it('strips the UTF-8 BOM and keeps Arabic text intact', () => {
    const text = `${BOM}name,nameAr\r\nBeard oil,زيت اللحية\r\n`;
    const rows = parseCsv(text);
    expect(rows[0][0]).toBe('name');
    expect(rows[1]).toEqual(['Beard oil', 'زيت اللحية']);
  });

  it('keeps empty fields and empty quoted fields', () => {
    expect(parseCsv('a,,""\n,,\n')).toEqual([
      ['a', '', ''],
      ['', '', ''],
    ]);
    expect(parseCsv('')).toEqual([]);
  });

  it('detects semicolon and tab files from the header line', () => {
    expect(detectDelimiter('name;nameAr;category\n')).toBe(';');
    expect(detectDelimiter('name\tprice\n')).toBe('\t');
    expect(detectDelimiter('"a;b",c\n')).toBe(',');
    expect(parseCsv('name;priceOmr\nزيت;1.500\n')).toEqual([
      ['name', 'priceOmr'],
      ['زيت', '1.500'],
    ]);
  });
});

describe('parseProductsCsv', () => {
  const header = 'name,nameAr,category,priceOmr,active\r\n';

  it('imports valid rows with Arabic names, BOM and CRLF', () => {
    const text = `${BOM}${header}Beard oil,زيت اللحية,oil,2.500,true\r\n"Trim, shape",تشذيب وتحديد,service,3,\r\n`;
    const res = parseProductsCsv(text);
    expect(res.errors).toEqual([]);
    expect(res.rows).toEqual([
      { row: 2, name: 'Beard oil', nameAr: 'زيت اللحية', category: 'oil', priceOmr: 2.5, active: true },
      { row: 3, name: 'Trim, shape', nameAr: 'تشذيب وتحديد', category: 'service', priceOmr: 3, active: true },
    ]);
    expect(res.preview.every((p) => p.ok)).toBe(true);
    expect(res.total).toBe(2);
  });

  it('accepts an Arabic name alone and copies it into name for the import', () => {
    const res = parseProductsCsv(`${header},بلسم اللحية,balm,1.250,1\n`);
    expect(res.rows[0]).toMatchObject({ name: 'بلسم اللحية', nameAr: 'بلسم اللحية', category: 'balm', priceOmr: 1.25, active: true });
  });

  it('rejects bad rows with row numbers and reason keys', () => {
    const text = [
      'name,nameAr,category,priceOmr,active',
      ',,oil,1',
      'Oil,زيت,perfume,1',
      'Oil 2,زيت 2,oil,1.2345',
      'Oil 3,زيت 3,oil,-1',
      'Oil 4,زيت 4,oil,"1,500"',
      'Oil 5,زيت 5,oil,',
      'Oil 6,زيت 6,oil,1,maybe',
      'Oil 7,زيت 7,oil,200000',
      '',
      'Good,جيد,dye,0,no',
    ].join('\n');
    const res = parseProductsCsv(text);
    expect(reasons(res, 2)).toEqual(['report.csv.reason.nameRequired']);
    expect(reasons(res, 3)).toEqual(['report.csv.reason.category']);
    expect(reasons(res, 4)).toEqual(['report.csv.reason.priceDecimals']);
    expect(reasons(res, 5)).toEqual(['report.csv.reason.priceNegative']);
    expect(reasons(res, 6)).toEqual(['report.csv.reason.price']);
    expect(reasons(res, 7)).toEqual(['report.csv.reason.priceRequired']);
    expect(reasons(res, 8)).toEqual(['report.csv.reason.active']);
    expect(reasons(res, 9)).toEqual(['report.csv.reason.priceRange']);
    expect(res.rows).toEqual([{ row: 11, name: 'Good', nameAr: 'جيد', category: 'dye', priceOmr: 0, active: false }]);
    expect(res.preview.filter((p) => !p.ok).map((p) => p.row)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('accepts Arabic digits, the Arabic decimal sign, currency text and Arabic categories', () => {
    expect(parsePriceOmr('١٫٥٠٠')).toEqual({ value: 1.5, reason: null });
    expect(parsePriceOmr('2 OMR')).toEqual({ value: 2, reason: null });
    expect(parsePriceOmr('0.750 ر.ع.')).toEqual({ value: 0.75, reason: null });
    expect(parsePriceOmr('1.2345').reason).toBe('priceDecimals');
    expect(parseActive('نعم').value).toBe(true);
    expect(parseActive('لا').value).toBe(false);
    const res = parseProductsCsv('name,nameAr,category,priceOmr\nKatam,كتم,صبغة,4\n');
    expect(res.rows[0].category).toBe('dye');
  });

  it('marks a repeated name and category as a duplicate', () => {
    const res = parseProductsCsv(`${header}Oil,زيت,oil,1\nOIL,زيت,oil,2\nOil,زيت,balm,2\n`);
    expect(res.rows.map((r) => r.row)).toEqual([2, 4]);
    expect(reasons(res, 3)).toEqual(['report.csv.reason.duplicate']);
  });

  it('reads a file without a header in template order and rejects a header missing a column', () => {
    expect(parseProductsCsv('Oil,زيت,oil,1.5,true\n').rows).toEqual([
      { row: 1, name: 'Oil', nameAr: 'زيت', category: 'oil', priceOmr: 1.5, active: true },
    ]);
    const res = parseProductsCsv('name,nameAr,priceOmr\nOil,زيت,1\n');
    expect(res.rows).toEqual([]);
    expect(res.errors).toEqual([{ row: 1, reasons: ['report.csv.reason.header'], values: {} }]);
  });

  it('accepts columns in any order', () => {
    const res = parseProductsCsv('priceOmr,category,nameAr\n1.000,balm,بلسم\n');
    expect(res.rows[0]).toMatchObject({ name: 'بلسم', category: 'balm', priceOmr: 1 });
  });

  it('has a header-only template', () => {
    expect(productsTemplateCsv()).toBe(`${BOM}name,nameAr,category,priceOmr,active\r\n`);
    expect(parseProductsCsv(productsTemplateCsv())).toEqual({ rows: [], errors: [], preview: [], total: 0 });
  });
});

describe('parseClientsCsv', () => {
  it('normalizes Oman numbers and skips duplicates by phone', () => {
    const text = [
      'displayName,phone',
      'أحمد,+968 9123 4567',
      'Salim,96892345678',
      'Khalid,0096893456789',
      'Repeat,91234567',
      'Known,99887766',
      'Bad,+971501234567',
      'NoPhone,',
      ',91112222',
    ].join('\r\n');
    const res = parseClientsCsv(text, ['+96899887766']);
    expect(res.rows).toEqual([
      { row: 2, displayName: 'أحمد', phone: '+96891234567' },
      { row: 3, displayName: 'Salim', phone: '+96892345678' },
      { row: 4, displayName: 'Khalid', phone: '+96893456789' },
    ]);
    expect(res.skipped).toEqual([
      { row: 5, displayName: 'Repeat', phone: '+96891234567', reason: 'report.csv.reason.duplicatePhone' },
      { row: 6, displayName: 'Known', phone: '+96899887766', reason: 'report.csv.reason.duplicatePhone' },
    ]);
    expect(reasons(res, 7)).toEqual(['report.csv.reason.phone']);
    expect(reasons(res, 8)).toEqual(['report.csv.reason.phoneRequired']);
    expect(reasons(res, 9)).toEqual(['report.csv.reason.displayNameRequired']);
    expect(res.total).toBe(8);
  });

  it('reads the Arabic header written by the clients export', () => {
    const res = parseClientsCsv(`${BOM}الاسم,الهاتف\r\nسالم,٩١٢٣٤٥٦٧\r\n`);
    expect(res.rows).toEqual([{ row: 2, displayName: 'سالم', phone: '+96891234567' }]);
  });
});

describe('toCsv', () => {
  it('writes a BOM, CRLF line ends and quotes only where needed', () => {
    const text = toCsv(
      [
        { a: 'plain', b: 'with, comma', c: 'say "hi"' },
        { a: 'سطر\nجديد', b: 3.5, c: null },
      ],
      ['a', 'b', 'c'],
    );
    expect(text.startsWith(BOM)).toBe(true);
    expect(strip(text)).toBe('a,b,c\r\nplain,"with, comma","say ""hi"""\r\n"سطر\nجديد",3.5,\r\n');
  });

  it('neutralizes spreadsheet formulas in text cells', () => {
    const text = strip(toCsv([{ n: '=HYPERLINK("x")', m: '+968', k: -3 }], ['n', 'm', 'k']));
    expect(text.split('\r\n')[1]).toBe(`"'=HYPERLINK(""x"")",'+968,-3`);
  });

  it('round-trips through parseCsv', () => {
    const rows = [
      ['زيت اللحية', 'oil, premium', '2.500'],
      ['Line\r\nbreak', '"quoted"', ''],
      [' padded ', 'تمويه الشيب', '0'],
    ];
    const text = toCsv(rows, [
      { key: 'x', label: 'الاسم' },
      { key: 'y', label: 'note' },
      { key: 'z', label: 'price' },
    ]);
    expect(parseCsv(text)).toEqual([['الاسم', 'note', 'price'], ...rows]);
  });

  it('supports value functions', () => {
    const text = strip(toCsv([{ p: 1.5 }], [{ key: 'p', label: 'OMR', value: (r) => r.p.toFixed(3) }]));
    expect(text).toBe('OMR\r\n1.500\r\n');
  });
});

const PRODUCTS = [
  { id: 'p1', name: 'Beard oil', nameAr: 'زيت اللحية', category: 'oil', priceOmr: 2.5 },
  { id: 'p2', name: 'Henna', nameAr: 'حناء', category: 'dye', priceOmr: 4 },
];
const STAFF = [
  { uid: 'u1', name: 'Hamad' },
  { uid: 'u2', email: 'saif@example.com' },
];
const DAY = '2026-10-25';
const at = (h, m) => new Date(Date.UTC(2026, 9, 25, h - 4, m));
const CONSULTATIONS = [
  { id: 'c1', dayKey: DAY, barberUid: 'u1', clientId: 'k1', styleId: 'goatee', status: 'done', decisionSeconds: 60, rating: 5, nextVisitDays: 14, addOns: ['p1', 'p1', 'p2'], startedAt: at(9, 5), aiPreviewUsed: true },
  { id: 'c2', dayKey: DAY, barberUid: 'u1', clientId: null, styleId: 'goatee', status: 'approved', decisionSeconds: 120, rating: null, addOns: [], startedAt: at(10, 30) },
  { id: 'c3', dayKey: DAY, barberUid: 'u2', clientId: null, styleId: 'khatt', status: 'done', decisionSeconds: 90, rating: 4, addOns: ['gone'], startedAt: at(11, 0) },
  { id: 'c4', dayKey: DAY, barberUid: 'u2', clientId: null, styleId: 'balbo', status: 'cancelled', addOns: [], startedAt: at(12, 0) },
  { id: 'c5', dayKey: DAY, barberUid: 'u1', styleId: 'balbo', status: 'done', decisionSeconds: 30, rating: 1, demo: true, addOns: ['p2'], startedAt: at(13, 0) },
  { id: 'c6', dayKey: '2026-10-24', barberUid: 'u1', styleId: 'balbo', status: 'done', decisionSeconds: 30, rating: 3, addOns: [], startedAt: new Date('2026-10-24T08:00:00Z') },
];

describe('daily summary', () => {
  it('computes the KPIs for one Muscat day without demo data', () => {
    const r = summarizeDay({ consultations: CONSULTATIONS, dayKey: DAY, products: PRODUCTS, staff: STAFF, stats: { aiRenders: 2 }, settings: { aiDailyCap: 20 } });
    expect(r.consultations).toBe(4);
    expect(r.approvals).toBe(3);
    expect(r.conversionPct).toBe(75);
    expect(r.avgDecisionSeconds).toBe(90);
    expect(r.aiPreviewsUsed).toBe(2);
    expect(r.aiCap).toBe(20);
    expect(r.avgRating).toBe(4.5);
    expect(r.ratingCount).toBe(2);
    expect(r.addOns.count).toBe(4);
    expect(r.addOns.totalOmr).toBe(9);
    expect(r.addOns.unpriced).toBe(1);
    expect(r.addOns.items.find((i) => i.id === 'gone')).toMatchObject({ known: false, unitOmr: null, totalOmr: null });
    expect(r.perBarber).toEqual([
      { uid: 'u1', name: 'Hamad', consultations: 2, approvals: 2, avgDecisionSeconds: 90, avgRating: 5 },
      { uid: 'u2', name: 'saif', consultations: 2, approvals: 1, avgDecisionSeconds: 90, avgRating: 4 },
    ]);
    expect(r.topStyles.map((s) => [s.styleId, s.count])).toEqual([
      ['goatee', 2],
      ['khatt', 1],
    ]);
    expect(r.topStyles[0].name.ar).toBeTruthy();
  });

  it('includes demo data only when asked and counts AI previews without a stats doc', () => {
    const r = summarizeDay({ consultations: CONSULTATIONS, dayKey: DAY, includeDemo: true, products: PRODUCTS });
    expect(r.consultations).toBe(5);
    expect(r.aiPreviewsUsed).toBe(1);
    expect(filterConsultations(CONSULTATIONS, { startKey: '2026-10-24', endKey: DAY })).toHaveLength(5);
  });

  it('prices add-ons only from the products list', () => {
    const s = addOnsSummary([{ addOns: ['p1', 'x'] }], PRODUCTS);
    expect(s.totalOmr).toBe(2.5);
    expect(s.items.map((i) => [i.id, i.totalOmr])).toEqual([
      ['p1', 2.5],
      ['x', null],
    ]);
  });

  it('formats durations and counted phrases', () => {
    expect(formatDuration(74)).toBe('1:14');
    expect(formatDuration(null)).toBe('');
    expect(daysPhrase('ar', 14)).toBe('بعد 14 يومًا');
    expect(daysPhrase('ar', 7)).toBe('بعد 7 أيام');
    expect(daysPhrase('ar', 2)).toBe('بعد يومين');
    expect(daysPhrase('en', 1)).toBe('in 1 day');
    expect(trimPhrase('ar', 1)).toBe('تشذيب كل يوم');
    expect(trimPhrase('en', 14)).toBe('Trim every 14 days');
  });
});

describe('exports', () => {
  it('exports consultations for a Muscat day range with labels only', () => {
    const res = exportConsultationsCsv({
      consultations: CONSULTATIONS,
      startKey: DAY,
      endKey: DAY,
      lang: 'en',
      staff: STAFF,
      clients: [{ id: 'k1', displayName: 'أحمد سالم' }],
      products: PRODUCTS,
    });
    expect(res.count).toBe(4);
    expect(res.filename).toBe('lihya-consultations-2026-10-25.csv');
    const rows = parseCsv(res.text);
    expect(rows[0]).toEqual([
      'Date',
      'Time',
      'Barber',
      'Client',
      'Style',
      'Status',
      'Decision seconds',
      'AI preview',
      'Rating',
      'Next visit (days)',
      'Add-ons',
      'Add-ons (OMR)',
      'Demo',
    ]);
    expect(rows[1]).toEqual(['2026-10-25', '09:05', 'Hamad', 'أحمد سالم', 'Goatee', 'Done', '60', 'Yes', '5', '14', 'Beard oil | Beard oil | Henna', '9.000', 'No']);
    expect(rows[2][3]).toBe('Walk-in');
    expect(rows[3][10]).toBe('Product no longer in the list');
    expect(rows[3][11]).toBe('0.000');
    expect(rows[4][5]).toBe('Cancelled');
    expect(rows[4][6]).toBe('');
    expect(res.text.startsWith(BOM)).toBe(true);
    expect(res.text).not.toMatch(/data:image|blob:/);
  });

  it('exports Arabic headers and values in Arabic', () => {
    const res = exportConsultationsCsv({ consultations: CONSULTATIONS, startKey: DAY, endKey: DAY, lang: 'ar', staff: STAFF, products: PRODUCTS });
    const rows = parseCsv(res.text);
    expect(rows[0][0]).toBe('التاريخ');
    expect(rows[1][5]).toBe('منجز');
    expect(rows[1][10]).toBe('زيت اللحية | زيت اللحية | حناء');
  });

  it('exports clients with coarse labels and re-imports them', () => {
    const clients = [
      { id: 'k1', displayName: 'أحمد', phone: '+96891234567', lastVisitAt: new Date('2026-10-24T21:30:00Z'), profile: { faceShape: 'oval', mst: 6, undertone: 'warm', ageBand: '25-34', growability: 70 }, growthMmPerDay: 0.45 },
      { id: 'k2', displayName: 'Demo', phone: null, demo: true },
    ];
    const res = exportClientsCsv({ clients, lang: 'ar', now: new Date('2026-10-25T08:00:00Z') });
    expect(res.count).toBe(1);
    expect(res.filename).toBe('lihya-clients-2026-10-25.csv');
    const rows = parseCsv(res.text);
    expect(rows[1]).toEqual(['أحمد', '96891234567', '2026-10-25', 'بيضاوي', '6', 'دافئ', '25–34', '70', '0.45']);
    const back = parseClientsCsv(res.text);
    expect(back.rows).toEqual([{ row: 2, displayName: 'أحمد', phone: '+96891234567' }]);
  });

  it('exports daily stats for every day of the range', () => {
    const fromDocs = exportStatsCsv({
      stats: [{ dayKey: '2026-10-24', consultations: 4, approvals: 2, totalDecisionSeconds: 150, aiRenders: 1, addOns: 3, topStyles: { khatt: 1, goatee: 2 } }],
      startKey: '2026-10-23',
      endKey: '2026-10-24',
      lang: 'en',
    });
    const rows = parseCsv(fromDocs.text);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual(['2026-10-23', '0', '0', '', '', '0', '0', '']);
    expect(rows[2]).toEqual(['2026-10-24', '4', '2', '50', '75', '1', '3', 'Goatee']);
    const computed = exportStatsCsv({ consultations: CONSULTATIONS, stats: [{ dayKey: DAY, aiRenders: 2 }], startKey: DAY, endKey: DAY, lang: 'en' });
    expect(parseCsv(computed.text)[1]).toEqual([DAY, '4', '3', '75', '90', '2', '4', 'Goatee']);
  });
});
