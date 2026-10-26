import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/** QR code as crisp SVG modules (dark ink on white, quiet zone of 4). */
export default function QrCode({ value, size = 220, label }) {
  const { n, cells } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    const out = [];
    for (let r = 0; r < count; r += 1) for (let c = 0; c < count; c += 1) if (qr.isDark(r, c)) out.push([c, r]);
    return { n: count, cells: out };
  }, [value]);
  const q = 4;
  return (
    <svg viewBox={`0 0 ${n + q * 2} ${n + q * 2}`} width={size} height={size} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={n + q * 2} height={n + q * 2} fill="#FFFFFF" />
      <path d={cells.map(([x, y]) => `M${x + q} ${y + q}h1v1h-1z`).join('')} fill="#1D1A1C" />
    </svg>
  );
}
