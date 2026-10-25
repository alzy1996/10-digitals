// Daily report (PRD 11.2): one Muscat day, 00:00 to 24:00 Asia/Muscat, as an A4 PDF
// (DOM -> html2canvas -> jsPDF) or printed with window.print(). Demo consultations
// are left out unless includeDemo.

import { createElement } from 'react';
import DailyReportDocument, { DAILY_REPORT_WIDTH } from './DailyReportDocument.jsx';
import { summarizeDay } from './summary.js';
import { blockBreaks, canvasToPdf, printElement, rasterize, withMounted } from './raster.js';

function normLang(lang) {
  return lang === 'en' ? 'en' : 'ar';
}

/**
 * The day's numbers and the document element.
 * input = { shop, dayKey, consultations, staff, products, stats, lang, includeDemo, settings?, styles?, generatedAt? }
 * `settings` defaults to shop.settings (for the AI daily cap).
 */
export function dailyReportNode(input = {}) {
  const L = normLang(input.lang);
  const report = summarizeDay({
    consultations: input.consultations,
    dayKey: input.dayKey,
    includeDemo: Boolean(input.includeDemo),
    products: input.products,
    staff: input.staff,
    styles: input.styles,
    stats: input.stats,
    settings: input.settings || (input.shop && input.shop.settings) || null,
  });
  return {
    report,
    element: createElement(DailyReportDocument, { report, shop: input.shop || null, lang: L, generatedAt: input.generatedAt || new Date() }),
  };
}

/** A4 portrait PDF Blob of the daily report. */
export async function dailyReportPdf(input = {}) {
  const L = normLang(input.lang);
  const { element } = dailyReportNode({ ...input, lang: L });
  return withMounted(element, { width: DAILY_REPORT_WIDTH, lang: L }, async (node) => {
    const breaks = blockBreaks(node);
    const canvas = await rasterize(node);
    try {
      return await canvasToPdf(canvas, { format: 'a4', cssWidth: DAILY_REPORT_WIDTH, breaks, marginMm: 12, title: 'LIHYA daily report' });
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  });
}

/** Print the daily report on A4 with window.print(). */
export function printDailyReport(input = {}) {
  const L = normLang(input.lang);
  const { element } = dailyReportNode({ ...input, lang: L });
  return printElement(element, { lang: L, pageSize: 'a4', width: DAILY_REPORT_WIDTH });
}

/** File name, for example lihya-daily-2026-10-25.pdf. */
export function dailyReportFilename(dayKey) {
  return `lihya-daily-${/^\d{4}-\d{2}-\d{2}$/.test(String(dayKey || '')) ? dayKey : 'report'}.pdf`;
}
