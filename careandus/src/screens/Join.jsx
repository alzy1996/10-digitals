import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Button from '../components/Button.jsx';
import { ErrorBox, Steps } from '../components/States.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useApp } from '../hooks/useApp.jsx';
import { acceptInvite } from '../services/staff.js';

export default function Join() {
  const { t } = useT();
  const app = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const salonId = params.get('salon');
  const [state, setState] = useState('idle');
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (app.user === undefined) return;
    if (!app.staffUser) {
      navigate(`/login?next=${encodeURIComponent(`/join?salon=${salonId}`)}`, { replace: true, state: { from: `/join?salon=${salonId}` } });
      return;
    }
    if (!salonId || state !== 'idle') return;
    setState('joining');
    acceptInvite(salonId)
      .then(() => {
        app.setSalonId(salonId);
        setState('done');
        navigate('/home', { replace: true });
      })
      .catch((e) => {
        setErr(e.code || 'error');
        setState('error');
      });
  }, [app, salonId, state, navigate]);

  return (
    <main className="screen mx-auto max-w-[560px]">
      <TopBar title={t('join.title')} onBack={() => navigate('/')} />
      {!salonId ? <ErrorBox title={t('join.badLink')} /> : null}
      {state === 'joining' ? <Steps items={[{ key: 'j', label: t('join.joining'), state: 'doing' }]} /> : null}
      {state === 'error' ? (
        <ErrorBox
          title={t('join.failed')}
          body={err === 'no-invite' ? t('join.noInvite', { email: app.staffUser?.email || '' }) : t('join.failedBody')}
          action={<Button variant="secondary" onClick={() => navigate('/')}>{t('common.home')}</Button>}
        />
      ) : null}
    </main>
  );
}
