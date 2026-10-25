// UI kit: pure helpers, the icon sprite, the Zone Diagram geometry and static renders of the
// pure-SVG components (they must work outside the app providers, inside the Cut Card PDF).
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  cx,
  snapToStep,
  ratioToValue,
  valueToRatio,
  stepDecimals,
  sanitizeCode,
  keypadLayout,
  ICON_NAMES,
  isMirroredIcon,
} from '../../src/components/kit.js';
import { zoneDiagramModel, zoneTone, stackLabels, ZD_ZONES } from '../../src/components/zoneDiagramGeometry.js';
import { LIMITS } from '../../src/config/app.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

// The test runner has no React plugin, so JSX compiles to React.createElement.
globalThis.React = React;

const REQUIRED_ICONS = (
  'camera face profile scissors razor guard ruler timeline compare share print whatsapp lock cloud globe settings ' +
  'user users plus minus undo check close chevron-left chevron-right chevron-down arrow-left arrow-right home ' +
  'dashboard catalog box report download upload search eye warning info sun moon logout mail google qr flash mirror ' +
  'palette drop clock calendar trash edit copy link wifi-off phone refresh grid list keypad hand bulb star-line dot'
).split(' ');

describe('kit helpers', () => {
  it('cx joins truthy parts', () => {
    expect(cx('a', false, null, 'b', undefined, 0, 'c')).toBe('a b c');
  });

  it('snaps to the step grid without float drift and clamps', () => {
    expect(snapToStep(6.26, 0, 30, 0.5)).toBe(6.5);
    expect(snapToStep(0.1 + 0.2, 0, 1, 0.1)).toBe(0.3);
    expect(snapToStep(-4, 0, 30, 0.5)).toBe(0);
    expect(snapToStep(99, 0, 30, 0.5)).toBe(30);
    expect(snapToStep(NaN, 2, 30, 1)).toBe(2);
    expect(stepDecimals(0.25)).toBe(2);
    expect(stepDecimals(1)).toBe(0);
  });

  it('maps track ratio to value and back', () => {
    expect(ratioToValue(0.75, 0, 30, 0.5)).toBe(22.5);
    expect(ratioToValue(-1, 0, 30, 0.5)).toBe(0);
    expect(ratioToValue(2, 0, 30, 0.5)).toBe(30);
    expect(valueToRatio(15, 0, 30)).toBe(0.5);
    expect(valueToRatio(5, 5, 5)).toBe(0);
  });

  it('sanitizes Look Codes: uppercase, alphabet only, max length, reports rejected characters', () => {
    expect(sanitizeCode('ab1cO')).toEqual({ value: 'ABC', rejected: ['1', 'O'] });
    expect(sanitizeCode(' k7m-2x9q ').value).toBe('K7M2X9');
    expect(sanitizeCode('0OI1').value).toBe('');
    expect(sanitizeCode('abc', 'ABC', 2).value).toBe('AB');
    for (const ch of '0O1I') expect(LIMITS.lookCodeAlphabet.includes(ch)).toBe(false);
  });

  it('lays the keypad out with the actions in the free slots', () => {
    // 32 keys in 6 columns leave 4 free slots: Paste 2 + Backspace 2.
    expect(keypadLayout(32, { cols: 6, paste: true }).actions).toEqual({ paste: 2, backspace: 2 });
    expect(keypadLayout(32, { cols: 6, paste: false }).actions).toEqual({ paste: 0, backspace: 4 });
    expect(keypadLayout(30, { cols: 6, paste: true }).actions).toEqual({ paste: 3, backspace: 3 });
    expect(keypadLayout(30, { cols: 6, paste: false }).actions).toEqual({ paste: 0, backspace: 6 });
  });

  it('mirrors only directional icons', () => {
    expect(isMirroredIcon('arrow-left')).toBe(true);
    expect(isMirroredIcon('chevron-right')).toBe(true);
    expect(isMirroredIcon('undo')).toBe(true);
    expect(isMirroredIcon('chevron-down')).toBe(false);
    expect(isMirroredIcon('search')).toBe(false);
  });
});

describe('icon sprite', () => {
  const sprite = read('public/icons/sprite.svg');
  const symbols = [...sprite.matchAll(/<symbol\b([^>]*)>([\s\S]*?)<\/symbol>/g)].map((m) => ({
    id: /id="([^"]+)"/.exec(m[1])[1],
    attrs: m[1],
    body: m[2],
  }));
  const ids = symbols.map((s) => s.id);

  it('has every required icon and every name Icon.jsx knows', () => {
    for (const name of REQUIRED_ICONS) expect(ids, name).toContain(name);
    for (const name of ICON_NAMES) expect(ids, name).toContain(name);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('draws every symbol on the 24 px grid as 1.5 px round line art without fills', () => {
    for (const s of symbols) {
      expect(s.attrs, s.id).toContain('viewBox="0 0 24 24"');
      expect(s.attrs, s.id).toContain('fill="none"');
      expect(s.attrs, s.id).toContain('stroke="currentColor"');
      expect(s.attrs, s.id).toContain('stroke-width="1.5"');
      expect(s.attrs, s.id).toContain('stroke-linecap="round"');
      expect(s.attrs, s.id).toContain('stroke-linejoin="round"');
      expect(s.body, s.id).not.toMatch(/\bfill="(?!none)/);
      expect(s.body, s.id).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    }
  });

  it('ships the favicon and the app icons the PWA manifest names', () => {
    const files = readdirSync(resolve(ROOT, 'public/icons'));
    for (const f of ['favicon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']) {
      expect(files).toContain(f);
    }
    const png = readFileSync(resolve(ROOT, 'public/icons/icon-512.png'));
    expect(png.readUInt32BE(16)).toBe(512);
    expect(png.readUInt32BE(20)).toBe(512);
    const apple = readFileSync(resolve(ROOT, 'public/icons/apple-touch-icon.png'));
    expect(apple.readUInt32BE(16)).toBe(180);
  });
});

function centroid(d) {
  const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
  let x = 0;
  let y = 0;
  let n = 0;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    x += nums[i];
    y += nums[i + 1];
    n += 1;
  }
  return [x / n, y / n];
}

describe('zone diagram geometry', () => {
  it('front view draws all ten zones with the customer’s left on the viewer’s right', () => {
    const m = zoneDiagramModel({ view: 'front', cheek: { type: 'natural' }, neckline: { type: '2f' } });
    for (const z of ZD_ZONES) expect(m.shapes[z], z).toBeTruthy();
    for (const base of ['J', 'K', 'B']) {
      expect(centroid(m.shapes[`${base}_L`])[0], base).toBeGreaterThan(150);
      expect(centroid(m.shapes[`${base}_R`])[0], base).toBeLessThan(150);
    }
    expect(m.anchors.K_L[0]).toBeGreaterThan(150);
    const sideL = m.sides.find((s) => s.key === 'L');
    expect(sideL.x).toBeGreaterThan(150);
    expect(m.edges.map((e) => e.id)).toEqual(['cheek_R', 'cheek_L', 'neckline']);
  });

  it('profile view shows one side; side R is the mirror image', () => {
    const l = zoneDiagramModel({ view: 'profile', side: 'L' });
    expect(l.shapes.K_L).toBeTruthy();
    expect(l.shapes.K_R).toBeUndefined();
    expect(l.mirrored).toBe(false);
    const r = zoneDiagramModel({ view: 'profile', side: 'R' });
    expect(r.shapes.K_R).toBeTruthy();
    expect(r.mirrored).toBe(true);
    // Labels are laid out in screen space: B_R sits on the left column when mirrored.
    expect(r.labels.find((x) => x.zone === 'B_R').column).toBe('left');
    expect(l.labels.find((x) => x.zone === 'B_L').column).toBe('right');
  });

  it('a jaw neckline leaves no neck zone; other necklines sit below the jaw', () => {
    expect(zoneDiagramModel({ neckline: { type: 'jaw' } }).shapes.N).toBeNull();
    const one = zoneDiagramModel({ neckline: { type: '1f' } }).meta.necklineY;
    const two = zoneDiagramModel({ neckline: { type: '2f' } }).meta.necklineY;
    expect(one).toBeGreaterThan(two); // 1 finger above the Adam's apple is lower on the neck than 2 fingers
    const fromMm = zoneDiagramModel({ neckline: { type: '2f', mmAboveAdamsApple: 20 } }).meta.necklineY;
    expect(fromMm).toBeGreaterThan(two);
  });

  it('cheek line follows type, offset and the Cut Card height above the jaw', () => {
    const y = (cheek) => zoneDiagramModel({ cheek }).meta.cheekStart[1];
    expect(y({ type: 'high' })).toBeLessThan(y({ type: 'natural' }));
    expect(y({ type: 'low' })).toBeGreaterThan(y({ type: 'medium' }));
    expect(y({ type: 'natural', offset: 1 })).toBeLessThan(y({ type: 'natural', offset: -1 }));
    expect(y({ type: 'natural', mmAboveJaw: 35 })).toBeGreaterThan(y({ type: 'natural', mmAboveJaw: 55 }));
    const yp = (cheek) => zoneDiagramModel({ view: 'profile', cheek }).meta.cheekStart[1];
    expect(yp({ type: 'natural', mmAboveJaw: 35 })).toBeGreaterThan(yp({ type: 'natural', mmAboveJaw: 55 }));
  });

  it('stacks labels at least 30 units apart inside the drawing', () => {
    for (const view of ['front', 'profile']) {
      const m = zoneDiagramModel({ view });
      for (const col of ['left', 'right']) {
        const ys = m.labels.filter((l) => l.column === col).map((l) => l.y).sort((a, b) => a - b);
        for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(30 - 1e-9);
        for (const v of ys) {
          expect(v).toBeGreaterThanOrEqual(20);
          expect(v).toBeLessThanOrEqual(345);
        }
      }
    }
    const pushed = stackLabels([{ y: 300 }, { y: 310 }, { y: 320 }, { y: 330 }], 52, 322);
    expect(pushed[pushed.length - 1].y).toBeLessThanOrEqual(322);
  });

  it('tones zones from the target length', () => {
    expect(zoneTone(6)).toBe('keep');
    expect(zoneTone(0)).toBe('cut');
    expect(zoneTone(undefined)).toBe('none');
    expect(zoneTone('')).toBe('none');
  });
});

describe('pure SVG components render without providers', () => {
  let ZoneDiagram;
  let BarberRuler;
  let Ring;
  let print;
  beforeAll(async () => {
    const zd = await import('../../src/components/ZoneDiagram.jsx');
    ZoneDiagram = zd.default;
    print = zd.ZONE_DIAGRAM_PRINT_PALETTE;
    BarberRuler = (await import('../../src/components/BarberRuler.jsx')).default;
    Ring = (await import('../../src/components/Ring.jsx')).default;
  });

  const params = {
    zones: { M: 6, S: 6, C: 15, J_L: 10, J_R: 10, K_L: 6, K_R: 6, B_L: 4.5, B_R: 4.5, N: 0 },
    lines: { cheek: 'natural', neckline: '2f' },
  };

  it('labels zones with mm and the guard from the chart, in the requested language', () => {
    const en = renderToStaticMarkup(React.createElement(ZoneDiagram, { params, lang: 'en' }));
    expect(en).toContain('<svg');
    expect(en).toContain('6 mm');
    expect(en).toContain('#2'); // 6 mm -> guard #2 in the default chart
    expect(en).toContain('#5'); // 15 mm -> #5
    expect(en).toContain('Shave'); // neck 0 mm
    expect(en).toContain('Keep');
    const ar = renderToStaticMarkup(React.createElement(ZoneDiagram, { params, lang: 'ar' }));
    expect(ar).toContain('6 مم');
    expect(ar).toContain('يسار');
    expect(ar).toContain('direction="rtl"');
  });

  it('uses the shop guard chart and the Cut Card rows when given', () => {
    const chart = [
      { id: 'a', label: { en: 'A-guard', ar: 'A-guard' }, mm: 5 },
      { id: 'b', label: { en: 'B-guard', ar: 'B-guard' }, mm: 12 },
    ];
    const html = renderToStaticMarkup(React.createElement(ZoneDiagram, { params, lang: 'en', guardChart: chart }));
    expect(html).toContain('A-guard');
    const cutCard = {
      rows: [{ zone: 'C', mm: 30, guard: { kind: 'scissor', guardId: null, label: { en: 'scissor, keep 30 mm', ar: '' }, mm: 30 } }],
      cheekLine: { type: 'straight', mmAboveJaw: 40 },
      neckline: { type: 'squared', fingers: 2, mmAboveAdamsApple: 35 },
    };
    const cc = renderToStaticMarkup(React.createElement(ZoneDiagram, { cutCard, lang: 'en', palette: print }));
    expect(cc).toContain('30 mm');
    expect(cc).toContain('Scissor');
    expect(cc).not.toContain('var(--');
  });

  it('hides labels on request and draws a profile', () => {
    const html = renderToStaticMarkup(React.createElement(ZoneDiagram, { params, view: 'profile', showLabels: false, lang: 'en' }));
    expect(html).not.toContain('6 mm</text>');
    expect(html).toContain('<path');
  });

  it('renders the ruler and the ring', () => {
    const ruler = renderToStaticMarkup(React.createElement(BarberRuler, { mm: 12, maxMm: 30, lang: 'en' }));
    expect(ruler).toContain('Ruler at 12 mm');
    expect((ruler.match(/<line /g) || []).length).toBeGreaterThan(30);
    const ring = renderToStaticMarkup(React.createElement(Ring, { value: 78, label: 'Grow-ability', lang: 'en' }));
    expect(ring).toContain('Grow-ability: 78%');
  });
});

describe('ui strings', () => {
  const ns = JSON.parse(read('src/lib/i18n/ns/ui.json'));
  const shared = { en: JSON.parse(read('src/lib/i18n/en.json')), ar: JSON.parse(read('src/lib/i18n/ar.json')) };

  it('has the same ui.* keys in both languages, without emoji', () => {
    const en = Object.keys(ns.en).sort();
    const ar = Object.keys(ns.ar).sort();
    expect(ar).toEqual(en);
    for (const k of en) expect(k.startsWith('ui.')).toBe(true);
    const emoji = /\p{Extended_Pictographic}/u;
    for (const lang of ['en', 'ar']) for (const v of Object.values(ns[lang])) expect(emoji.test(v), v).toBe(false);
  });

  it('every key the components use exists', () => {
    const dir = resolve(ROOT, 'src/components');
    const files = readdirSync(dir).filter((f) => /\.(jsx|js)$/.test(f));
    const used = new Set();
    for (const f of files) {
      const src = readFileSync(resolve(dir, f), 'utf8');
      for (const m of src.matchAll(/\bt\('([a-zA-Z0-9_.+-]+)'/g)) used.add(m[1]);
      for (const m of src.matchAll(/label: '((?:ui|common)\.[a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(20);
    for (const key of used) {
      for (const lang of ['en', 'ar']) {
        const has = key in ns[lang] || key in shared[lang];
        expect(has, `${lang}:${key}`).toBe(true);
      }
    }
  });
});
