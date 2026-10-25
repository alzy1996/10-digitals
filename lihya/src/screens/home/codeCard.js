// "Save as image" for the customer's Look Code (S22): a small card drawn on a canvas with
// the shop name, the code, the style name and the expiry date. Never a photo: only text.
// Colors come from the design tokens (PRD 9.1) so the card looks like the app.

import { downloadBlob } from '../../reports/csv.js';

const W = 1080;
const H = 1350;
const SIDE = 140;

const FALLBACK = Object.freeze({
  bg: '#0f1012',
  surface2: '#26292e',
  line: '#3a3e45',
  text: '#ede8df',
  text2: '#a7a39b',
  brass: '#c9a35b',
});
const TOKEN_VARS = Object.freeze({
  bg: '--bg',
  surface2: '--surface-2',
  line: '--line',
  text: '--text',
  text2: '--text-2',
  brass: '--brass',
});

const DISPLAY_AR = '"Reem Kufi", "IBM Plex Sans Arabic", sans-serif';
const DISPLAY_LATN = '"Barlow Condensed", "IBM Plex Sans Arabic", sans-serif';
const BODY = '"IBM Plex Sans Arabic", system-ui, sans-serif';
const MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace';

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

function isArabic(s) {
  return ARABIC.test(String(s || ''));
}

function palette() {
  const out = { ...FALLBACK };
  try {
    const cs = getComputedStyle(document.documentElement);
    for (const [k, v] of Object.entries(TOKEN_VARS)) {
      const val = cs.getPropertyValue(v).trim();
      if (val) out[k] = val;
    }
  } catch {
    // keep the dark defaults
  }
  return out;
}

/** Wait (at most 2.5 s) for the app fonts, including their Arabic subsets, so the canvas uses them. */
async function fontsReady() {
  if (typeof document === 'undefined' || !document.fonts || typeof document.fonts.load !== 'function') return;
  const sample = 'لحية LIHYA 0123';
  const loads = [
    '600 64px "Reem Kufi"',
    '600 64px "Barlow Condensed"',
    '400 32px "IBM Plex Sans Arabic"',
    '600 32px "IBM Plex Sans Arabic"',
  ].map((f) => document.fonts.load(f, sample).catch(() => null));
  let timer;
  await Promise.race([Promise.all(loads), new Promise((r) => (timer = setTimeout(r, 2500)))]);
  clearTimeout(timer);
}

function setFont(ctx, weight, size, family) {
  ctx.font = `${weight} ${size}px ${family}`;
}

/** Shrink the font until the text fits in maxWidth (never under `min`). Returns the size used. */
function fit(ctx, str, weight, size, family, maxWidth, min = 22) {
  let s = size;
  setFont(ctx, weight, s, family);
  while (s > min && ctx.measureText(str).width > maxWidth) {
    s -= 2;
    setFont(ctx, weight, s, family);
  }
  return s;
}

function line(ctx, str, { y, size, weight = 400, family = BODY, color, maxWidth = W - 2 * SIDE, spacing = 0 }) {
  if (!str) return;
  ctx.direction = isArabic(str) ? 'rtl' : 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  if ('letterSpacing' in ctx) ctx.letterSpacing = isArabic(str) ? '0px' : `${spacing}px`;
  fit(ctx, str, weight, size, family, maxWidth);
  ctx.fillText(str, W / 2, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

function displayFamily(str) {
  return isArabic(str) ? DISPLAY_AR : DISPLAY_LATN;
}

/** Break a sentence into lines that fit maxWidth (at the current font). */
function wrap(ctx, str, maxWidth) {
  const words = String(str || '')
    .split(/\s+/)
    .filter(Boolean);
  const lines = [];
  let current = '';
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (current && ctx.measureText(next).width > maxWidth) {
      lines.push(current);
      current = w;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hairline(ctx, x1, x2, y, color, width = 2, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

function toBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('empty image'))), 'image/png');
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Draw the Look Code card and resolve a PNG Blob (1080 x 1350).
 * texts: { shop, shopOther, label, code, style, styleOther, expires, show, brand } (already translated).
 */
export async function lookCodeCardBlob(texts) {
  if (typeof document === 'undefined') throw new Error('no document');
  await fontsReady();
  const c = palette();
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');

  try {
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, W, H);

    // Double brass frame, like a shop sign.
    ctx.save();
    ctx.strokeStyle = c.brass;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 3;
    ctx.strokeRect(40, 40, W - 80, H - 80);
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.strokeRect(58, 58, W - 116, H - 116);
    ctx.restore();

    // Shop
    const shop = texts.shop || texts.brand || '';
    line(ctx, shop, { y: 200, size: 80, weight: 600, family: displayFamily(shop), color: c.text });
    if (texts.shopOther && texts.shopOther !== shop) {
      line(ctx, texts.shopOther, { y: 262, size: 38, weight: 600, family: displayFamily(texts.shopOther), color: c.brass, spacing: 4 });
    }
    hairline(ctx, W / 2 - 110, W / 2 + 110, 318, c.brass, 2, 0.8);

    // The code: six boxes, always left to right.
    line(ctx, texts.label, { y: 412, size: 34, weight: 600, color: c.text2, spacing: 3 });
    const chars = String(texts.code || '').split('');
    const boxW = 136;
    const boxH = 184;
    const gap = 18;
    const total = chars.length * boxW + Math.max(0, chars.length - 1) * gap;
    const x0 = (W - total) / 2;
    const y0 = 452;
    ctx.direction = 'ltr';
    chars.forEach((ch, i) => {
      const x = x0 + i * (boxW + gap);
      roundRect(ctx, x, y0, boxW, boxH, 18);
      ctx.fillStyle = c.surface2;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = c.brass;
      ctx.stroke();
      ctx.fillStyle = c.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      setFont(ctx, 700, 116, MONO);
      ctx.fillText(ch, x + boxW / 2, y0 + boxH / 2 + 6);
    });

    // The style
    if (texts.style) {
      line(ctx, texts.style, { y: 760, size: 60, weight: 600, family: displayFamily(texts.style), color: c.text });
    }
    if (texts.styleOther && texts.styleOther !== texts.style) {
      line(ctx, texts.styleOther, { y: 816, size: 34, family: displayFamily(texts.styleOther), color: c.text2 });
    }
    line(ctx, texts.expires, { y: 900, size: 34, color: c.text2 });

    hairline(ctx, SIDE, W - SIDE, 958, c.line, 2);

    // How to use it
    if (texts.show) {
      ctx.direction = isArabic(texts.show) ? 'rtl' : 'ltr';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = c.text;
      setFont(ctx, 400, 38, BODY);
      wrap(ctx, texts.show, W - 2 * SIDE)
        .slice(0, 3)
        .forEach((l, i) => ctx.fillText(l, W / 2, 1040 + i * 56));
    }

    line(ctx, texts.brand, { y: H - 118, size: 32, weight: 600, family: DISPLAY_LATN, color: c.brass, spacing: 6 });

    return await toBlob(canvas);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function isIos() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Save the card. On iPhone the share sheet ("Save Image" puts it in Photos); elsewhere a
 * download. Call it straight from the tap. Resolves 'shared' | 'downloaded' | 'cancelled' | 'failed'.
 */
export async function saveCardImage(blob, filename) {
  if (!blob) return 'failed';
  if (isIos() && typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
    let file = null;
    try {
      file = new File([blob], filename, { type: 'image/png' });
    } catch {
      file = null;
    }
    let shareable = false;
    try {
      shareable = Boolean(file) && navigator.canShare({ files: [file] });
    } catch {
      shareable = false;
    }
    if (shareable) {
      try {
        await navigator.share({ files: [file] });
        return 'shared';
      } catch (err) {
        if (err && err.name === 'AbortError') return 'cancelled';
        console.warn('Look Code image: share failed, downloading instead', err);
      }
    }
  }
  return downloadBlob(blob, filename) ? 'downloaded' : 'failed';
}
