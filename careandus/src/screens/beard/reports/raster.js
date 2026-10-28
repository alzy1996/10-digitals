// Arabic-safe documents (PRD 11): every printable output is built as a print-styled
// DOM node, rasterized at 2x with html2canvas (the browser shapes the Arabic text),
// and the image is placed in jsPDF. jsPDF font shaping is never used. window.print()
// prints the same node with print CSS. html2canvas and jsPDF load lazily (the 'pdf'
// chunk), so they cost nothing until the first export.

import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { APP } from '../lib/config.js';

export const RASTER_SCALE = 2;

/** Fonts the documents use; loaded before mounting so canvas text (charts) uses them too. */
const FONT_SPECS = [
  '400 14px "IBM Plex Sans Arabic"',
  '500 14px "IBM Plex Sans Arabic"',
  '600 14px "IBM Plex Sans Arabic"',
  '700 14px Amiri',
  '600 14px Fraunces',
];
const FONT_SAMPLE = 'لحية LIHYA 0123456789';
const WAIT_FONTS_MS = 4000;
const WAIT_IMAGES_MS = 5000;

/** Page sizes in mm (portrait). */
export const PAGE = Object.freeze({
  a6: Object.freeze({ w: 105, h: 148 }),
  a4: Object.freeze({ w: 210, h: 297 }),
});

function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextFrame() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 16);
  });
}

/** Wait (bounded) until the document fonts are loaded. */
export async function waitForFonts() {
  const fonts = typeof document !== 'undefined' ? document.fonts : null;
  if (!fonts || typeof fonts.load !== 'function') return;
  const loads = FONT_SPECS.map((spec) => fonts.load(spec, FONT_SAMPLE).catch(() => []));
  await Promise.race([Promise.all(loads).then(() => fonts.ready), timeout(WAIT_FONTS_MS)]);
}

async function waitForImages(root) {
  const imgs = [...root.querySelectorAll('img')];
  await Promise.race([
    Promise.all(
      imgs.map((img) => {
        if (img.complete && img.naturalWidth) return Promise.resolve();
        return typeof img.decode === 'function'
          ? img.decode().catch(() => undefined)
          : new Promise((resolve) => {
              img.addEventListener('load', resolve, { once: true });
              img.addEventListener('error', resolve, { once: true });
            });
      }),
    ),
    timeout(WAIT_IMAGES_MS),
  ]);
}

/**
 * Mount a React element off-screen at a fixed CSS width, wait for fonts and images,
 * and call `work(node)`; always unmounts. `lang` sets dir/lang on the host.
 */
export async function withMounted(element, { width, lang = 'ar' }, work) {
  await waitForFonts();
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  host.setAttribute('lang', lang);
  host.dataset.theme = 'light';
  Object.assign(host.style, {
    position: 'absolute',
    top: '0',
    // Off screen on the side the page cannot scroll to (left in LTR, right in RTL).
    left: document.documentElement.dir === 'rtl' ? `calc(100vw + 2000px)` : `-${width + 2000}px`,
    width: `${width}px`,
    pointerEvents: 'none',
    zIndex: '-1',
  });
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(element));
    await waitForImages(host);
    await nextFrame();
    await nextFrame();
    return await work(host.firstElementChild || host);
  } finally {
    root.unmount();
    host.remove();
  }
}

/** Gap (CSS px) kept above a block when a page ends just before it. */
export const BREAK_ABOVE_PX = 2;

/**
 * Safe page breaks (CSS px from the top of `node`) from its [data-pdf-block] elements:
 * each block's bottom edge, and just above its top edge, so a page can end between two
 * table rows (every row is a block) as well as after a whole section. Sorted, unique.
 */
export function blockBreaks(node) {
  const top = node.getBoundingClientRect().top;
  const out = new Set();
  for (const el of node.querySelectorAll('[data-pdf-block]')) {
    const r = el.getBoundingClientRect();
    out.add(Math.round(r.bottom - top));
    out.add(Math.round(r.top - top - BREAK_ABOVE_PX));
  }
  return [...out].filter((y) => y > 0).sort((a, b) => a - b);
}

// html2canvas 1.4.1 finds each font's baseline with a probe it appends to the page's own
// <body>: <div style="visibility: hidden"> holding a <span> and a 1 x 1 <img> on the
// baseline (FontMetrics.parseMetrics). Tailwind's preflight makes every img a block, so
// the probe image drops to the next line, the baseline comes out about one line too low
// and every text run is drawn ~8 CSS px under its DOM box: table borders cut through the
// text and page breaks taken from the DOM slice the last row (chair:F2). While a
// document is rasterized, this rule puts the probe image back inline.
export const H2C_PROBE_FIX_ID = 'lihya-h2c-probe-fix';
export const H2C_PROBE_FIX_CSS =
  'body > div[style*="visibility: hidden"] > img { display: inline !important; width: 1px !important; height: 1px !important; max-width: none !important; }';
let probeFixUsers = 0;

/** Add the probe fix (counted, so overlapping exports share one style element). */
export function addProbeFix(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || !doc.head) return () => {};
  probeFixUsers += 1;
  if (!doc.getElementById(H2C_PROBE_FIX_ID)) {
    const style = doc.createElement('style');
    style.id = H2C_PROBE_FIX_ID;
    style.textContent = H2C_PROBE_FIX_CSS;
    doc.head.appendChild(style);
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    probeFixUsers = Math.max(0, probeFixUsers - 1);
    if (probeFixUsers === 0) doc.getElementById(H2C_PROBE_FIX_ID)?.remove();
  };
}

/** html2canvas at RASTER_SCALE with the options every document needs. */
export async function rasterize(node, { background = '#FFFFFF', scale = RASTER_SCALE } = {}) {
  const { default: html2canvas } = await import('html2canvas');
  const rect = node.getBoundingClientRect();
  const removeFix = addProbeFix();
  try {
    return await html2canvas(node, {
      scale,
      // Never clone the dev-server error overlay into a PDF.
      ignoreElements: (el) => el.tagName === 'VITE-ERROR-OVERLAY',
      backgroundColor: background,
      useCORS: true,
      logging: false,
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
      windowWidth: Math.max(Math.ceil(rect.width), 360),
      scrollX: 0,
      scrollY: 0,
    });
  } finally {
    removeFix();
  }
}

/**
 * Page ranges (CSS px) for a document of `total` height: each page holds at most
 * `firstPage` / `nextPages` px and ends on a block break when one falls in its last
 * 70 %; otherwise it is cut at the page height.
 */
export function paginate(total, breaks, firstPage, nextPages = firstPage) {
  const pages = [];
  let start = 0;
  let guard = 0;
  while (start < total - 1 && guard < 200) {
    const room = pages.length ? nextPages : firstPage;
    let end = start + room;
    if (end >= total) {
      end = total;
    } else {
      const fits = breaks.filter((b) => b > start + room * 0.3 && b <= end);
      if (fits.length) end = fits[fits.length - 1];
    }
    pages.push([start, end]);
    start = end;
    guard += 1;
  }
  return pages.length ? pages : [[0, Math.max(1, total)]];
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned nothing'))), type, quality);
  });
}

/**
 * Place a rasterized document in a portrait PDF of `format` ('a6' | 'a4'), split on
 * block breaks. The DOM node carries its own margins; continuation pages get
 * `marginMm` at the top. Page numbers (digits only) are added when there are 2+ pages.
 */
export async function canvasToPdf(canvas, { format = 'a4', cssWidth, breaks = [], marginMm = 6, title = APP.name }) {
  const { jsPDF } = await import('jspdf');
  const page = PAGE[format] || PAGE.a4;
  const pxPerCss = canvas.width / cssWidth;
  const cssPerMm = cssWidth / page.w;
  const totalCss = canvas.height / pxPerCss;
  const footMm = 5;
  const firstRoom = (page.h - footMm) * cssPerMm;
  const nextRoom = (page.h - marginMm - footMm) * cssPerMm;
  const ranges = paginate(totalCss, breaks, firstRoom, nextRoom);
  const pdf = new jsPDF({ unit: 'mm', format, orientation: 'portrait', compress: true });
  pdf.setProperties({ title, creator: APP.name });
  ranges.forEach(([a, b], i) => {
    if (i > 0) pdf.addPage(format, 'portrait');
    const sy = Math.round(a * pxPerCss);
    const sh = Math.max(1, Math.round((b - a) * pxPerCss));
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = sh;
    const ctx = slice.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
    const y = i === 0 ? 0 : marginMm;
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, y, page.w, sh / pxPerCss / cssPerMm, undefined, 'FAST');
    slice.width = 0;
    slice.height = 0;
    if (ranges.length > 1) {
      pdf.setFontSize(7);
      pdf.setTextColor(120, 116, 108);
      pdf.text(`${i + 1} / ${ranges.length}`, page.w / 2, page.h - 2.5, { align: 'center' });
    }
  });
  return pdf.output('blob');
}

/**
 * Draw a rasterized document into a fixed-size image (for example 1080 x 1350),
 * scaled to fit the width (and the height when it is taller), centred, on `background`.
 */
export async function canvasToImage(canvas, { width, height, background = '#FFFFFF', type = 'image/png', quality } = {}) {
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  const k = Math.min(width / canvas.width, height / canvas.height);
  const w = Math.round(canvas.width * k);
  const h = Math.round(canvas.height * k);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, Math.round((width - w) / 2), 0, w, h);
  const blob = await canvasToBlob(out, type, quality);
  out.width = 0;
  out.height = 0;
  return blob;
}

const PRINT_ROOT_ID = 'lihya-print-root';
const PRINT_STYLE_ID = 'lihya-print-style';

/**
 * Print a React element with window.print(): only the element is printed (the app is
 * hidden by print CSS), on `pageSize` paper ('a6' or 'a4'; sizes are written in mm
 * because some browsers ignore the named sizes), zoomed to the paper width. Resolves
 * after the print dialog closes (or after a fallback timeout without afterprint).
 */
export async function printElement(element, { lang = 'ar', pageSize = 'a4', width = 794 } = {}) {
  if (typeof window === 'undefined' || typeof window.print !== 'function') return false;
  const page = PAGE[String(pageSize).toLowerCase()] || PAGE.a4;
  const zoom = Math.min(1, Math.floor(((page.w * 96) / 25.4 / width) * 1000) / 1000);
  await waitForFonts();
  document.getElementById(PRINT_ROOT_ID)?.remove();
  document.getElementById(PRINT_STYLE_ID)?.remove();
  const style = document.createElement('style');
  style.id = PRINT_STYLE_ID;
  style.textContent = [
    `@page { size: ${page.w}mm ${page.h}mm; margin: 0; }`,
    // On screen the print copy is a clipped 0 x 0 fixed box: an element pushed off to the left
    // would widen the scrollable page in Arabic (RTL scrolls to the left) until afterprint.
    `@media screen { #${PRINT_ROOT_ID} { position: fixed; top: 0; left: 0; width: 0; height: 0; overflow: hidden; visibility: hidden; pointer-events: none; } }`,
    '@media print {',
    `  html, body { background: #FFFFFF !important; }`,
    `  body > *:not(#${PRINT_ROOT_ID}) { display: none !important; }`,
    `  #${PRINT_ROOT_ID} { position: static; width: ${width}px; zoom: ${zoom}; }`,
    `  #${PRINT_ROOT_ID} [data-pdf-block] { break-inside: avoid; page-break-inside: avoid; }`,
    '  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    '}',
  ].join('\n');
  const host = document.createElement('div');
  host.id = PRINT_ROOT_ID;
  host.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  host.setAttribute('lang', lang);
  host.dataset.theme = 'light';
  document.head.appendChild(style);
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => root.render(element));
  await waitForImages(host);
  await nextFrame();
  await nextFrame();
  return new Promise((resolve) => {
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      window.removeEventListener('afterprint', cleanup);
      root.unmount();
      host.remove();
      style.remove();
      resolve(true);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 120000);
    try {
      window.print();
    } catch (err) {
      console.error('print failed', err);
      cleanup();
    }
  });
}
