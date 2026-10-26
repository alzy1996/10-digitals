import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from './SessionContext.jsx';
import { useSnackbar } from '../components/Snackbar.jsx';
import { useT } from '../lib/i18n/useT.js';

// After 10 idle minutes the session wipes every photo (PRD 8.5); bring the device back
// to the start screen of its mode and say why.
export default function IdleWipeWatcher() {
  const { onIdleWipe, path } = useSession();
  const navigate = useNavigate();
  const { show } = useSnackbar();
  const { t } = useT();

  useEffect(
    () =>
      onIdleWipe(() => {
        navigate(path(''), { replace: true });
        show({ message: t('session.wiped.idle') });
      }),
    [onIdleWipe, navigate, path, show, t],
  );

  return null;
}
