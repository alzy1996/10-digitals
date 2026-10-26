import { forwardRef } from 'react';
import Icon from './Icon.jsx';
import { cx } from './kit.js';

const TONES = {
  default: 'text-text active:bg-surface-2',
  muted: 'text-text-2 active:bg-surface-2',
  brass: 'text-brass active:bg-brass/10',
  danger: 'text-cut-ink active:bg-cut/10',
  onBrass: 'bg-brass text-on-brass active:bg-brass/80',
  bordered: 'border border-line text-text active:bg-surface-2',
};

/**
 * Square icon-only button, 44 px minimum (48 px with size "lg"). `label` is required:
 * it becomes the accessible name (aria-label) and the tooltip.
 */
const IconButton = forwardRef(function IconButton(
  { icon, label, onClick, size = 'md', tone = 'default', mirror, disabled, className, type = 'button', ...rest },
  ref,
) {
  const box = size === 'lg' ? 'h-12 w-12' : 'h-11 w-11';
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'press inline-flex shrink-0 items-center justify-center rounded-ctl disabled:cursor-not-allowed disabled:opacity-40',
        box,
        TONES[tone] || TONES.default,
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={size === 'lg' ? 26 : 24} mirror={mirror} />
    </button>
  );
});

export default IconButton;
