// Cut Card outputs (PRD 11.1): A6 portrait PDF, 1080 x 1350 PNG for sharing, and
// window.print(). All three render CutCardDocument (Arabic shaped by the browser).

import { createElement } from 'react';
import CutCardDocument, { CUT_CARD_WIDTH } from './CutCardDocument.jsx';
import { blockBreaks, canvasToImage, canvasToPdf, printElement, rasterize, withMounted } from './raster.js';

export const SHARE_SIZE = Object.freeze({ width: 1080, height: 1350 });

function normLang(lang) {
  return lang === 'en' ? 'en' : 'ar';
}

/** The Cut Card as a React element (variant 'print' for A6, 'share' for the PNG, 'screen' for the app). */
export function cutCardNode(data, lang = 'ar', variant = 'print') {
  return createElement(CutCardDocument, { data, lang: normLang(lang), variant });
}

/** A6 portrait PDF (one page, or more when the card is long; breaks fall between sections). */
export async function cutCardPdf(data, lang = 'ar') {
  const L = normLang(lang);
  const width = CUT_CARD_WIDTH.print;
  return withMounted(cutCardNode(data, L, 'print'), { width, lang: L }, async (node) => {
    const breaks = blockBreaks(node);
    const canvas = await rasterize(node);
    try {
      return await canvasToPdf(canvas, { format: 'a6', cssWidth: width, breaks, marginMm: 5, title: 'LIHYA Cut Card' });
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  });
}

/** 1080 x 1350 PNG of the share layout (scaled to fit when the card is long). */
export async function cutCardPng(data, lang = 'ar') {
  const L = normLang(lang);
  const width = CUT_CARD_WIDTH.share;
  return withMounted(cutCardNode(data, L, 'share'), { width, lang: L }, async (node) => {
    const canvas = await rasterize(node, { scale: SHARE_SIZE.width / width });
    try {
      return await canvasToImage(canvas, { ...SHARE_SIZE, background: '#FFFFFF', type: 'image/png' });
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  });
}

/** Print the Cut Card on A6 with window.print() (same document, print CSS). */
export function printCutCard(data, lang = 'ar') {
  const L = normLang(lang);
  return printElement(cutCardNode(data, L, 'print'), { lang: L, pageSize: 'a6', width: CUT_CARD_WIDTH.print });
}

/** File name for a card, for example lihya-cut-card-2026-10-25.pdf. */
export function cutCardFilename(dayKey, ext = 'pdf') {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(dayKey || '')) ? dayKey : 'card';
  return `lihya-cut-card-${day}.${ext}`;
}
