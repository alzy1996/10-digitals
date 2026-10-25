// Agreement Card exports (PRD 11.1): A5 PDF + 1080×1350 PNG, built from a print-styled DOM node
// rasterized with html2canvas so the browser shapes Arabic correctly.
export async function rasterize(node, scale = 2) {
  const { default: html2canvas } = await import('html2canvas');
  return html2canvas(node, { scale, backgroundColor: '#FBF8F4', useCORS: true, logging: false });
}

export async function agreementPdf(node, filename = 'agreement-card.pdf') {
  const [{ jsPDF }, canvas] = await Promise.all([import('jspdf'), rasterize(node, 2)]);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const margin = 6;
  const w = pw - margin * 2;
  const h = (canvas.height / canvas.width) * w;
  const img = canvas.toDataURL('image/jpeg', 0.92);
  if (h <= ph - margin * 2) {
    pdf.addImage(img, 'JPEG', margin, margin, w, h);
  } else {
    // long card: slice across pages
    const pageHpx = ((ph - margin * 2) / w) * canvas.width;
    let y = 0;
    let first = true;
    while (y < canvas.height) {
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = Math.min(pageHpx, canvas.height - y);
      slice.getContext('2d').drawImage(canvas, 0, -y);
      if (!first) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, w, (slice.height / canvas.width) * w);
      first = false;
      y += pageHpx;
    }
  }
  const blob = pdf.output('blob');
  return { blob, filename };
}

/** 1080×1350 PNG (4:5) for sharing on phones. */
export async function agreementPng(node) {
  const canvas = await rasterize(node, 2);
  const out = document.createElement('canvas');
  out.width = 1080;
  out.height = 1350;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#FBF8F4';
  ctx.fillRect(0, 0, 1080, 1350);
  const s = Math.min(1040 / canvas.width, 1310 / canvas.height);
  const w = canvas.width * s;
  const h = canvas.height * s;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, (1080 - w) / 2, (1350 - h) / 2, w, h);
  return new Promise((r) => out.toBlob(r, 'image/png'));
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

/** Web Share with files where supported; returns false when the fallback is needed. */
export async function shareFile(blob, filename, text) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return true;
    } catch {
      return true; // cancelled by the user
    }
  }
  return false;
}

export function whatsappLink(phone, text) {
  const digits = (phone || '').replace(/[^\d]/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
