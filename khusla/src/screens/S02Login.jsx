import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Button from '../components/Button.jsx';
import { ErrorBox } from '../components/States.jsx';
import Icon from '../components/Icon.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useApp } from '../hooks/useApp.jsx';
import { completeEmailLink, isEmailLink, sendEmailLink, signInGoogle, storedEmail, signOut } from '../services/auth.js';
import { isEmail } from '../services/invites.js';
import { usingEmulators } from '../lib/firebase.js';

export default function S02Login() {
  const { t } = useT();
  const app = useApp();
  const navigate = useNavigate();
  const loc = useLocation();
  const from = loc.state?.from || new URLSearchParams(loc.search).get('next') || '/';
  const [email, setEmail] = useState(storedEmail());
  const [state, setState] = useState('idle'); // idle | sending | sent | completing | error
  const [err, setErr] = useState(null);
  const linkMode = isEmailLink();

  useEffect(() => {
    if (app.staffUser && !linkMode) navigate(from, { replace: true });
  }, [app.staffUser, linkMode, from, navigate]);

  const completing = useRef(false);
  useEffect(() => {
    if (!linkMode || !storedEmail() || completing.current) return;
    completing.current = true; // a sign-in link works once
    setState('completing');
    completeEmailLink(storedEmail())
      .then(() => navigate(sessionStorageNext() || '/', { replace: true }))
      .catch((e) => {
        setErr(e.code || 'error');
        setState('error');
      });
  }, [linkMode, navigate]);

  const send = async () => {
    setErr(null);
    if (!isEmail(email)) {
      setErr('bad-email');
      return;
    }
    setState('sending');
    try {
      if (app.user?.isAnonymous) await signOut();
      rememberNext(from);
      await sendEmailLink(email.trim().toLowerCase(), '/login');
      setState('sent');
    } catch (e) {
      setErr(e.code || 'error');
      setState('error');
    }
  };

  const finish = async () => {
    setState('completing');
    try {
      await completeEmailLink(email.trim().toLowerCase());
      navigate(sessionStorageNext() || '/', { replace: true });
    } catch (e) {
      setErr(e.code || 'error');
      setState('error');
    }
  };

  const google = async () => {
    setErr(null);
    try {
      if (app.user?.isAnonymous) await signOut();
      await signInGoogle();
      navigate(from, { replace: true });
    } catch (e) {
      if (e.code !== 'auth/popup-closed-by-user') setErr(e.code || 'error');
    }
  };

  return (
    <main className="screen mx-auto max-w-[560px]">
      <TopBar title={t('login.title')} onBack={() => navigate('/')} />
      <p className="mb-6 text-ink2">{t('login.lead')}</p>
      <label className="label mb-2 block" htmlFor="email">
        {t('login.email')}
      </label>
      <input
        id="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        dir="ltr"
        className="field mb-4 text-start"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="name@salon.om"
      />
      {linkMode && !storedEmail() ? (
        <Button icon="check" onClick={finish} busy={state === 'completing'}>
          {t('login.finish')}
        </Button>
      ) : state === 'sent' ? (
        <div className="card mb-4 p-4" role="status">
          <div className="flex items-center gap-2 font-semibold text-ok">
            <Icon name="check" />
            {t('login.sent')}
          </div>
          <p className="mt-1 text-sm text-ink2">{t('login.sentBody', { email })}</p>
          {usingEmulators ? <p className="mt-2 text-xs text-ink2">{t('login.emulatorHint')}</p> : null}
        </div>
      ) : (
        <Button icon="share" onClick={send} busy={state === 'sending'}>
          {t('login.sendLink')}
        </Button>
      )}
      <div className="my-6 flex items-center gap-3 text-sm text-ink2">
        <span className="h-px flex-1 bg-line" />
        {t('common.or')}
        <span className="h-px flex-1 bg-line" />
      </div>
      <Button variant="secondary" icon="globe" onClick={google}>
        {t('login.google')}
      </Button>
      {err ? <ErrorBox title={t('login.error')} body={t(`login.err.${err}`) === `login.err.${err}` ? err : t(`login.err.${err}`)} /> : null}
      <p className="mt-8 text-xs text-ink2">{t('login.privacy')}</p>
    </main>
  );
}

function rememberNext(path) {
  try {
    sessionStorage.setItem('khusla.next', path);
  } catch {
    // default to the splash
  }
}
function sessionStorageNext() {
  try {
    const v = sessionStorage.getItem('khusla.next');
    sessionStorage.removeItem('khusla.next');
    return v;
  } catch {
    return null;
  }
}
