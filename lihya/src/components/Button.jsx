import { forwardRef } from 'react';
import Icon from './Icon.jsx';
import { cx } from './kit.js';

const BASE =
  'press relative inline-flex select-none items-center justify-center gap-2 rounded-ctl text-center leading-tight ' +
  'disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:opacity-40';

const SIZES = {
  lg: 'min-h-btn-primary px-6 text-[18px]',
  md: 'min-h-btn-secondary px-5 text-base',
  sm: 'min-h-tap px-4 text-sm',
};

const VARIANTS = {
  primary: 'bg-brass font-semibold text-on-brass active:bg-brass/80',
  secondary: 'border border-line bg-transparent font-medium text-text active:bg-surface-2',
  ghost: 'bg-transparent font-medium text-text active:bg-surface-2',
  danger: 'border border-cut/70 bg-transparent font-medium text-cut active:bg-cut/10',
};

const DEFAULT_SIZE = { primary: 'lg', secondary: 'md', ghost: 'md', danger: 'md' };

/** Small rotating arc used while an action runs. */
export function Spinner({ size = 20, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
      className={cx('shrink-0 animate-spin motion-reduce:animate-none', className)}
    >
      <circle cx="12" cy="12" r="8.5" strokeOpacity="0.25" />
      <path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5" />
    </svg>
  );
}

function renderIcon(icon, size) {
  if (!icon) return null;
  return typeof icon === 'string' ? <Icon name={icon} size={size} /> : icon;
}

/**
 * Primary: 64 px, brass, full width, 18 px / 600 (PRD 9.6). Secondary: 48 px with a 1 px line border.
 * Ghost and danger are 48 px. `size` ('lg' | 'md' | 'sm') overrides the variant default;
 * `full` overrides full width (default: primary only). `as` renders another element (for example a
 * router Link) with the same look.
 */
const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size,
    icon,
    iconEnd,
    loading = false,
    disabled = false,
    full,
    onClick,
    children,
    className,
    type = 'button',
    as: Comp = 'button',
    ...rest
  },
  ref,
) {
  const sz = SIZES[size] ? size : DEFAULT_SIZE[variant] || 'md';
  const isFull = full ?? variant === 'primary';
  const inert = disabled || loading;
  const iconSize = sz === 'lg' ? 24 : 20;
  const native = Comp === 'button';

  const handleClick = (e) => {
    if (inert) {
      e.preventDefault();
      return;
    }
    if (onClick) onClick(e);
  };

  return (
    <Comp
      ref={ref}
      type={native ? type : undefined}
      disabled={native ? disabled : undefined}
      aria-disabled={!native && disabled ? true : undefined}
      aria-busy={loading ? true : undefined}
      onClick={handleClick}
      className={cx(
        BASE,
        SIZES[sz],
        VARIANTS[variant] || VARIANTS.primary,
        isFull && 'w-full',
        loading && 'cursor-progress',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={iconSize} /> : renderIcon(icon, iconSize)}
      {children !== undefined && children !== null && children !== false ? <span className="min-w-0">{children}</span> : null}
      {!loading ? renderIcon(iconEnd, iconSize) : null}
    </Comp>
  );
});

export default Button;
