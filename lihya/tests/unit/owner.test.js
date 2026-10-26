// Owner screens: the AI card's numbers (Worker count vs the shop's estimate), the clients CSV
// import view, and the signature editor's "may step back" rule.
import { describe, it, expect } from 'vitest';
import { aiUsage, clientImportView, clientPhones, isCsvFile } from '../../src/screens/owner/util.js';
import { canStepBack } from '../../src/screens/manage/util.js';
import { parseClientsCsv } from '../../src/reports/csv.js';

describe('aiUsage (owner dashboard AI card)', () => {
  const quota = { usedToday: 7, cap: 20, accountUsed: 41, accountCap: 100, enabled: true, allowed: true, day: '2026-10-26', resetsAt: '2026-10-27T00:00:00.000Z' };

  it("shows the Worker's own count and cap (UTC day) whenever the Worker answered", () => {
    // The Muscat-day stats say 12 (renders made 00:00-04:00 Muscat belong to the previous UTC day).
    const u = aiUsage({ quota, statsRenders: 12, settingsCap: 25 });
    expect(u).toEqual({ used: 7, cap: 20, source: 'worker', account: { used: 41, cap: 100 }, notAllowed: false });
  });

  it('falls back to the settings cap when the Worker does not say its cap', () => {
    const u = aiUsage({ quota: { ...quota, cap: null }, statsRenders: 3, settingsCap: 25 });
    expect(u.used).toBe(7);
    expect(u.cap).toBe(25);
    expect(u.source).toBe('worker');
  });

  it('uses the shop count as an estimate only when there is no Worker answer', () => {
    expect(aiUsage({ quota: null, statsRenders: 12, settingsCap: 25 })).toEqual({
      used: 12,
      cap: 25,
      source: 'estimate',
      account: null,
      notAllowed: false,
    });
    // An answer without a usable count is not the Worker's number either.
    const broken = aiUsage({ quota: { ...quota, usedToday: null }, statsRenders: 4, settingsCap: '30' });
    expect(broken.source).toBe('estimate');
    expect(broken.used).toBe(4);
    expect(broken.cap).toBe(30);
    expect(broken.account).toEqual({ used: 41, cap: 100 });
  });

  it('flags a shop the Worker does not allow (cap 0)', () => {
    const u = aiUsage({ quota: { ...quota, usedToday: 0, cap: 0, allowed: false }, statsRenders: 0, settingsCap: 20 });
    expect(u.notAllowed).toBe(true);
    expect(u.cap).toBe(0);
  });

  it('never shows a broken number', () => {
    const u = aiUsage({ quota: undefined, statsRenders: 'x', settingsCap: -3 });
    expect(u).toEqual({ used: 0, cap: 0, source: 'estimate', account: null, notAllowed: false });
    expect(aiUsage()).toEqual({ used: 0, cap: 0, source: 'estimate', account: null, notAllowed: false });
  });
});

describe('clients CSV import (S20)', () => {
  it('accepts CSV files by name or type', () => {
    expect(isCsvFile({ name: 'clients.CSV', type: '' })).toBe(true);
    expect(isCsvFile({ name: 'export', type: 'text/csv' })).toBe(true);
    expect(isCsvFile({ name: 'clients', type: 'text/plain' })).toBe(true);
    expect(isCsvFile({ name: 'clients.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })).toBe(false);
    expect(isCsvFile(null)).toBe(false);
  });

  it("reads the shop's phones, skipping clients without one", () => {
    expect(clientPhones([{ phone: '+96891234567' }, { phone: null }, null, { displayName: 'x' }, { phone: '+96892222222' }])).toEqual([
      '+96891234567',
      '+96892222222',
    ]);
    expect(clientPhones(undefined)).toEqual([]);
  });

  it('counts ready rows, phones already in the shop or the file, and problems', () => {
    const text = [
      'displayName,phone',
      'Salim,91234567', // already in the shop
      'Hamad,+968 9222 2222',
      'Khalid,92222222', // same phone earlier in the file
      ',93333333', // no name
      'Said,123', // bad phone
      'Nasser,94444444',
    ].join('\n');
    const parsed = parseClientsCsv(text, clientPhones([{ phone: '+96891234567' }]));
    const view = clientImportView(parsed);
    expect(view.counts).toEqual({ total: 6, ready: 2, duplicates: 2, problems: 2 });
    expect(view.headerError).toBe(false);
    expect(view.noHeader).toBe(false);
    expect(view.empty).toBe(false);
    expect(view.preview).toHaveLength(6);

    const skipped = clientImportView(parsed, 'skipped');
    expect(skipped.preview.map((p) => p.row)).toEqual([2, 4, 5, 6]);
    expect(skipped.preview.every((p) => !p.ok && p.reasons.length > 0)).toBe(true);
    const dup = skipped.preview.find((p) => p.row === 2);
    expect(dup.skipped).toBe(true);
    expect(dup.reasons).toEqual(['report.csv.reason.duplicatePhone']);
  });

  it('re-reads the Clients CSV export (translated headers)', () => {
    const text = '﻿الاسم,الهاتف,آخر زيارة\r\nسالم,96891234567,2026-10-01\r\n';
    const view = clientImportView(parseClientsCsv(text, []));
    expect(view.counts.ready).toBe(1);
    expect(view.noHeader).toBe(false);
  });

  it('tells a missing column, an empty file and a file without a header apart', () => {
    const header = clientImportView(parseClientsCsv('displayName,email\nSalim,a@b.c\n', []));
    expect(header.headerError).toBe(true);
    expect(header.counts.problems).toBe(0);
    expect(header.empty).toBe(false);

    const empty = clientImportView(parseClientsCsv('displayName,phone\n', []));
    expect(empty.empty).toBe(true);

    const bare = clientImportView(parseClientsCsv('Salim,91234567\n', []));
    expect(bare.noHeader).toBe(true);
    expect(bare.counts.ready).toBe(1);

    expect(clientImportView(null).empty).toBe(true);
  });
});

describe('canStepBack (signature editor close)', () => {
  it('steps back only when the list opened the editor inside this app', () => {
    expect(canStepBack({ fromList: true }, { idx: 2, key: 'a' })).toBe(true);
    expect(canStepBack({ fromList: true }, { idx: 0 })).toBe(false); // deep link, nothing of ours behind
    expect(canStepBack({ fromList: true }, null)).toBe(false);
    expect(canStepBack({ fromList: true }, { usr: { fromList: true } })).toBe(false);
    expect(canStepBack(null, { idx: 3 })).toBe(false);
    expect(canStepBack({}, { idx: 3 })).toBe(false);
  });
});
