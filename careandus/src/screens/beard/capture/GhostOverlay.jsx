import { useId } from 'react';
import Icon from '../ui/Icon.jsx';
import { cx } from '../ui/kit.js';

const clampN = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * Oval guide in px. `size` is the stage, `rect` the part of it the camera frame covers
 * (larger than the stage with object-fit cover, smaller with contain). The oval is sized
 * to the frame, so a face that fills it sits well inside the capture's distance window.
 */
export function ovalFor(size, rect) {
  const r = rect && rect.w && rect.h ? rect : { x: 0, y: 0, w: size.w, h: size.h };
  let rx = Math.max(40, Math.min(r.w * 0.3, r.h * 0.25, size.w * 0.42));
  let ry = rx * 1.32;
  if (ry > size.h * 0.4) {
    ry = size.h * 0.4;
    rx = ry / 1.32;
  }
  const cx = clampN(r.x + r.w / 2, rx + 8, size.w - rx - 8);
  const cy = clampN(r.y + r.h * 0.46, ry + 8, Math.max(ry + 8, size.h - ry - 8));
  return { cx, cy, rx, ry };
}

const ARROW_ROTATE = { left: '', right: '', up: '-rotate-90', down: 'rotate-90' };

/**
 * Ghost face outline over the live camera (PRD 8.4 S04): a dim scrim with an oval hole,
 * a dashed outline that turns brass when the pose is right, the 400 ms hold drawn as a
 * brass arc around the oval, and a pose arrow. Arrows are SCREEN directions (onStatus.arrow,
 * already converted from the customer's left/right for the mirrored preview), so this layer
 * is laid out left-to-right in both languages.
 */
export default function GhostOverlay({ size, rect, aligned = false, progress = 0, arrow = null, faceFound = true }) {
  const maskId = `ghost-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  if (!size || !size.w || !size.h) return null;
  const o = ovalFor(size, rect);
  const ring = `M ${o.cx} ${o.cy - o.ry} A ${o.rx} ${o.ry} 0 1 1 ${o.cx} ${o.cy + o.ry} A ${o.rx} ${o.ry} 0 1 1 ${o.cx} ${o.cy - o.ry}`;
  const p = Math.max(0, Math.min(1, Number(progress) || 0));
  const arrowPos = {
    left: { left: Math.max(8, o.cx - o.rx - 64), top: o.cy - 28 },
    right: { left: Math.min(size.w - 64, o.cx + o.rx + 8), top: o.cy - 28 },
    up: { left: o.cx - 28, top: Math.max(8, o.cy - o.ry - 64) },
    down: { left: o.cx - 28, top: Math.min(size.h - 64, o.cy + o.ry + 8) },
  };

  return (
    <div dir="ltr" aria-hidden="true" className="pointer-events-none absolute inset-0">
      <svg width={size.w} height={size.h} className="absolute inset-0">
        <defs>
          <mask id={maskId}>
            <rect x="0" y="0" width={size.w} height={size.h} fill="white" />
            <ellipse cx={o.cx} cy={o.cy} rx={o.rx} ry={o.ry} fill="black" />
          </mask>
        </defs>
        <rect x="0" y="0" width={size.w} height={size.h} fill="color-mix(in srgb, var(--bg) 55%, transparent)" mask={`url(#${maskId})`} />
        <ellipse
          cx={o.cx}
          cy={o.cy}
          rx={o.rx}
          ry={o.ry}
          fill="none"
          stroke={aligned ? 'var(--plum)' : 'color-mix(in srgb, var(--text) 85%, transparent)'}
          strokeWidth={aligned ? 3 : 2}
          strokeDasharray={aligned ? undefined : '10 8'}
          style={{ transition: 'stroke var(--t-press) var(--ease)' }}
        />
        {p > 0 ? (
          <path
            d={ring}
            pathLength="1"
            fill="none"
            stroke="var(--plum)"
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray="1 1"
            strokeDashoffset={1 - p}
          />
        ) : null}
      </svg>
      {arrow && arrowPos[arrow] && faceFound ? (
        <span
          className="absolute flex h-14 w-14 items-center justify-center rounded-full border-2 border-plum bg-bg text-plum"
          style={arrowPos[arrow]}
        >
          <Icon
            name={arrow === 'left' ? 'arrow-left' : 'arrow-right'}
            size={32}
            mirror={false}
            className={cx(ARROW_ROTATE[arrow], 'motion-safe:animate-pulse')}
          />
        </span>
      ) : null}
    </div>
  );
}
