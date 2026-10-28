import { describe, expect, it } from 'vitest';
import { parseCsv, validateProducts, validateClients, validateSwatches, toCsv, normalizeOmanPhone } from '../../src/reports/csv.js';

describe('CSV parser (PRD 11.3)', () => {
  it('handles BOM, Arabic, quotes and CRLF', () => {
    const rows = parseCsv('﻿name,nameAr\r\n"Cut, wash","قص وغسل"\r\nGloss,"جلوس ""لامع"""\r\n');
    expect(rows).toEqual([
      ['name', 'nameAr'],
      ['Cut, wash', 'قص وغسل'],
      ['Gloss', 'جلوس "لامع"'],
    ]);
  });
  it('reads the optional service column (hair, nails, beard)', () => {
    const r = validateProducts(['name,nameAr,category,section,priceOmr,active', 'Gel,جل,service,nails,6,yes', 'Trim,,service,,3,yes', 'Spa,,service,spa,9,yes'].join('\n'));
    expect(r.valid.map((x) => x.section)).toEqual(['nails', null]);
    expect(r.invalid[0].reasons).toEqual(['csv.err.section']);
  });

  it('imports valid products and rejects bad rows with reasons', () => {
    const csv = [
      'name,nameAr,category,priceOmr,active',
      'Haircut,قص الشعر,service,8.500,yes',
      ',صبغة جذور,color,12,1',
      'Bad cat,,magic,5,yes',
      'Too precise,,treatment,1.2345,yes',
      'Negative,,retail,-1,yes',
      ',,service,3,yes',
    ].join('\n');
    const r = validateProducts(csv);
    expect(r.valid).toHaveLength(2);
    expect(r.valid[0]).toEqual({ name: 'Haircut', nameAr: 'قص الشعر', category: 'service', section: null, priceOmr: 8.5, active: true });
    expect(r.invalid.map((x) => x.reasons[0])).toEqual(['csv.err.category', 'csv.err.decimals', 'csv.err.price', 'csv.err.name']);
    expect(r.invalid[0].line).toBe(4);
  });
  it('rejects a wrong header', () => {
    expect(validateProducts('foo,bar\n1,2').error).toBe('header');
  });
  it('validates Oman phones and skips duplicates', () => {
    expect(normalizeOmanPhone('+968 9123 4567')).toBe('+96891234567');
    expect(normalizeOmanPhone('91234567')).toBe('+96891234567');
    expect(normalizeOmanPhone('12345')).toBeUndefined();
    const r = validateClients('displayName,phone\nمريم,+96891234567\nSara,91234567\nNoor,123\nHind,', [{ displayName: 'X', phone: '+96899999999' }]);
    expect(r.valid.map((v) => v.displayName)).toEqual(['مريم', 'Hind']);
    expect(r.duplicates.map((d) => d.row.displayName)).toEqual(['Sara']);
    expect(r.invalid[0].reasons).toContain('csv.err.phone');
  });
  it('validates swatch codes', () => {
    const r = validateSwatches('line,code,level,tone\nMy line,7.1,7,ash\nMy line,X,13,ash\nMy line,8.3,8,glitter', ['ash', 'gold']);
    expect(r.valid).toEqual([{ line: 'My line', code: '7.1', level: 7, tone: 'ash' }]);
    expect(r.invalid).toHaveLength(2);
  });
  it('exports UTF-8 with BOM for Excel', () => {
    const out = toCsv(['a', 'b'], [{ a: 'x,y', b: 'عربي' }]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out).toContain('"x,y",عربي');
  });
});
