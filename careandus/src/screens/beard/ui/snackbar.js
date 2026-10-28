// LIHYA's snackbar API on the shared Care & Us snackbar:
// show({ message, actionLabel, onAction, duration }), dismiss(), and
// confirmUndo({ message, onUndo, onCommit }) which commits after the undo window.
import { useMemo, useRef } from 'react';
import { useSnackbar as useSharedSnackbar } from '../../../components/Snackbar.jsx';
import { translate } from '../lib/i18n.js';
import { LIMITS } from '../lib/config.js';

export function useSnackbar() {
  const shared = useSharedSnackbar();
  const pending = useRef(null);
  return useMemo(() => {
    const flush = () => {
      const p = pending.current;
      pending.current = null;
      if (p) {
        clearTimeout(p.timer);
        p.onCommit?.();
      }
    };
    return {
      show: (opts) => shared.show(opts),
      dismiss: () => shared.hide?.(),
      confirmUndo: ({ message, onUndo, onCommit, actionLabel, lang = document.documentElement.lang }) => {
        flush();
        const entry = { onCommit, timer: 0 };
        entry.timer = setTimeout(() => {
          if (pending.current === entry) flush();
        }, LIMITS.undoMs);
        pending.current = entry;
        shared.show({
          message,
          actionLabel: actionLabel || translate(lang, 'common.undo'),
          duration: LIMITS.undoMs,
          onAction: () => {
            if (pending.current === entry) {
              clearTimeout(entry.timer);
              pending.current = null;
              onUndo?.();
            }
          },
        });
      },
    };
  }, [shared]);
}

export default useSnackbar;
