import Button from './Button.jsx';
import Icon from './Icon.jsx';
import { cx, useOptionalT } from './kit.js';

/**
 * Empty list block: icon, title (default "Nothing here yet"), optional message and one action
 * (`action` node, or `actionLabel` + `onAction` for a secondary button).
 */
export default function EmptyState({ icon = 'box', title, message, action, actionLabel, onAction, actionIcon, className }) {
  const { t } = useOptionalT();
  return (
    <div className={cx('flex flex-col items-center gap-3 px-4 py-10 text-center', className)}>
      <span className="flex h-14 w-14 items-center justify-center rounded-full border border-line text-ink2">
        <Icon name={icon} size={28} />
      </span>
      <h2 className="text-xl">{title || t('beard.common.empty')}</h2>
      {message ? <p className="max-w-sm text-ink2">{message}</p> : null}
      {action ||
        (actionLabel && onAction ? (
          <Button variant="secondary" icon={actionIcon} onClick={onAction} className="mt-2">
            {actionLabel}
          </Button>
        ) : null)}
    </div>
  );
}
