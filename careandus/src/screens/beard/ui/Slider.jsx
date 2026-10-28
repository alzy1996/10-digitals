import { useId, useRef, useState } from 'react';
import { formatMm, formatNumber } from '../lib/format.js';
import { clamp, cx, ratioToValue, snapToStep, stepDecimals, useOptionalT, valueToRatio } from './kit.js';

function isRtl(el) {
  try {
    return getComputedStyle(el).direction === 'rtl';
  } catch {
    return false;
  }
}

/**
 * Length slider (PRD 9.6): 8 px track, 32 px thumb, value bubble above the thumb.
 * Pointer events (drag anywhere on the 44 px band; vertical page scroll still works),
 * keyboard arrows / PageUp / PageDown / Home / End, RTL aware (min on the start side).
 * `unit` 'mm' shows "6 mm" / "6 مم"; any other unit is appended as given; `format(v)` overrides.
 * onChange(value) fires while dragging; onChangeEnd(value) once when the drag or key press ends.
 */
export default function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  onChangeEnd,
  unit,
  label,
  format,
  disabled = false,
  className,
  id,
  'aria-label': ariaLabel,
}) {
  const { lang, isRTL } = useOptionalT();
  const autoId = useId();
  const labelId = `${id || autoId}-label`;
  const trackRef = useRef(null);
  const thumbRef = useRef(null);
  const drag = useRef(null);
  const latest = useRef(null);
  const [dragging, setDragging] = useState(false);

  const v = snapToStep(Number.isFinite(Number(value)) ? Number(value) : min, min, max, step);
  const ratio = valueToRatio(v, min, max);
  const pct = ratio * 100;
  const decimals = stepDecimals(step);

  const text = (n) => {
    if (format) return format(n);
    if (unit === 'mm') return formatMm(n, lang);
    const s = formatNumber(n, lang, { minimumFractionDigits: 0, maximumFractionDigits: decimals });
    return unit ? `${s} ${unit}` : s;
  };

  const emit = (next) => {
    latest.current = next;
    if (next !== v && onChange) onChange(next);
  };

  const fromClientX = (clientX) => {
    const el = trackRef.current;
    if (!el) return v;
    const rect = el.getBoundingClientRect();
    let r = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    if (isRtl(el)) r = 1 - r;
    return ratioToValue(r, min, max, step);
  };

  const onPointerDown = (e) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag.current = { id: e.pointerId };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // capture is best effort (synthetic events in tests)
    }
    setDragging(true);
    thumbRef.current?.focus({ preventScroll: true });
    emit(fromClientX(e.clientX));
  };

  const onPointerMove = (e) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    emit(fromClientX(e.clientX));
  };

  const endDrag = (e) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (onChangeEnd) onChangeEnd(latest.current ?? v);
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    const big = Math.max(step, snapToStep((max - min) / 10, 0, max - min, step));
    const rtl = isRtl(e.currentTarget);
    let next;
    switch (e.key) {
      case 'ArrowUp':
        next = v + step;
        break;
      case 'ArrowDown':
        next = v - step;
        break;
      case 'ArrowRight':
        next = rtl ? v - step : v + step;
        break;
      case 'ArrowLeft':
        next = rtl ? v + step : v - step;
        break;
      case 'PageUp':
        next = v + big;
        break;
      case 'PageDown':
        next = v - big;
        break;
      case 'Home':
        next = min;
        break;
      case 'End':
        next = max;
        break;
      default:
        return;
    }
    e.preventDefault();
    const snapped = snapToStep(clamp(next, min, max), min, max, step);
    emit(snapped);
    if (onChangeEnd) onChangeEnd(snapped);
  };

  // The bubble's start edge sits on the thumb at 0 % and its end edge at 100 %, so it never
  // leaves the track at the ends (translate is physical, so it flips in RTL).
  const bubbleShift = `${isRTL ? pct : -pct}%`;

  return (
    <div className={cx('w-full select-none', disabled && 'opacity-40', className)}>
      {label ? (
        <div id={labelId} className="mb-1 text-sm font-medium text-ink2">
          {label}
        </div>
      ) : null}
      <div
        className={cx('relative px-4 pt-11', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}
        style={{ touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div ref={trackRef} className="relative h-11">
          <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full border border-line bg-surface2" />
          <div
            className="absolute start-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-plum"
            style={{ width: `${pct}%` }}
          />
          <div
            aria-hidden="true"
            className={cx(
              'num absolute bottom-full mb-1.5 whitespace-nowrap rounded-control border px-2.5 py-1 text-base font-semibold leading-tight',
              'transition-colors duration-press ease-out',
              dragging ? 'border-plum bg-plum text-onplum' : 'border-line bg-surface2 text-ink',
            )}
            style={{ insetInlineStart: `${pct}%`, transform: `translateX(${bubbleShift})` }}
          >
            {text(v)}
          </div>
          <div
            ref={thumbRef}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label={label ? undefined : ariaLabel}
            aria-labelledby={label ? labelId : undefined}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={v}
            aria-valuetext={text(v)}
            aria-orientation="horizontal"
            aria-disabled={disabled || undefined}
            onKeyDown={onKeyDown}
            className={cx(
              'absolute top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-plum rtl:translate-x-1/2',
              'transition-transform duration-press ease-out',
              dragging && 'scale-110',
            )}
            style={{ insetInlineStart: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
