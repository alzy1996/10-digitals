import { useId, useRef } from 'react';
import Chip from './Chip.jsx';
import { cx } from './kit.js';

function isRtl(el) {
  try {
    return getComputedStyle(el).direction === 'rtl';
  } catch {
    return false;
  }
}

/**
 * One-tap choices, never dropdowns (PRD 8.5).
 * Single choice: a radio group (arrow keys move and select, RTL aware). `nullable` lets a
 * second tap on the selected chip clear it (onChange(null)).
 * Multi choice (`multi`): toggle chips, value is an array.
 * options: [{ value, label, icon, tone, disabled }]
 */
export default function ChipRow({
  label,
  options = [],
  value,
  onChange,
  multi = false,
  nullable = false,
  wrap = true,
  className,
  id,
}) {
  const autoId = useId();
  const labelId = `${id || autoId}-label`;
  const refs = useRef([]);
  const selectedArr = multi ? (Array.isArray(value) ? value : []) : [];
  const isSelected = (v) => (multi ? selectedArr.includes(v) : value === v);

  const choose = (v) => {
    if (!onChange) return;
    if (multi) {
      onChange(isSelected(v) ? selectedArr.filter((x) => x !== v) : [...selectedArr, v]);
    } else if (value === v) {
      if (nullable) onChange(null);
    } else {
      onChange(v);
    }
  };

  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const selectedIndex = options.findIndex((o) => value === o.value);
  const tabStop = !multi ? (selectedIndex >= 0 ? selectedIndex : enabled[0]) : null;

  const onKeyDown = (e, index) => {
    if (multi) return;
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(e.key) || enabled.length === 0) return;
    e.preventDefault();
    const pos = Math.max(0, enabled.indexOf(index));
    const rtl = isRtl(e.currentTarget);
    let next = pos;
    if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = enabled.length - 1;
    else {
      const forward = e.key === 'ArrowDown' || e.key === (rtl ? 'ArrowLeft' : 'ArrowRight');
      next = (pos + (forward ? 1 : -1) + enabled.length) % enabled.length;
    }
    const target = enabled[next];
    refs.current[target]?.focus();
    if (onChange && options[target].value !== value) onChange(options[target].value);
  };

  return (
    <div className={cx('flex flex-col gap-2', className)}>
      {label ? (
        <div id={labelId} className="text-sm font-medium text-text-2">
          {label}
        </div>
      ) : null}
      <div
        role={multi ? 'group' : 'radiogroup'}
        aria-labelledby={label ? labelId : undefined}
        className={cx(
          'flex gap-2',
          wrap
            ? 'flex-wrap'
            : 'gutter -mx-[var(--gutter)] overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
      >
        {options.map((o, i) => {
          const sel = isSelected(o.value);
          return (
            <Chip
              key={String(o.value)}
              ref={(el) => {
                refs.current[i] = el;
              }}
              icon={o.icon}
              tone={o.tone}
              disabled={o.disabled}
              selected={sel}
              onClick={() => choose(o.value)}
              role={multi ? undefined : 'radio'}
              aria-checked={multi ? undefined : sel}
              tabIndex={multi ? undefined : i === tabStop ? 0 : -1}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={wrap ? undefined : 'shrink-0'}
            >
              {o.label}
            </Chip>
          );
        })}
      </div>
    </div>
  );
}
