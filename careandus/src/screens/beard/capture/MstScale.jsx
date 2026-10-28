import { useId, useRef } from 'react';
import { useT } from '../lib/i18n.js';
import { cx } from '../ui/kit.js';
import { MST_HEX } from './mst.js';

/**
 * Monk Skin Tone 1..10 as one-tap swatch chips in a 5 x 2 grid, so the whole scale is in
 * view on a phone. A radio group like ChipRow: the selected chip is brass, arrow keys move
 * and select (RTL aware), Home / End jump to the ends.
 */
export default function MstScale({ value, onChange, label }) {
  const { t, isRTL } = useT();
  const labelId = `${useId()}-label`;
  const refs = useRef([]);
  const tabStop = value >= 1 && value <= 10 ? value - 1 : 0;

  const onKeyDown = (e, i) => {
    let next = null;
    if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 9;
    else if (e.key === 'ArrowDown') next = Math.min(9, i + 5);
    else if (e.key === 'ArrowUp') next = Math.max(0, i - 5);
    else if (e.key === 'ArrowRight') next = isRTL ? i - 1 : i + 1;
    else if (e.key === 'ArrowLeft') next = isRTL ? i + 1 : i - 1;
    if (next === null) return;
    e.preventDefault();
    next = (next + 10) % 10;
    refs.current[next]?.focus();
    if (onChange && next + 1 !== value) onChange(next + 1);
  };

  return (
    <div className="flex flex-col gap-2">
      <div id={labelId} className="text-sm font-medium text-ink2">
        {label}
      </div>
      <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-5 gap-2">
        {MST_HEX.map((hex, i) => {
          const n = i + 1;
          const sel = value === n;
          return (
            <button
              key={hex}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={sel}
              aria-label={t('beard.capture.profile.mstChip', { n })}
              tabIndex={i === tabStop ? 0 : -1}
              onClick={() => onChange && n !== value && onChange(n)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cx(
                'press flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-full border text-sm font-medium',
                sel ? 'border-plum bg-plum text-onplum' : 'border-line bg-surface2 text-ink active:bg-line',
              )}
            >
              <span aria-hidden="true" className="h-5 w-5 shrink-0 rounded-full border border-line" style={{ background: hex }} />
              <span aria-hidden="true" className="num">
                {n}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
