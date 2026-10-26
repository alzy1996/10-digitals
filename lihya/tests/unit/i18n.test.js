import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { formatPercent } from '../../src/lib/format.js';

// Every string the UI shows must exist in Arabic and English (Arabic is the default).
const ROOT = new URL('../../', import.meta.url).pathname;
const I18N = join(ROOT, 'src/lib/i18n');

function load() {
  const dict = {
    ar: JSON.parse(readFileSync(join(I18N, 'ar.json'), 'utf8')),
    en: JSON.parse(readFileSync(join(I18N, 'en.json'), 'utf8')),
  };
  const files = { 'ar.json': Object.keys(dict.ar), 'en.json': Object.keys(dict.en) };
  for (const f of readdirSync(join(I18N, 'ns'))) {
    if (!f.endsWith('.json')) continue;
    const ns = JSON.parse(readFileSync(join(I18N, 'ns', f), 'utf8'));
    Object.assign(dict.ar, ns.ar || {});
    Object.assign(dict.en, ns.en || {});
    files[`ns/${f}`] = { ar: Object.keys(ns.ar || {}), en: Object.keys(ns.en || {}) };
  }
  return { dict, files };
}

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(js|jsx)$/.test(n) ? [p] : [];
  });
}

const { dict, files } = load();

describe('i18n', () => {
  it('every namespace file has the same keys in ar and en', () => {
    const problems = [];
    for (const [name, v] of Object.entries(files)) {
      if (Array.isArray(v)) continue;
      const ar = new Set(v.ar);
      const en = new Set(v.en);
      for (const k of ar) if (!en.has(k)) problems.push(`${name}: ${k} missing in en`);
      for (const k of en) if (!ar.has(k)) problems.push(`${name}: ${k} missing in ar`);
    }
    const ar = new Set(files['ar.json']);
    for (const k of files['en.json']) if (!ar.has(k)) problems.push(`en.json key ${k} missing in ar.json`);
    for (const k of files['ar.json']) if (!files['en.json'].includes(k)) problems.push(`ar.json key ${k} missing in en.json`);
    expect(problems).toEqual([]);
  });

  it('every literal t() / translate() key used in src exists in both languages', () => {
    const missing = [];
    const re = /\b(?:t|translate\(\s*[A-Za-z_.]+\s*,)\s*\(?\s*['"]([a-zA-Z][\w-]*(?:\.[\w+-]+)+)['"]/g;
    for (const file of walk(join(ROOT, 'src'))) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(re)) {
        const key = m[1];
        if (!(key in dict.en) || !(key in dict.ar)) missing.push(`${relative(ROOT, file)}: ${key}`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  it('no emoji in any UI string', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;
    const bad = [];
    for (const lang of ['ar', 'en']) for (const [k, v] of Object.entries(dict[lang])) if (emoji.test(String(v))) bad.push(`${lang}:${k}`);
    expect(bad).toEqual([]);
  });

  it('one percent sign: the Latin %, in Arabic too (digits are Latin)', () => {
    expect(formatPercent(64, 'ar')).toBe('64%');
    expect(formatPercent(64, 'en')).toBe('64%');
    expect(formatPercent(49.6, 'ar')).toBe('50%');
    // Every string in every file (shared and namespaces), so no screen or report prints '٪'.
    const bad = [];
    for (const lang of ['ar', 'en']) {
      for (const [k, v] of Object.entries(dict[lang])) if (String(v).includes('\u066A')) bad.push(`${lang}:${k}`);
    }
    expect(bad).toEqual([]);
  });

  it('placeholders match between languages', () => {
    const vars = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    const bad = [];
    for (const k of Object.keys(dict.en)) if (k in dict.ar && vars(dict.en[k]) !== vars(dict.ar[k])) bad.push(k);
    expect(bad).toEqual([]);
  });
});
