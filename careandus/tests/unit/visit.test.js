// The combined visit card: services in a fixed order, salon prices only, never invented.
import { describe, expect, it } from 'vitest';
import { visitSummary, visitText } from '../../src/reports/visit.js';

const t = (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k);
const name = (n) => (typeof n === 'string' ? n : n?.en || '');
const ctx = {
  t,
  name,
  catalog: { cuts: [{ id: 'bob', name: { en: 'Bob' } }], shades: [{ id: 'caramel', name: { en: 'Caramel' } }] },
  polishes: [{ id: 'pol-1', name: 'Ruby', hex: '#B5121B' }],
  products: [{ id: 'p-cut', name: 'Haircut', priceOmr: 8.5 }, { id: 'p-color', name: 'Balayage', priceOmr: 45 }],
};
const visit = [
  { id: 'b', section: 'beard', status: 'approved', params: { styleId: 'sunnah' }, cutCard: { guards: { M: '#2' }, necklineMm: 25 }, approvals: { customerAt: 1, stylistAt: 1 } },
  { id: 'n', section: 'nails', status: 'draft', params: { base: { polishId: 'pol-1', hex: '#B5121B', finish: 'gloss' }, perFinger: { ring: { hex: '#FFFFFF', finish: 'shimmer' } }, shape: 'almond', art: 'french' } },
  { id: 'h', section: 'hair', status: 'done', params: { cutId: 'bob', shadeId: 'caramel', technique: 'balayage' }, agreement: { lengthDryCm: 30, priceItems: ['p-cut', 'p-color', 'unknown'] }, approvals: { customerAt: 1, stylistAt: 1 } },
  { id: 'x', section: 'nails', status: 'cancelled', params: {} },
];

describe('visitSummary', () => {
  const s = visitSummary(visit, ctx);
  it('orders hair, nails, beard and drops cancelled services', () => {
    expect(s.services.map((x) => x.section)).toEqual(['hair', 'nails', 'beard']);
  });
  it('prices come only from the salon list (unknown ids are ignored)', () => {
    expect(s.services[0].priceItems).toEqual([{ label: 'Haircut', priceOmr: 8.5 }, { label: 'Balayage', priceOmr: 45 }]);
    expect(s.totalOmr).toBe(53.5);
  });
  it('describes each service with its own lines', () => {
    expect(s.services[0].lines).toContain('visit.cut: Bob');
    expect(s.services[1].lines[0]).toBe('nails.all_nails: Ruby · nails.finish_gloss');
    expect(s.services[1].lines).toContain('nails.art: nails.art_french');
    expect(s.services[2].lines).toContain('visit.style: Sunnah beard');
    expect(s.services[2].approved).toBe(true);
    expect(s.services[1].approved).toBe(false);
  });
  it('WhatsApp text lists every service and the total', () => {
    const text = visitText(s, { t, name, salonName: 'Elite', sectionName: (x) => x, formatOmr: (v) => `${v} OMR` });
    expect(text).toContain('hair · visit.approved');
    expect(text).toContain('nails');
    expect(text).toContain('visit.total: 53.5 OMR');
  });
});
