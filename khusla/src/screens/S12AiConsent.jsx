import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Button from '../components/Button.jsx';
import Icon from '../components/Icon.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useApp } from '../hooks/useApp.jsx';
import { useSession } from '../hooks/useSession.jsx';
import { logConsent } from '../services/consents.js';

export default function S12AiConsent() {
  const { t } = useT();
  const app = useApp();
  const session = useSession();
  const navigate = useNavigate();
  const decide = (granted) => {
    logConsent(app.salonId, { type: 'ai_render', clientId: session.client?.id || null, consultationId: session.consultationId || null, granted });
    if (granted) navigate('/ai/result', { replace: true, state: { go: Date.now() } });
    else navigate(-1);
  };
  return (
    <main className="screen mx-auto max-w-[560px]">
      <TopBar title={t('ai.consentTitle')} />
      <div className="card p-6">
        <Icon name="cloud" size={32} className="text-clay" />
        <p className="mt-3 text-lg leading-relaxed">{t('ai.consentBody')}</p>
        <ul className="mt-4 space-y-2 text-sm text-ink2">
          <li className="flex gap-2"><Icon name="check" size={18} className="text-ok" />{t('ai.consent1')}</li>
          <li className="flex gap-2"><Icon name="check" size={18} className="text-ok" />{t('ai.consent2')}</li>
          <li className="flex gap-2"><Icon name="info" size={18} />{t('ai.consent3')}</li>
        </ul>
      </div>
      <div className="mt-6 space-y-3">
        <Button icon="cloud" onClick={() => decide(true)}>{t('ai.send')}</Button>
        <Button variant="secondary" icon="lock" onClick={() => decide(false)}>{t('ai.keep')}</Button>
      </div>
    </main>
  );
}
