import { forwardRef, useId } from 'react';
import Icon from './Icon.jsx';
import { cx } from './kit.js';

/**
 * Text field for the few typing places (client search, email, product rows): label above,
 * 48 px input, error (or hint) below. onChange(value, event).
 * `icon` adds a start icon (for example "search"); `end` puts a node at the end (a clear button).
 * `multiline` renders a textarea. Phone numbers and emails should pass dir="ltr".
 */
const Field = forwardRef(function Field(
  {
    label,
    value,
    onChange,
    error,
    hint,
    icon,
    end,
    type = 'text',
    id,
    multiline = false,
    rows = 3,
    className,
    inputClassName,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const fid = id || `field${autoId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const msgId = `${fid}-msg`;
  const Comp = multiline ? 'textarea' : 'input';
  const message = error || hint;
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      {label ? (
        <label htmlFor={fid} className="text-sm font-medium text-text-2">
          {label}
        </label>
      ) : null}
      <div
        className={cx(
          'flex items-center gap-1 rounded-ctl border bg-surface-2 transition-colors duration-[var(--dur-press)] ease-out',
          'focus-within:border-brass focus-within:ring-1 focus-within:ring-brass',
          multiline ? 'min-h-[96px] items-start' : 'min-h-btn-secondary',
          error ? 'border-cut' : 'border-line',
        )}
      >
        {icon ? <Icon name={icon} size={20} className={cx('ms-3 text-text-2', multiline && 'mt-3.5')} /> : null}
        <Comp
          ref={ref}
          id={fid}
          type={multiline ? undefined : type}
          rows={multiline ? rows : undefined}
          value={value ?? ''}
          onChange={(e) => onChange && onChange(e.target.value, e)}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? msgId : undefined}
          className={cx(
            'w-full min-w-0 flex-1 bg-transparent px-3 text-base text-text placeholder:text-text-2/70 focus:outline-none focus-visible:outline-none',
            multiline ? 'resize-y py-3' : 'min-h-btn-secondary',
            inputClassName,
          )}
          {...rest}
        />
        {end}
      </div>
      {error ? (
        <p id={msgId} className="flex items-start gap-1.5 text-sm text-cut-ink">
          <Icon name="warning" size={16} className="mt-0.5" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={msgId} className="text-sm text-text-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export default Field;
