import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Button from '../components/Button.jsx';
import CodeBoxes from '../components/CodeBoxes.jsx';
import { ErrorBox } from '../components/States.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useApp } from '../hooks/useApp.jsx';
import { useSession } from '../hooks/useSession.jsx';
import { useOnline } from '../hooks/useOnline.js';
import { getLookCode, markLookCodeUsed, isValidCode } from '../services/lookCodes.js';

export default function S16LookCodeEntry() {
  const { t } = useT();
  const app = useApp();
  const session = useSession();
  const navigate = useNavigate();
  const online = useOnline();
  const [code, setCode] = useState('');
  const [state, setState] = useState('idle');

  const load = async (c = code) => {
    if (!isValidCode(c)) return;
    setState('loading');
    try {
      const res = await getLookCode(app.salonId, c);
      if (res.status !== 'ok') {
        setState(res.status);
        return;
      }
      await session.start('chair', { salonId: app.salonId, lookCode: c, look: res.data.params });
      markLookCodeUsed(app.salonId, c).catch(() => {});
      navigate('/capture', { state: { fromCode: true } });
    } catch {
      setState('error');
    }
  };

  return (
    <main className="screen mx-auto max-w-[560px]">
      <TopBar title={t('code.title')} step={t('code.step')} />
      <p className="mb-8 text-ink2">{t('code.lead')}</p>
      <CodeBoxes value={code} onChange={(v) => { setCode(v); setState('idle'); }} onComplete={load} label={t('code.title')} />
      <div className="mt-8">
        <Button icon="check" disabled={code.length !== 6 || !online} busy={state === 'loading'} onClick={() => load()}>
          {t('code.load')}
        </Button>
      </div>
      {!online ? <p className="mt-3 text-center text-sm text-warn">{t('code.offline')}</p> : null}
      {state === 'not-found' ? <ErrorBox title={t('code.notFound')} body={t('code.notFoundBody')} /> : null}
      {state === 'expired' ? <ErrorBox title={t('code.expired')} body={t('code.expiredBody')} /> : null}
      {state === 'error' ? <ErrorBox title={t('error.generic')} /> : null}
    </main>
  );
}
