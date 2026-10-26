import { forwardRef } from 'react';
import Icon from './Icon.jsx';
import { cx } from './kit.js';

const TONES = {
  default: 'border-line bg-surface-2 text-text',
  warn: 'border-warn/50 bg-warn/10 text-warn-ink',
  keep: 'border-keep/50 bg-keep/10 text-keep-ink',
  cut: 'border-cut/50 bg-cut/10 text-cut-ink',
  info: 'border-info/50 bg-info/10 text-info-ink',
};

// 40 px pill (PRD 9.6). The invisible ::before extends the tap area to 44 px.
const MD = "h-chip min-w-tap px-4 text-sm before:absolute before:-inset-y-[2px] before:inset-x-0 before:content-['']";
const SM = 'h-7 px-2.5 text-xs';

/**
 * Pill chip. Interactive when `onClick` is given (a button with aria-pressed for the
 * selected state); otherwise a static label. Selected = brass fill.
 * size 'sm' (28 px) is only for static chips inside cards.
 */
const Chip = forwardRef(function Chip(
  { selected = false, onClick, icon, tone = 'default', size = 'md', children, className, disabled, role, ...rest },
  ref,
) {
  const interactive = typeof onClick === 'function';
  const look = cx(
    'relative inline-flex max-w-full select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full border font-medium',
    interactive || size !== 'sm' ? MD : SM,
    selected ? 'border-brass bg-brass text-on-brass' : TONES[tone] || TONES.default,
    interactive && 'press disabled:cursor-not-allowed disabled:opacity-40',
    interactive && !selected && 'active:bg-line',
    className,
  );
  const iconEl = icon ? (
    typeof icon === 'string' ? <Icon name={icon} size={interactive || size !== 'sm' ? 18 : 14} /> : icon
  ) : null;
  const label = <span className="truncate">{children}</span>;

  if (!interactive) {
    return (
      <span ref={ref} className={look} role={role} {...rest}>
        {iconEl}
        {label}
      </span>
    );
  }
  const isToggle = !role;
  return (
    <button
      ref={ref}
      type="button"
      role={role}
      aria-pressed={isToggle ? Boolean(selected) : undefined}
      disabled={disabled}
      onClick={onClick}
      className={look}
      {...rest}
    >
      {iconEl}
      {label}
    </button>
  );
});

export default Chip;
