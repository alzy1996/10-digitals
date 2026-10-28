import { useId, useRef } from 'react';
import { cx, useOptionalT } from './kit.js';

function isRtl(el) {
  try {
    return getComputedStyle(el).direction === 'rtl';
  } catch {
    return false;
  }
}

/**
 * Customer rating, 1 to 5 dots, no emoji (PRD 8.1 step 11). Each dot is a 48 px radio target
 * with its number under it; dots up to the value are filled brass. Arrow keys move the value
 * (RTL aware). `readOnly` renders a static image of the rating.
 */
export default function RatingDots({ value = 0, onChange, max = 5, label, readOnly = false, className }) {
  const { t } = useOptionalT();
  const id = useId();
  const refs = useRef([]);
  const v = Math.max(0, Math.min(max, Math.round(Number(value) || 0)));
  const items = Array.from({ length: max }, (_, i) => i + 1);
  const groupLabel = label || t('beard.ui.rating.label');

  if (readOnly || !onChange) {
    return (
      <div role="img" aria-label={`${groupLabel}: ${t('beard.ui.rating.value', { n: v, max })}`} className={cx('flex gap-1.5', className)}>
        {items.map((n) => (
          <span
            key={n}
            className={cx('h-3 w-3 rounded-full border-2', n <= v ? 'border-plum bg-plum' : 'border-line bg-transparent')}
          />
        ))}
      </div>
    );
  }

  const onKeyDown = (e, n) => {
    const rtl = isRtl(e.currentTarget);
    let next = null;
    if (e.key === 'ArrowUp' || e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) next = Math.min(max, n + 1);
    else if (e.key === 'ArrowDown' || e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) next = Math.max(1, n - 1);
    else if (e.key === 'Home') next = 1;
    else if (e.key === 'End') next = max;
    if (next === null) return;
    e.preventDefault();
    refs.current[next - 1]?.focus();
    onChange(next);
  };

  return (
    <div className={cx('flex flex-col gap-2', className)}>
      {label ? (
        <div id={`${id}-label`} className="text-sm font-medium text-ink2">
          {label}
        </div>
      ) : null}
      <div
        role="radiogroup"
        aria-labelledby={label ? `${id}-label` : undefined}
        aria-label={label ? undefined : groupLabel}
        className="flex items-start gap-2"
      >
        {items.map((n) => {
          const filled = n <= v;
          return (
            <button
              key={n}
              ref={(el) => {
                refs.current[n - 1] = el;
              }}
              type="button"
              role="radio"
              aria-checked={n === v}
              aria-label={t('beard.ui.rating.value', { n, max })}
              tabIndex={n === (v || 1) ? 0 : -1}
              onClick={() => onChange(n)}
              onKeyDown={(e) => onKeyDown(e, n)}
              className="press flex min-h-[64px] min-w-[48px] flex-col items-center justify-center gap-1.5 rounded-control active:bg-surface2"
            >
              <span
                aria-hidden="true"
                className={cx(
                  'h-7 w-7 rounded-full border-2 transition-colors duration-press ease-out',
                  filled ? 'border-plum bg-plum' : 'border-ink2 bg-transparent',
                )}
              />
              <span aria-hidden="true" className={cx('num text-xs', n === v ? 'font-semibold text-ink' : 'text-ink2')}>
                {n}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
