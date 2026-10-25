import { formatMm } from '../lib/format.js';
import { clamp, cx, useOptionalT } from './kit.js';

const PAD = 14;
const H = 52; // cross size of the ruler (viewBox units)
const EDGE = 20; // the ruler's measuring edge
const TICK_MINOR = 6;
const TICK_MID = 10;
const TICK_MAJOR = 14;

/**
 * Barber's ruler (PRD 9.5): a thin brass ruler with mm ticks (longer every 5 mm, numbered
 * every 10 mm) and the current length highlighted. Pure SVG, so it also renders inside the
 * Cut Card PDF (pass `lang` and hex `color`/`textColor` there).
 * Horizontal rulers start at the reading start (the right side in Arabic); vertical rulers
 * start at the bottom (the skin) and grow upward.
 */
export default function BarberRuler({
  mm = 0,
  maxMm,
  orientation = 'horizontal',
  size,
  lang,
  showValue = true,
  color = 'var(--brass)',
  textColor = 'var(--text)',
  className,
}) {
  const { t, lang: L } = useOptionalT(lang);
  const value = Math.max(0, Number(mm) || 0);
  const max = Math.max(5, Math.round(Number(maxMm) || Math.max(10, Math.ceil((value + 5) / 10) * 10)));
  const cur = clamp(value, 0, max);
  const px = max > 40 ? 5 : 8; // viewBox units per mm
  const len = max * px;
  const vertical = orientation === 'vertical';
  const rtl = L === 'ar' && !vertical;
  const along = (m) => (vertical ? PAD + len - m * px : rtl ? PAD + len - m * px : PAD + m * px);
  const W = vertical ? H : len + PAD * 2;
  const HH = vertical ? len + PAD * 2 : H;

  const ticks = [];
  for (let m = 0; m <= max; m++) {
    const major = m % 10 === 0;
    const mid = !major && m % 5 === 0;
    const tl = major ? TICK_MAJOR : mid ? TICK_MID : TICK_MINOR;
    const p = along(m);
    const on = m <= cur + 1e-6;
    ticks.push(
      vertical ? (
        <line key={m} x1={EDGE} x2={EDGE + tl} y1={p} y2={p} strokeOpacity={on ? 1 : 0.5} />
      ) : (
        <line key={m} x1={p} x2={p} y1={EDGE} y2={EDGE + tl} strokeOpacity={on ? 1 : 0.5} />
      ),
    );
  }
  const labels = [];
  for (let m = 0; m <= max; m += 10) {
    const p = along(m);
    labels.push(
      vertical ? (
        <text key={m} x={EDGE + TICK_MAJOR + 4} y={p + 3.5} fontSize={10} textAnchor="start">
          {m}
        </text>
      ) : (
        <text key={m} x={p} y={EDGE + TICK_MAJOR + 11} fontSize={10} textAnchor="middle">
          {m}
        </text>
      ),
    );
  }

  const p0 = along(0);
  const pc = along(cur);
  const band = vertical
    ? { x: EDGE, y: Math.min(p0, pc), width: TICK_MAJOR, height: Math.abs(pc - p0) }
    : { x: Math.min(p0, pc), y: EDGE, width: Math.abs(pc - p0), height: TICK_MAJOR };
  const marker = vertical
    ? `M${EDGE - 1} ${pc}l-7 -4.5v9z`
    : `M${pc} ${EDGE - 1}l-4.5 -7h9z`;
  const valueText = formatMm(cur, L);
  const sizeProps = size ? (vertical ? { height: size } : { width: size }) : {};
  // Fluid rulers fill their container but never grow past 1.5x, so labels stay small on desktop.
  const fluidStyle = size ? undefined : vertical ? { maxHeight: HH * 1.5 } : { maxWidth: W * 1.5 };

  return (
    <svg
      viewBox={`0 0 ${W} ${HH}`}
      {...sizeProps}
      role="img"
      aria-label={t('ui.ruler.label', { mm: valueText })}
      className={cx(size ? undefined : vertical ? 'h-full w-auto' : 'h-auto w-full', className)}
      style={fluidStyle}
      fontFamily="'IBM Plex Sans Arabic', system-ui, sans-serif"
      direction="ltr"
    >
      <rect {...band} fill={color} fillOpacity={0.18} />
      <g stroke={color} strokeWidth={1} strokeLinecap="round">
        {vertical ? (
          <line x1={EDGE} x2={EDGE} y1={PAD} y2={PAD + len} strokeWidth={1.5} />
        ) : (
          <line x1={PAD} x2={PAD + len} y1={EDGE} y2={EDGE} strokeWidth={1.5} />
        )}
        {ticks}
      </g>
      <g fill={color} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {labels}
      </g>
      <path d={marker} fill={textColor} />
      {showValue && !vertical ? (
        <text
          x={clamp(pc, PAD + 18, PAD + len - 18)}
          y={9}
          fontSize={11}
          fontWeight={600}
          textAnchor="middle"
          fill={textColor}
          direction={L === 'ar' ? 'rtl' : 'ltr'}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {valueText}
        </text>
      ) : null}
    </svg>
  );
}
