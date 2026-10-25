import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import en from '../../src/lib/i18n/en.json';
import ar from '../../src/lib/i18n/ar.json';

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(jsx?|json)$/.test(f) ? [p] : [];
  });
}
const SRC = files(new URL('../../src', import.meta.url).pathname);
const EMOJI = /\p{Extended_Pictographic}/u;

describe('i18n (Arabic default + English)', () => {
  it('both dictionaries have the same keys', () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
  });
  it('every static t("key") in src exists in both languages', () => {
    const missing = [];
    for (const f of SRC.filter((x) => /\.jsx?$/.test(x))) {
      const code = readFileSync(f, 'utf8');
      for (const m of code.matchAll(/\bt\(['"]([a-zA-Z0-9_.-]+)['"]/g)) if (!(m[1] in en) || !(m[1] in ar)) missing.push(`${m[1]} (${f.split('/src/')[1]})`);
    }
    expect(missing).toEqual([]);
  });
  it('dynamic key families are complete', () => {
    const families = {
      shape: ['oval', 'round', 'square', 'oblong', 'heart', 'diamond', 'triangle'],
      undertone: ['warm', 'cool', 'neutral', 'olive'],
      eyes: ['dark-brown', 'brown', 'hazel', 'green', 'blue', 'grey'],
      texture: ['straight', 'wavy', 'curly', 'coily'],
      density: ['fine', 'medium', 'thick'],
      band: ['very-short', 'short', 'jaw', 'chin', 'collarbone', 'shoulder', 'long', 'very-long', 'any'],
      process: ['deposit-only', 'lift-color', 'high-lift', 'lightener', 'correction', 'blocked'],
      test: ['strand', 'metallic', 'patch'],
      role: ['owner', 'manager', 'stylist'],
      category: ['service', 'color', 'treatment', 'retail', 'other'],
      finish: ['glossy', 'satin', 'matte', 'pearl'],
      shot: ['front', 'left', 'right', 'back'],
      analysis: ['face', 'hair', 'color', 'level', 'age', 'preview'],
      block: ['metallic_positive', 'henna_lift'],
      'catalog.kind': ['cuts', 'fringes', 'styles', 'shades', 'techniques', 'looks'],
      'color.panel': ['shade', 'technique', 'lift', 'regrowth'],
      'looks.tab': ['looks', 'cuts', 'colors'],
      'goals.change': ['cut', 'color', 'both', 'style'],
      henna: ['none', 'pure', 'compound', 'unsure'],
      recent: ['none', 'darker', 'lighter', 'unsure'],
      metallic: ['not-done', 'negative', 'positive'],
      upkeep: ['low', 'medium', 'high'],
      occasion: ['daily', 'events', 'wedding'],
      family: ['natural', 'brunette', 'cool', 'neutral', 'warm', 'red', 'metallic', 'pastel', 'vivid'],
      flag: ['previously-lightened', 'previous-darker'],
      nav: ['owner', 'dashboard', 'catalog', 'swatch', 'products', 'staff', 'settings', 'reports', 'chair'],
      fit: ['low', 'mid', 'high'],
      swatch: ['rows', 'cols'],
    };
    const missing = [];
    for (const [fam, ids] of Object.entries(families)) for (const id of ids) if (!(`${fam}.${id}` in en) || !(`${fam}.${id}` in ar)) missing.push(`${fam}.${id}`);
    expect(missing).toEqual([]);
  });
  it('pose and quality hints used by src/ai exist', () => {
    const ai = SRC.filter((f) => f.includes('/src/ai/')).map((f) => readFileSync(f, 'utf8')).join('\n');
    const keys = [...ai.matchAll(/'(capture\.[a-zA-Z]+)'/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(5);
    expect(keys.filter((k) => !(k in en) || !(k in ar))).toEqual([]);
  });
  it('Arabic strings are actually Arabic', () => {
    const notArabic = Object.entries(ar).filter(([k, v]) => !/[؀-ۿ]/.test(v) && !['agreement.pdf'].includes(k));
    expect(notArabic.map(([k]) => k)).toEqual([]);
  });
  it('no emoji anywhere in the UI source or data', () => {
    const hits = SRC.filter((f) => EMOJI.test(readFileSync(f, 'utf8').replace(/[©®™↔←→]/g, '')));
    expect(hits).toEqual([]);
  });
});
