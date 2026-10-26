import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { formatPercent } from '../lib/format.js';
import { clamp, cx, useOptionalT } from './kit.js';

const HOLD_MS = 180; // press this long without moving = show the original
const MOVE_PX = 8; // moving more than this turns the press into a drag of the divider

function isRtl(el) {
  try {
    return getComputedStyle(el).direction === 'rtl';
  } catch {
    return false;
  }
}

function Layer({ src, alt }) {
  if (typeof src === 'string') {
    return (
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
      />
    );
  }
  return <div className="pointer-events-none absolute inset-0 [&>*]:h-full [&>*]:w-full">{src}</div>;
}

/**
 * Before/after split view (PRD 7.2): "before" on the start side of a draggable divider,
 * "after" on the end side. Drag the handle (or anywhere) to move the divider; press and hold
 * anywhere to see the original full frame. Keyboard: the handle is a slider (arrows, Home, End).
 * before / after: image URLs (data or object URLs) or nodes (for example a canvas wrapper).
 */
export default function BeforeAfter({
  before,
  after,
  initial = 50,
  beforeLabel,
  afterLabel,
  alt = '',
  aspect = '4 / 5',
  hint = true,
  onHoldChange,
  className,
}) {
  const { t, lang, isRTL: rtl } = useOptionalT();
  const boxRef = useRef(null);
  const press = useRef(null);
  const [split, setSplit] = useState(clamp(Number.isFinite(Number(initial)) ? Number(initial) : 50, 0, 100));
  const [holding, setHolding] = useState(false);

  useEffect(() => {
    if (onHoldChange) onHoldChange(holding);
  }, [holding, onHoldChange]);

  useEffect(() => () => clearTimeout(press.current?.timer), []);

  const splitFromX = (clientX) => {
    const el = boxRef.current;
    if (!el) return split;
    const r = el.getBoundingClientRect();
    let p = r.width > 0 ? ((clientX - r.left) / r.width) * 100 : 50;
    if (isRtl(el)) p = 100 - p;
    return clamp(p, 0, 100);
  };

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const onHandle = Boolean(e.target.closest('[data-handle]'));
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // best effort
    }
    const state = { id: e.pointerId, x: e.clientX, y: e.clientY, mode: onHandle ? 'drag' : 'pending', timer: 0 };
    if (!onHandle) {
      state.timer = setTimeout(() => {
        if (press.current === state && state.mode === 'pending') {
          state.mode = 'hold';
          setHolding(true);
        }
      }, HOLD_MS);
    } else {
      setSplit(splitFromX(e.clientX));
    }
    press.current = state;
  };

  const onPointerMove = (e) => {
    const s = press.current;
    if (!s || s.id !== e.pointerId) return;
    if (s.mode === 'pending' && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_PX) {
      clearTimeout(s.timer);
      s.mode = 'drag';
    }
    if (s.mode === 'drag') setSplit(splitFromX(e.clientX));
  };

  const onPointerEnd = (e) => {
    const s = press.current;
    if (!s || s.id !== e.pointerId) return;
    clearTimeout(s.timer);
    if (s.mode === 'pending' && e.type === 'pointerup') setSplit(splitFromX(e.clientX));
    if (s.mode === 'hold') setHolding(false);
    press.current = null;
  };

  const onKeyDown = (e) => {
    const step = e.shiftKey ? 10 : 5;
    let next = null;
    if (e.key === 'ArrowLeft') next = split + (rtl ? step : -step);
    else if (e.key === 'ArrowRight') next = split + (rtl ? -step : step);
    else if (e.key === 'ArrowUp') next = split + step;
    else if (e.key === 'ArrowDown') next = split - step;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 100;
    if (next === null) return;
    e.preventDefault();
    setSplit(clamp(next, 0, 100));
  };

  const shown = holding ? 100 : split;
  // "before" is clipped to the start side; clip-path is physical, so flip it in RTL.
  const clip = rtl ? `inset(0 0 0 ${100 - shown}%)` : `inset(0 ${100 - shown}% 0 0)`;
  const bLabel = beforeLabel || t('ui.ba.before');
  const aLabel = afterLabel || t('ui.ba.after');

  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <div
        ref={boxRef}
        className="relative w-full select-none overflow-hidden rounded-card border border-line bg-surface-2 [-webkit-touch-callout:none]"
        style={{ aspectRatio: aspect, touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Layer src={after} alt={alt} />
        <div className="absolute inset-0" style={{ clipPath: clip, WebkitClipPath: clip }}>
          <Layer src={before} alt="" />
        </div>

        <span
          className={cx(
            'pointer-events-none absolute start-3 top-3 rounded-full border border-line bg-bg/80 px-2.5 py-1 text-xs font-medium text-text transition-opacity duration-[var(--dur-press)]',
            shown <= 8 ? 'opacity-0' : 'opacity-100',
          )}
        >
          {holding ? t('ui.ba.original') : bLabel}
        </span>
        <span
          className={cx(
            'pointer-events-none absolute end-3 top-3 rounded-full border border-line bg-bg/80 px-2.5 py-1 text-xs font-medium text-text transition-opacity duration-[var(--dur-press)]',
            shown >= 92 ? 'opacity-0' : 'opacity-100',
          )}
        >
          {aLabel}
        </span>

        {!holding ? (
          <div className="pointer-events-none absolute inset-y-0" style={{ insetInlineStart: `${split}%` }}>
            <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-text rtl:translate-x-1/2" />
            <div
              data-handle=""
              dir="ltr"
              role="slider"
              tabIndex={0}
              aria-label={t('ui.ba.divider')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(split)}
              aria-valuetext={formatPercent(split, lang)}
              onKeyDown={onKeyDown}
              className="pointer-events-auto absolute top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border-2 border-text bg-bg text-text rtl:translate-x-1/2"
            >
              <Icon name="chevron-left" size={18} className="-me-1" mirror={false} />
              <Icon name="chevron-right" size={18} className="-ms-1" mirror={false} />
            </div>
          </div>
        ) : null}
      </div>
      {hint ? (
        <p className="flex items-center justify-center gap-1.5 text-xs text-text-2">
          <Icon name="hand" size={16} />
          <span>{t('ui.ba.hint')}</span>
        </p>
      ) : null}
    </div>
  );
}
