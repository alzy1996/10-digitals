import { forwardRef } from 'react';
import Icon from './Icon.jsx';
import { cx } from './kit.js';

const TONES = {
  default: 'text-ink active:bg-surface2',
  muted: 'text-ink2 active:bg-surface2',
  brass: 'text-plum active:bg-surface2',
  danger: 'text-risk active:bg-surface2',
  onBrass: 'bg-plum text-onplum active:bg-surface2',
  bordered: 'border border-line text-ink active:bg-surface2',
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
        'press inline-flex shrink-0 items-center justify-center rounded-control disabled:cursor-not-allowed disabled:opacity-40',
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
