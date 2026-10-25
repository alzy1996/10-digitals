import { describe, expect, it } from 'vitest';
import { DEMO_COUNTS, demoOps, fallbackParams, reverseStats, shopOps } from '../../src/services/seed.js';
import { DEFAULT_SETTINGS } from '../../src/services/model.js';
import { dayKey, lastNDayKeys } from '../../src/lib/time.js';

const STYLES = Array.from({ length: 8 }, (_, i) => ({
  id: `s${i}`,
  name: { en: `S${i}`, ar: `س${i}` },
  zones: { M: 6, S: 4, C: 10 + i, J_L: 8, J_R: 8, K_L: 6, K_R: 6, B_L: 4, B_R: 4, N: 0 },
  shape: { chin: 'round', fadeB: [2, 6] },
  lines: { cheek: 'natural', neckline: '2f', sideburn: 'blended', edge: 'soft', mustacheEdge: 'at' },
  mustacheId: null,
  order: 80 - i * 10,
  hidden: i === 7,
  theatrical: i === 6,
}));

const NOW = new Date('2026-10-25T09:00:00Z'); // 13:00 Muscat

function byKind(ops) {
  const out = { consultations: [], clients: [], stats: [], other: [] };
  for (const op of ops) {
    if (op.path.includes('/consultations/')) out.consultations.push(op);
    else if (op.path.includes('/clients/')) out.clients.push(op);
    else if (op.path.includes('/dailyStats/')) out.stats.push(op);
    else out.other.push(op);
  }
  return out;
}

describe('Create your shop seed', () => {
  const ops = shopOps({ shopId: 'sh', uid: 'u1', ownerName: 'Sam', ownerEmail: 'Sam@X.com', name: 'Brass', nameAr: 'نحاس', whatsapp: '91234567', styles: STYLES });

  it('writes the shop with default settings, Muscat time zone and schema 1', () => {
    const shop = ops.find((o) => o.path === 'shops/sh').data;
    expect(shop.timezone).toBe('Asia/Muscat');
    expect(shop.schemaVersion).toBe(1);
    expect(shop.languages).toEqual(['ar', 'en']);
    expect(shop.createdBy).toBe('u1');
    const { guardChart, whatsapp, ...rest } = shop.settings;
    const { guardChart: _g, whatsapp: _w, ...defaults } = DEFAULT_SETTINGS;
    expect(rest).toEqual(defaults);
    expect(shop.settings.aiPreview).toBe(false);
    expect(shop.settings.tryAtHome).toBe(true);
    expect(guardChart.length).toBeGreaterThan(5);
    expect(whatsapp).toBe('+96891234567');
  });

  it('makes me the owner and publishes the public info', () => {
    const staff = ops.find((o) => o.path === 'shops/sh/staff/u1').data;
    expect(staff).toMatchObject({ uid: 'u1', role: 'owner', active: true, email: 'sam@x.com', name: 'Sam' });
    const info = ops.find((o) => o.path === 'shops/sh/public/info').data;
    expect(info).toMatchObject({ name: 'Brass', nameAr: 'نحاس', tryAtHome: true, whatsapp: '+96891234567' });
  });

  it('seeds every style and never a product', () => {
    expect(ops.filter((o) => o.path.startsWith('shops/sh/styles/'))).toHaveLength(STYLES.length);
    expect(ops.some((o) => o.path.includes('/products'))).toBe(false);
  });
});

describe('demo data', () => {
  const demo = demoOps({ shopId: 'sh', uid: 'u1', styles: STYLES, now: NOW });
  const parts = byKind(demo.ops);
  const days = lastNDayKeys(7, NOW);

  it('has 3 demo clients and 8 demo consultations, all marked demo', () => {
    expect(DEMO_COUNTS).toEqual({ clients: 3, consultations: 8 });
    expect(parts.clients).toHaveLength(3);
    expect(parts.consultations).toHaveLength(8);
    for (const op of [...parts.clients, ...parts.consultations]) expect(op.data.demo).toBe(true);
    for (const c of parts.clients) {
      expect(c.data.displayName).toMatch(/تجريبي|Demo/);
      expect(c.data.phone).toBeNull();
    }
  });

  it('spreads consultations over the last 7 Muscat days, none in the future', () => {
    const keys = parts.consultations.map((c) => c.data.dayKey);
    expect(new Set(keys).size).toBe(7);
    for (const c of parts.consultations) {
      expect(days).toContain(c.data.dayKey);
      const started = c.data.startedAt.toDate();
      expect(started.getTime()).toBeLessThanOrEqual(NOW.getTime());
      expect(dayKey(started)).toBe(c.data.dayKey);
      if (c.data.approvedAt) expect(c.data.approvedAt.toDate().getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
  });

  it('uses visible, everyday styles and sells no add-ons', () => {
    for (const c of parts.consultations) {
      expect(['s6', 's7']).not.toContain(c.data.styleId);
      expect(c.data.addOns).toEqual([]);
      expect(c.data.params.styleId).toBe(c.data.styleId);
      if (c.data.decisionSeconds !== null) {
        expect(c.data.decisionSeconds).toBeGreaterThanOrEqual(0);
        expect(c.data.decisionSeconds).toBeLessThanOrEqual(3600);
      }
    }
  });

  it('links consultations to demo clients and keeps their last visit', () => {
    const ids = new Set(demo.clientIds);
    for (const c of parts.consultations) if (c.data.clientId) expect(ids.has(c.data.clientId)).toBe(true);
  });

  it('adds matching dailyStats increments, one doc per day', () => {
    expect(parts.stats).toHaveLength(7);
    const total = Object.values(demo.stats).reduce((n, d) => n + (d.consultations || 0), 0);
    const approvals = Object.values(demo.stats).reduce((n, d) => n + (d.approvals || 0), 0);
    const approvedDocs = parts.consultations.filter((c) => ['approved', 'done'].includes(c.data.status));
    expect(total).toBe(8);
    expect(approvals).toBe(approvedDocs.length);
    const seconds = Object.values(demo.stats).reduce((n, d) => n + (d.totalDecisionSeconds || 0), 0);
    expect(seconds).toBe(approvedDocs.reduce((n, c) => n + c.data.decisionSeconds, 0));
  });

  it('reverses exactly what it added', () => {
    const docs = parts.consultations.map((c) => c.data);
    const back = reverseStats(docs);
    for (const [key, d] of Object.entries(demo.stats)) {
      expect(back[key].consultations + d.consultations).toBe(0);
      expect((back[key].approvals || 0) + (d.approvals || 0)).toBe(0);
      expect((back[key].totalDecisionSeconds || 0) + (d.totalDecisionSeconds || 0)).toBe(0);
      for (const [styleId, n] of Object.entries(d.topStyles)) expect(back[key].topStyles[styleId] + n).toBe(0);
    }
  });

  it('keeps today\'s visit inside today right after Muscat midnight', () => {
    const justAfterMidnight = new Date('2026-10-25T20:10:00Z'); // 00:10 on Oct 26 in Muscat
    const d = demoOps({ shopId: 'sh', uid: 'u1', styles: STYLES, now: justAfterMidnight });
    const today = byKind(d.ops).consultations.filter((c) => c.data.dayKey === '2026-10-26');
    expect(today).toHaveLength(1);
    expect(dayKey(today[0].data.startedAt.toDate())).toBe('2026-10-26');
  });

  it('still seeds clients when the catalog is empty', () => {
    const d = demoOps({ shopId: 'sh', uid: 'u1', styles: [], now: NOW });
    expect(byKind(d.ops).clients).toHaveLength(3);
    expect(byKind(d.ops).consultations).toHaveLength(0);
  });

  it('builds look params from the style when no params helper is given', () => {
    const p = fallbackParams(STYLES[0]);
    expect(p).toMatchObject({ styleId: 's0', fadeStartMm: 2, finish: 'matte', colorId: null });
    expect(p.zones.C).toBe(10);
  });

  it('uses the params helper when it works and falls back when it throws', () => {
    const ok = demoOps({ shopId: 'sh', uid: 'u1', styles: STYLES, now: NOW, paramsFromStyle: (s) => ({ ...fallbackParams(s), finish: 'balm' }) });
    expect(byKind(ok.ops).consultations[0].data.params.finish).toBe('balm');
    const warn = console.warn;
    console.warn = () => {};
    try {
      const bad = demoOps({ shopId: 'sh', uid: 'u1', styles: STYLES, now: NOW, paramsFromStyle: () => { throw new Error('x'); } });
      expect(byKind(bad.ops).consultations[0].data.params.finish).toBe('matte');
    } finally {
      console.warn = warn;
    }
  });
});
