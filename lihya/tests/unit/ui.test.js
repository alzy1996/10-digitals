// UI kit: pure helpers, the icon sprite, the Zone Diagram geometry and static renders of the
// pure-SVG components (they must work outside the app providers, inside the Cut Card PDF).
import { describe, it, expect, beforeAll, vi } from 'vitest';
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

// Network and queued-write state for the SyncBadge renders (the real hooks need a browser and Firestore).
const net = vi.hoisted(() => ({ online: true, pending: 0 }));
vi.mock('../../src/hooks/useOnline.js', () => ({
  useOnline: () => net.online,
  usePendingWrites: () => net.pending,
  default: () => net.online,
}));

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

  it('writes one percent sign, the Latin one, in Arabic too', () => {
    const ring = renderToStaticMarkup(React.createElement(Ring, { value: 64, label: 'قابلية النمو', lang: 'ar' }));
    expect(ring).toContain('قابلية النمو: 64%');
    expect(ring).not.toContain('٪');
  });
});

describe('status text contrast (PRD 9.1: WCAG AA in both themes)', () => {
  const css = read('src/styles/tokens.css');
  const block = (selector) => {
    const start = css.indexOf(selector);
    return css.slice(start, css.indexOf('}', start));
  };
  const tokens = (text) => Object.fromEntries([...text.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2]]));
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const lum = (c) => {
    const [r, g, b] = c.map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const tint = (fg, bg, alpha) => fg.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha)));
  const themes = { dark: tokens(block(':root,')), light: { ...tokens(block(':root,')), ...tokens(block("[data-theme='light']")) } };

  it('every status ink reads at 4.5:1 or more on each surface and on its own 10% tint', () => {
    const low = [];
    for (const [theme, tk] of Object.entries(themes)) {
      for (const tone of ['keep', 'cut', 'warn', 'info']) {
        const ink = rgb(tk[`${tone}-ink`]);
        for (const surface of ['bg', 'surface', 'surface-2']) {
          const back = rgb(tk[surface]);
          for (const [label, bg] of [[surface, back], [`${tone}/10 on ${surface}`, tint(rgb(tk[tone]), back, 0.1)]]) {
            const r = ratio(ink, bg);
            if (r < 4.5) low.push(`${theme} ${tone}-ink on ${label}: ${r.toFixed(2)}`);
          }
        }
      }
    }
    expect(low).toEqual([]);
  });

  it('keeps the rgb triplets in step with the hex tokens', () => {
    for (const [theme, tk] of Object.entries(themes)) {
      for (const tone of ['keep', 'cut', 'warn', 'info']) {
        const sel = theme === 'dark' ? ':root,' : "[data-theme='light']";
        const m = new RegExp(`--${tone}-ink-rgb:\\s*(\\d+) (\\d+) (\\d+);`).exec(block(sel));
        expect(m, `${theme} ${tone}-ink-rgb`).not.toBe(null);
        expect(m.slice(1).map(Number), `${theme} ${tone}`).toEqual(rgb(tk[`${tone}-ink`]));
      }
    }
  });

  it('routes text-keep/cut/warn/info to the ink tokens and leaves fills on the PRD tokens', async () => {
    const cfg = (await import('../../tailwind.config.js')).default;
    for (const tone of ['keep', 'cut', 'warn', 'info']) {
      expect(cfg.theme.extend.textColor[tone]).toBe(`rgb(var(--${tone}-ink-rgb) / <alpha-value>)`);
      expect(cfg.theme.extend.colors[tone]).toBe(`rgb(var(--${tone}-rgb) / <alpha-value>)`);
      expect(cfg.theme.extend.colors[`${tone}-ink`]).toBe(`rgb(var(--${tone}-ink-rgb) / <alpha-value>)`);
    }
  });
});

describe('sync badge (PRD 10.4, 14.2)', () => {
  let SyncBadge;
  let SyncStrip;
  let syncBadgeState;
  let en;
  let ar;
  beforeAll(async () => {
    const mod = await import('../../src/components/SyncBadge.jsx');
    SyncBadge = mod.default;
    SyncStrip = mod.SyncStrip;
    syncBadgeState = mod.syncBadgeState;
    en = JSON.parse(read('src/lib/i18n/en.json'));
    ar = JSON.parse(read('src/lib/i18n/ar.json'));
  });

  const render = (online, pending, Comp = SyncBadge, props = {}) => {
    net.online = online;
    net.pending = pending;
    return renderToStaticMarkup(React.createElement(Comp, props));
  };
  // The phone copy: the visible lines below md (aria-hidden, md:hidden).
  const phoneText = (html) => {
    const m = /<span aria-hidden="true" class="[^"]*md:hidden[^"]*">([\s\S]*?)<\/span><span aria-hidden="true"/.exec(html);
    return m ? m[1].replace(/<[^>]+>/g, '|') : '';
  };

  it('shows the pending message whenever writes are queued, online or not', () => {
    expect(syncBadgeState({ online: true, pending: 0 })).toBe(null);
    expect(syncBadgeState({ online: false, pending: 0 })).toMatchObject({ kind: 'offline', full: ['common.offline'] });
    expect(syncBadgeState({ online: true, pending: 2 })).toMatchObject({ kind: 'pending', full: ['common.pendingSync'] });
    expect(syncBadgeState({ online: false, pending: 2 })).toMatchObject({
      kind: 'offline-pending',
      full: ['common.offline', 'common.pendingSync'],
      short: ['common.offline', 'ui.sync.savedShort'],
    });
  });

  it('offline with queued writes: the reassurance is visible on phones and read in full', () => {
    const html = render(false, 2);
    expect(html).toContain(`${ar['common.offline']} · ${ar['common.pendingSync']}`);
    const phone = phoneText(html);
    expect(phone).toContain(ar['common.offline']);
    expect(phone).toContain('محفوظ، ستتم المزامنة');
    expect(phone).not.toContain('sr-only');
  });

  it('online with queued writes: visible on phones too, never icon-only', () => {
    const html = render(true, 3);
    expect(html).toContain(ar['common.pendingSync']);
    expect(phoneText(html)).toContain('محفوظ، ستتم المزامنة');
    expect(html).not.toContain(ar['common.offline']);
  });

  it('offline with nothing queued: Offline only; synced: an empty live region', () => {
    const offline = render(false, 0);
    expect(offline).toContain(ar['common.offline']);
    expect(offline).not.toContain(ar['common.pendingSync']);
    const synced = render(true, 0);
    expect(synced).toContain('role="status"');
    expect(synced).not.toContain(ar['common.offline']);
    expect(synced).not.toContain(ar['common.pendingSync']);
    expect(en['common.pendingSync']).toBe('Saved on this phone, will sync');
  });

  it('colors the badge text with the AA ink tokens', () => {
    expect(render(false, 1)).toContain('text-warn-ink');
    expect(render(true, 1)).toContain('text-info-ink');
  });

  it('in the top bar, phones get the offline message as a full line under the bar', () => {
    // The pill leaves the offline states to the strip below md, and keeps them from md up.
    const pill = render(false, 2, SyncBadge, { offlineStrip: true });
    expect(pill).toContain('hidden md:inline-flex');
    expect(pill).toContain(`${ar['common.offline']} · ${ar['common.pendingSync']}`);
    // The brief online state stays in the bar on phones (no layout shift for each save).
    expect(render(true, 2, SyncBadge, { offlineStrip: true })).not.toContain('hidden md:inline-flex');
    const strip = render(false, 2, SyncStrip);
    expect(strip).toContain('role="status"');
    expect(strip).toContain('md:hidden');
    expect(strip).toContain(`<span>${ar['common.offline']} · ${ar['common.pendingSync']}</span>`);
    expect(strip).toContain('text-warn-ink');
    expect(render(false, 0, SyncStrip)).toContain(`<span>${ar['common.offline']}</span>`);
    expect(render(true, 2, SyncStrip)).not.toContain('data-sync');
    expect(render(true, 0, SyncStrip)).not.toContain('data-sync');
  });
});

describe('screen change motion (PRD 9.3)', () => {
  let mod;
  beforeAll(async () => {
    mod = await import('../../src/components/ScreenTransition.jsx');
  });

  it('reads the duration token', () => {
    expect(mod.parseDurationMs('320ms')).toBe(320);
    expect(mod.parseDurationMs(' 0.32s ')).toBeCloseTo(320);
    expect(mod.parseDurationMs('0ms')).toBe(0);
    expect(mod.parseDurationMs('')).toBe(0);
    expect(mod.parseDurationMs(undefined)).toBe(0);
  });

  it('runs 320 ms with the ease-out curve and leaves nothing applied afterwards', () => {
    const plan = mod.screenEnterAnimation({ navType: 'PUSH', rtl: false, durationMs: 320, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    expect(plan.options).toEqual({ duration: 320, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'none' });
    expect(plan.keyframes[0].opacity).toBe(0);
    expect(plan.keyframes.at(-1)).toEqual({ opacity: 1, transform: 'none' });
  });

  it('slides in from the end side, mirrored in RTL and reversed for Back', () => {
    const shift = (navType, rtl) => mod.screenEnterAnimation({ navType, rtl, durationMs: 320 }).keyframes[0].transform;
    const px = mod.SCREEN_SHIFT_PX;
    expect(shift('PUSH', false)).toBe(`translate3d(${px}px, 0, 0)`);
    expect(shift('PUSH', true)).toBe(`translate3d(${-px}px, 0, 0)`);
    expect(shift('POP', false)).toBe(`translate3d(${-px}px, 0, 0)`);
    expect(shift('POP', true)).toBe(`translate3d(${px}px, 0, 0)`);
    expect(shift('REPLACE', true)).toBeUndefined();
  });

  it('does not move at all with reduced motion or a zero duration', () => {
    expect(mod.screenEnterAnimation({ navType: 'PUSH', durationMs: 320, reducedMotion: true })).toBe(null);
    expect(mod.screenEnterAnimation({ navType: 'PUSH', durationMs: 0 })).toBe(null);
  });
});

describe('route error boundary', () => {
  let ErrorBoundary;
  beforeAll(async () => {
    ErrorBoundary = (await import('../../src/state/ErrorBoundary.jsx')).default;
  });

  it('clears the error when the route changes, and keeps one thrown on the new route', () => {
    const boom = new Error('boom');
    const crashed = { ...ErrorBoundary.getDerivedStateFromError(boom), resetKey: '/s/x/cut-card' };
    expect(crashed.error).toBe(boom);
    // Same route: the fallback stays.
    expect(ErrorBoundary.getDerivedStateFromProps({ resetKey: '/s/x/cut-card' }, crashed)).toBe(null);
    // Back to the Studio: the error clears and the new key is recorded.
    expect(ErrorBoundary.getDerivedStateFromProps({ resetKey: '/s/x/studio' }, crashed)).toEqual({ error: null, resetKey: '/s/x/studio' });
    // A screen that throws while the new route renders: the key is already recorded, so the error stays.
    const navigated = { error: null, resetKey: '/s/x/studio' };
    const thrownThere = { ...navigated, ...ErrorBoundary.getDerivedStateFromError(boom) };
    expect(ErrorBoundary.getDerivedStateFromProps({ resetKey: '/s/x/studio' }, thrownThere)).toBe(null);
  });

  it('renders the children until something throws', () => {
    const html = renderToStaticMarkup(React.createElement(ErrorBoundary, { resetKey: '/' }, React.createElement('p', null, 'screen')));
    expect(html).toBe('<p>screen</p>');
  });
});

describe('ui strings', () => {
  const ns = JSON.parse(read('src/lib/i18n/ns/ui.json'));
  const shared = { en: JSON.parse(read('src/lib/i18n/en.json')), ar: JSON.parse(read('src/lib/i18n/ar.json')) };
  // Demo mode strings (the Demo pill and its sheet) live in their own namespace.
  const demo = JSON.parse(read('src/lib/i18n/ns/demo.json'));

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
        const has = key in ns[lang] || key in shared[lang] || (key.startsWith('demo.') && key in demo[lang]);
        expect(has, `${lang}:${key}`).toBe(true);
      }
    }
  });
});
