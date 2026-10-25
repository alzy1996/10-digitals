import Icon from './Icon.jsx';
import { useOnline, usePendingWrites } from '../hooks/useOnline.js';
import { cx, useOptionalT } from './kit.js';

/**
 * Pending-sync badge for the top bar (PRD 8.5: writes queue offline and sync later).
 * Offline: "Offline". Online with queued writes: "Saved on this phone, will sync" (icon only on
 * phones, text from md up). Hidden when everything is synced. The live region stays mounted so
 * screen readers hear the change.
 */
export default function SyncBadge({ className }) {
  const { t } = useOptionalT();
  const online = useOnline();
  const pending = usePendingWrites();

  let state = null;
  if (!online) state = { icon: 'wifi-off', text: t('common.offline'), tone: 'border-warn/50 bg-warn/10 text-warn', compact: false };
  else if (pending > 0)
    state = { icon: 'cloud', text: t('common.pendingSync'), tone: 'border-info/50 bg-info/10 text-info', compact: true };

  return (
    <span role="status" aria-live="polite" className={cx('inline-flex shrink-0', className)}>
      {state ? (
        <span
          title={state.text}
          className={cx('inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium', state.tone)}
        >
          <Icon name={state.icon} size={16} />
          <span className={state.compact ? 'sr-only md:not-sr-only md:whitespace-nowrap' : 'whitespace-nowrap'}>{state.text}</span>
        </span>
      ) : null}
    </span>
  );
}
