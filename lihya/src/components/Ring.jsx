import { formatPercent } from '../lib/format.js';
import { clamp, cx, useOptionalT } from './kit.js';

/**
 * Grow-ability ring (PRD 9.6): 72 px, brass arc on a line-colored track, % in the
 * center (24 px at the default size). role="img" with `label` + value as its name.
 * The arc runs clockwise from the top (counter-clockwise in RTL).
 */
export default function Ring({ value, size = 72, label, className, lang }) {
  const { lang: L } = useOptionalT(lang);
  const n = Number(value);
  const v = value === null || value === undefined || !Number.isFinite(n) ? null : clamp(Math.round(n), 0, 100);
  const sw = Math.max(4, Math.round(size / 12));
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  const text = v === null ? '–' : formatPercent(v, L);
  // Numbers are Latin in both languages; the condensed display face keeps "100%" inside the ring.
  const fontSize = Math.round(size / (v === 100 ? 3.4 : 3));
  return (
    <div
      role="img"
      aria-label={label ? `${label}: ${text}` : text}
      className={cx('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        className="absolute inset-0 rtl:-scale-x-100"
      >
        <circle cx={mid} cy={mid} r={r} fill="none" stroke="var(--line)" strokeWidth={sw} />
        {v ? (
          <circle
            cx={mid}
            cy={mid}
            r={r}
            fill="none"
            stroke="var(--brass)"
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - v / 100)}
            transform={`rotate(-90 ${mid} ${mid})`}
            style={{ transition: 'stroke-dashoffset var(--dur-screen) var(--ease-out)' }}
          />
        ) : null}
      </svg>
      <span
        dir="ltr"
        className="num relative font-semibold leading-none text-text"
        style={{ fontSize, fontFamily: "'Barlow Condensed', 'IBM Plex Sans Arabic', sans-serif" }}
      >
        {text}
      </span>
    </div>
  );
}
