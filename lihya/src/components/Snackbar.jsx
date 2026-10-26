import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { LIMITS } from '../config/app.js';
import { cx, useOptionalT } from './kit.js';

const SnackbarContext = createContext(null);
let seq = 0;

/**
 * One snackbar (PRD 9.6): message, optional action (Undo), dismiss button.
 * Presentational; SnackbarProvider shows it at the bottom, one at a time.
 */
export default function Snackbar({ message, actionLabel, onAction, onDismiss, className }) {
  const { t } = useOptionalT();
  return (
    <div
      className={cx(
        'pointer-events-auto flex min-h-[56px] w-full items-center gap-1 rounded-card border border-line bg-surface-2 py-1 pe-1 ps-4 text-text',
        className,
      )}
    >
      <p className="min-w-0 flex-1 py-2 text-sm leading-snug">{message}</p>
      {onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="press min-h-tap shrink-0 rounded-ctl px-3 text-base font-semibold text-brass active:bg-brass/10"
        >
          {actionLabel || t('common.undo')}
        </button>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('ui.snackbar.dismiss')}
          title={t('ui.snackbar.dismiss')}
          className="press inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-ctl text-text-2 active:bg-line"
        >
          <Icon name="close" size={20} />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Holds the single visible snackbar. Showing a new one replaces the current one.
 * Sits above ScreenFrame's footer (CSS variable --footer-h) and the safe area.
 */
export function SnackbarProvider({ children }) {
  const [current, setCurrent] = useState(null);
  const [entered, setEntered] = useState(false);
  const currentRef = useRef(null);
  const timerRef = useRef(0);

  const finish = useCallback((id, reason) => {
    const cur = currentRef.current;
    if (!cur || (id !== undefined && cur.id !== id)) return;
    clearTimeout(timerRef.current);
    currentRef.current = null;
    setCurrent(null);
    setEntered(false);
    if (cur.onClose) {
      try {
        cur.onClose(reason);
      } catch (err) {
        console.error(err);
      }
    }
  }, []);

  const show = useCallback(
    ({ message, actionLabel, onAction, duration = LIMITS.undoMs, onClose } = {}) => {
      if (currentRef.current) finish(currentRef.current.id, 'replaced');
      seq += 1;
      const item = { id: seq, message, actionLabel, onAction, duration, onClose };
      currentRef.current = item;
      setCurrent(item);
      setEntered(false);
      timerRef.current = setTimeout(() => finish(item.id, 'timeout'), Math.max(1000, Number(duration) || LIMITS.undoMs));
      return item.id;
    },
    [finish],
  );

  const dismiss = useCallback((id) => finish(id, 'dismiss'), [finish]);

  /**
   * Undo instead of a confirm dialog (PRD 8.5): the change is applied by onCommit after the
   * snackbar leaves (timeout, dismiss, replaced, page hidden) unless the person taps Undo,
   * which calls onUndo instead.
   */
  const confirmUndo = useCallback(
    ({ message, onCommit, onUndo, actionLabel, duration = LIMITS.undoMs }) => {
      let settled = false;
      const once = (fn) => {
        if (settled) return;
        settled = true;
        if (fn) fn();
      };
      return show({
        message,
        actionLabel,
        duration,
        onAction: () => once(onUndo),
        onClose: () => once(onCommit),
      });
    },
    [show],
  );

  // Slide in on the next frame.
  useEffect(() => {
    if (!current) return undefined;
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [current]);

  // A pending commit must not be lost when the app is closed or hidden.
  useEffect(() => {
    const flush = () => {
      if (currentRef.current) finish(currentRef.current.id, 'pagehide');
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      clearTimeout(timerRef.current);
    };
  }, [finish]);

  const api = useMemo(() => ({ show, dismiss, confirmUndo }), [show, dismiss, confirmUndo]);

  const onAction = () => {
    const cur = currentRef.current;
    if (!cur) return;
    if (cur.onAction) {
      try {
        cur.onAction();
      } catch (err) {
        console.error(err);
      }
    }
    // Undo handled: close without running the commit.
    clearTimeout(timerRef.current);
    currentRef.current = null;
    setCurrent(null);
    setEntered(false);
  };

  return (
    <SnackbarContext.Provider value={api}>
      {children}
      <div
        className="gutter pointer-events-none fixed inset-x-0 z-50 flex justify-center"
        style={{ bottom: 'calc(max(var(--footer-h, 0px), var(--safe-bottom)) + 12px)' }}
      >
        <div role="status" aria-live="polite" aria-atomic="true" className="w-full max-w-[480px]">
          {current ? (
            <div
              key={current.id}
              className="transition duration-[var(--dur-press)] ease-out"
              style={{ opacity: entered ? 1 : 0, transform: entered ? 'none' : 'translateY(8px)' }}
            >
              <Snackbar
                message={current.message}
                actionLabel={current.actionLabel}
                onAction={current.onAction ? onAction : undefined}
                onDismiss={() => finish(current.id, 'dismiss')}
              />
            </div>
          ) : null}
        </div>
      </div>
    </SnackbarContext.Provider>
  );
}

const warnOnce = { done: false };
const fallbackApi = {
  show: () => {
    if (!warnOnce.done) {
      warnOnce.done = true;
      console.warn('useSnackbar: no <SnackbarProvider> above this component');
    }
    return 0;
  },
  dismiss: () => {},
  confirmUndo: ({ onCommit }) => {
    if (onCommit) onCommit();
    return 0;
  },
};

/** const { show, dismiss, confirmUndo } = useSnackbar(); show({ message, actionLabel, onAction, duration = 6000 }) */
export function useSnackbar() {
  return useContext(SnackbarContext) || fallbackApi;
}
