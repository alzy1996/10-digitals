import Button from './Button.jsx';
import Icon from './Icon.jsx';
import { cx, useOptionalT } from './kit.js';

/**
 * Error block: icon, optional title, message (default: "Something went wrong. Your work is safe
 * on this phone.") and a retry button when `onRetry` is given.
 */
export default function ErrorState({ title, message, onRetry, retryLabel, icon = 'warning', className }) {
  const { t } = useOptionalT();
  return (
    <div role="alert" className={cx('flex flex-col items-center gap-3 px-4 py-10 text-center', className)}>
      <span className="flex h-14 w-14 items-center justify-center rounded-full border border-warn/50 text-warn">
        <Icon name={icon} size={28} />
      </span>
      {title ? <h2 className="text-xl">{title}</h2> : null}
      <p className="max-w-sm text-text-2">{message || t('common.error')}</p>
      {onRetry ? (
        <Button variant="secondary" icon="refresh" onClick={onRetry} className="mt-2">
          {retryLabel || t('common.retry')}
        </Button>
      ) : null}
    </div>
  );
}
