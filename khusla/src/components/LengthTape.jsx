import { useRef } from 'react';
import { formatCm } from '../lib/format.js';
import { useT } from '../lib/i18n/useT.js';

/**
 * Thin clay measuring tape laid across the photo at the new length. Drag it up/down.
 * Positions are in image pixels; the overlay is scaled to the displayed canvas.
 * Props: imgW, imgH, y (current line y in image px), onChange(y), topY (y where 0 cm starts),
 * mmPerPx, deltaCm, dryCm, x0, x1 (horizontal extent in image px).
 */
export default function LengthTape({ imgW, imgH, y, onChange, mmPerPx, deltaCm, dryCm, x0, x1, newCm }) {
  const { t, lang } = useT();
  const ref = useRef(null);
  const dragging = useRef(false);
  const toImgY = (clientY) => {
    const r = ref.current.getBoundingClientRect();
    return ((clientY - r.top) / r.height) * imgH;
  };
  const onDown = (e) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    onChange(toImgY(e.clientY));
  };
  const onMove = (e) => {
    if (dragging.current) onChange(toImgY(e.clientY));
  };
  const onUp = () => {
    dragging.current = false;
  };
  const pxPerCm = 10 / mmPerPx;
  const left = Math.max(0, x0);
  const right = Math.min(imgW, x1);
  const ticks = [];
  const tickCount = Math.floor((right - left) / pxPerCm);
  for (let i = 0; i <= tickCount; i += 1) ticks.push(left + i * pxPerCm);
  const tapeH = Math.max(10, imgH * 0.018);
  const fs = Math.max(14, imgH * 0.028);
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${imgW} ${imgH}`}
      className="absolute inset-0 h-full w-full touch-none"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      role="slider"
      aria-label={t('cut.tape')}
      aria-valuenow={Math.round(newCm || 0)}
      aria-valuetext={formatCm(newCm, lang)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') onChange(y - pxPerCm * 0.5);
        if (e.key === 'ArrowDown') onChange(y + pxPerCm * 0.5);
      }}
    >
      <rect x={left} y={y - tapeH / 2} width={right - left} height={tapeH} fill="rgba(251,248,244,.86)" stroke="var(--clay)" strokeWidth={Math.max(1, imgH * 0.0016)} rx={tapeH * 0.2} />
      {ticks.map((tx, i) => (
        <line key={i} x1={tx} x2={tx} y1={y - tapeH / 2} y2={y - tapeH / 2 + (i % 5 === 0 ? tapeH * 0.8 : tapeH * 0.45)} stroke="var(--clay)" strokeWidth={Math.max(1, imgH * 0.0014)} />
      ))}
      <line x1={0} x2={imgW} y1={y} y2={y} stroke="var(--clay)" strokeDasharray={`${imgH * 0.01} ${imgH * 0.008}`} strokeWidth={Math.max(1, imgH * 0.002)} opacity="0.85" />
      <g transform={`translate(${right - fs * 7.4} ${y - tapeH / 2 - fs * 2.6})`}>
        <rect width={fs * 7.2} height={fs * 2.3} rx={fs * 0.5} fill="var(--surface)" stroke="var(--clay)" />
        <text x={fs * 3.6} y={fs * 1.05} textAnchor="middle" fontSize={fs} fontWeight="600" fill="var(--text)" className="num">
          {deltaCm <= 0 ? '−' : '+'}
          {formatCm(Math.abs(deltaCm), lang)}
        </text>
        <text x={fs * 3.6} y={fs * 1.95} textAnchor="middle" fontSize={fs * 0.72} fill="var(--text-2)" className="num">
          {t('cut.dryShort', { cm: formatCm(dryCm, lang) })}
        </text>
      </g>
    </svg>
  );
}
