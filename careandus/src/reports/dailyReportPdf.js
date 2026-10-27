// Daily report (PRD 11.2): one Muscat day, A4 PDF rasterized from a print-styled DOM node.
import { rasterize } from './agreementCardPdf.js';

export async function dailyReportPdf(node, dayKey) {
  const [{ jsPDF }, canvas] = await Promise.all([import('jspdf'), rasterize(node, 2)]);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const m = 10;
  const w = pw - 2 * m;
  const pageHpx = ((ph - 2 * m) / w) * canvas.width;
  let y = 0;
  let first = true;
  while (y < canvas.height) {
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = Math.min(pageHpx, canvas.height - y);
    const ctx = slice.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, -y);
    if (!first) pdf.addPage();
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', m, m, w, (slice.height / canvas.width) * w);
    first = false;
    y += pageHpx;
  }
  return { blob: pdf.output('blob'), filename: `khusla-daily-${dayKey}.pdf` };
}
