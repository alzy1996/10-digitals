// Small horizontal bar chart drawn on a canvas (prints well and rasterizes in html2canvas).
import { useEffect, useRef, useState } from 'react';

/** `width` is the maximum; on phones the chart shrinks to its container. */
export default function BarChart({ rows, width: maxWidth = 520, rowH = 30, color = '#5B2A4D', label }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(maxWidth);
  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, Math.min(maxWidth, Math.floor(e.contentRect.width)))));
    ro.observe(parent);
    return () => ro.disconnect();
  }, [maxWidth]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = 2;
    const h = Math.max(1, rows.length) * rowH + 8;
    c.width = width * dpr;
    c.height = h * dpr;
    c.style.width = `${width}px`;
    c.style.height = `${h}px`;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, h);
    const max = Math.max(1, ...rows.map((r) => r.value));
    const labelW = Math.min(220, width * 0.45);
    ctx.font = '13px "IBM Plex Sans Arabic", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const rtl = document.documentElement.dir === 'rtl';
    rows.forEach((r, i) => {
      const y = i * rowH + 4;
      const barW = ((width - labelW - 40) * r.value) / max;
      ctx.fillStyle = '#6B6166';
      ctx.textAlign = rtl ? 'right' : 'left';
      const text = r.label.length > 28 ? `${r.label.slice(0, 27)}…` : r.label;
      ctx.fillText(text, rtl ? width : 0, y + rowH / 2 - 2);
      ctx.fillStyle = color;
      const x = rtl ? width - labelW - barW : labelW;
      ctx.fillRect(x, y + 6, barW, rowH - 16);
      ctx.fillStyle = '#1D1A1C';
      ctx.textAlign = rtl ? 'right' : 'left';
      ctx.fillText(String(r.value), rtl ? x - 6 : x + barW + 6, y + rowH / 2 - 2);
    });
  }, [rows, width, rowH, color]);
  return <canvas ref={ref} role="img" aria-label={label} className="block max-w-full" />;
}
