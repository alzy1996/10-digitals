import Icon from './Icon.jsx';
import { useOnline, usePendingWrites } from '../hooks/useOnline.js';
import { cx, useOptionalT } from './kit.js';

const TONES = {
  warn: 'border-warn/50 bg-warn/10 text-warn-ink',
  info: 'border-info/50 bg-info/10 text-info-ink',
};

/**
 * What the badge shows (PRD 10.4, 14.2): whenever writes are queued, "Saved on this phone, will
 * sync", with "Offline" in front of it while there is no network; "Offline" alone only when nothing
 * is queued; nothing when everything is synced. `full` is the sentence (screen readers, tooltip,
 * tablets and up); `short` are the visible lines on phones, so the reassurance never hides there.
 * Returns i18n keys: { kind, offline, icon, tone, full: [key], short: [key] } or null.
 */
export function syncBadgeState({ online, pending }) {
  const queued = Number(pending) > 0;
  if (queued && !online) {
    return {
      kind: 'offline-pending',
      offline: true,
      icon: 'wifi-off',
      tone: 'warn',
      full: ['common.offline', 'common.pendingSync'],
      short: ['common.offline', 'ui.sync.savedShort'],
    };
  }
  if (queued) {
    return { kind: 'pending', offline: false, icon: 'cloud', tone: 'info', full: ['common.pendingSync'], short: ['ui.sync.savedShort'] };
  }
  if (!online) return { kind: 'offline', offline: true, icon: 'wifi-off', tone: 'warn', full: ['common.offline'], short: ['common.offline'] };
  return null;
}

function useSyncState() {
  const { t } = useOptionalT();
  const state = syncBadgeState({ online: useOnline(), pending: usePendingWrites() });
  return { t, state, full: state ? state.full.map((k) => t(k)).join(' · ') : '' };
}

/**
 * Pending-sync badge (PRD 8.5: writes queue offline and sync later). A pill: phones see the short
 * lines ("Offline" / "Saved, will sync"), md and up the full sentence. Hidden when everything is
 * synced. The live region stays mounted so screen readers hear the change, in full, once.
 * `offlineStrip`: the offline states are left to <SyncStrip/> below md (the top bar is too narrow
 * for them next to the title), so the pill shows them from md up only.
 */
export default function SyncBadge({ className, offlineStrip = false }) {
  const { t, state, full } = useSyncState();
  const hideOnPhone = Boolean(state && offlineStrip && state.offline);
  return (
    <span role="status" aria-live="polite" className={cx('inline-flex shrink-0', className)}>
      {state ? (
        <span
          title={full}
          data-sync={state.kind}
          className={cx(
            'min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
            hideOnPhone ? 'hidden md:inline-flex' : 'inline-flex',
            TONES[state.tone],
          )}
        >
          <Icon name={state.icon} size={16} className="shrink-0" />
          <span className="sr-only">{full}</span>
          <span aria-hidden="true" className="flex flex-col leading-tight md:hidden">
            {state.short.map((k) => (
              <span key={k} className="whitespace-nowrap">
                {t(k)}
              </span>
            ))}
          </span>
          <span aria-hidden="true" className="hidden whitespace-nowrap md:inline">
            {full}
          </span>
        </span>
      ) : null}
    </span>
  );
}

/**
 * Phones only (below md): a full-width line under the top bar while offline, with the whole
 * sentence ("Offline · Saved on this phone, will sync" when writes are queued). Offline lasts, so the
 * line appears once instead of squeezing the screen title; it is its own live region.
 */
export function SyncStrip({ className }) {
  const { state, full } = useSyncState();
  const show = Boolean(state && state.offline);
  return (
    <div role="status" aria-live="polite" className={cx('md:hidden', className)}>
      {show ? (
        <div className="bg-bg">
          <p
            data-sync={state.kind}
            className={cx('gutter flex min-h-8 items-center justify-center gap-1.5 border-t py-1 text-center text-xs font-medium', TONES[state.tone])}
          >
            <Icon name={state.icon} size={16} className="shrink-0" />
            <span>{full}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
