import Icon from './Icon.jsx';

const base =
  'press inline-flex items-center justify-center gap-2 select-none disabled:opacity-45 disabled:pointer-events-none';

export default function Button({
  children,
  variant = 'primary',
  icon,
  iconEnd,
  full = true,
  className = '',
  type = 'button',
  busy = false,
  ...rest
}) {
  const styles = {
    primary: 'min-h-btn rounded-control bg-plum text-onplum text-[18px] font-semibold px-6 active:opacity-90',
    secondary: 'min-h-btn2 rounded-control border border-line bg-surface text-ink font-medium px-5 active:bg-surface2',
    ghost: 'min-h-tap rounded-control text-plum font-semibold px-4 active:bg-surface2',
    danger: 'min-h-btn2 rounded-control border border-risk text-risk font-semibold px-5 active:bg-surface2',
  };
  return (
    <button
      type={type}
      className={`${base} ${styles[variant]} ${full ? 'w-full' : ''} ${className}`}
      aria-busy={busy || undefined}
      {...rest}
    >
      {icon ? <Icon name={icon} /> : null}
      <span>{busy ? <span style={{ animation: 'pulse-soft 1.1s infinite' }}>{children}</span> : children}</span>
      {iconEnd ? <Icon name={iconEnd} className="rtl:-scale-x-100" /> : null}
    </button>
  );
}
