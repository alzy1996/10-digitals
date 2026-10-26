import { useEffect } from 'react';
import { subscribeWriteErrors } from '../services/sync.js';
import { useSnackbar } from '../components/Snackbar.jsx';
import { useT } from '../lib/i18n/useT.js';

// Writes are optimistic and may sync later; when the server refuses one (for example a
// role changed while this phone was offline), say so instead of failing silently.
export default function WriteErrorWatcher() {
  const { show } = useSnackbar();
  const { t } = useT();
  useEffect(
    () =>
      subscribeWriteErrors((err) => {
        const denied = err && (err.code === 'permission-denied' || err.code === 'firestore/permission-denied');
        show({ message: t(denied ? 'common.writeDenied' : 'common.writeFailed') });
      }),
    [show, t],
  );
  return null;
}
