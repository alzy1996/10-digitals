import { useId } from 'react';
import { cx } from './kit.js';

/**
 * On/off switch row for settings: label (and optional description) on the start side,
 * a 52 x 32 switch on the end side; the whole row (56 px) is the tap target.
 * onChange(nextBoolean). Without a visible label, pass aria-label.
 */
export default function Toggle({ checked = false, onChange, label, description, disabled = false, className, ...rest }) {
  const id = useId();
  const labelId = `${id}-label`;
  const descId = `${id}-desc`;
  const on = Boolean(checked);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={label ? labelId : undefined}
      aria-describedby={description ? descId : undefined}
      disabled={disabled}
      onClick={() => onChange && onChange(!on)}
      className={cx(
        'press flex min-h-[56px] w-full items-center gap-4 rounded-control py-2 text-start disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      {label || description ? (
        <span className="min-w-0 flex-1">
          {label ? (
            <span id={labelId} className="block text-base font-medium leading-snug text-ink">
              {label}
            </span>
          ) : null}
          {description ? (
            <span id={descId} className="mt-0.5 block text-sm leading-snug text-ink2">
              {description}
            </span>
          ) : null}
        </span>
      ) : null}
      <span
        aria-hidden="true"
        className={cx(
          'relative inline-flex h-8 w-[52px] shrink-0 items-center rounded-full border transition-colors duration-press ease-out',
          on ? 'border-plum bg-plum' : 'border-line bg-surface2',
        )}
      >
        <span
          className={cx(
            'absolute start-[3px] h-6 w-6 rounded-full transition-transform duration-press ease-out',
            on ? 'translate-x-5 bg-onplum rtl:-translate-x-5' : 'translate-x-0 bg-ink2',
          )}
        />
      </span>
    </button>
  );
}
