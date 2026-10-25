import { useEffect, useId, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useT } from '../lib/i18n/useT.js';
import { useAuth } from '../state/AuthContext.jsx';
import { useOnline } from '../hooks/useOnline.js';
import { authErrorKey, safeNextPath, sendEmailLink, signInGoogle, signOutUser } from '../services/auth.js';
import { acceptInvite } from '../services/invites.js';
import BottomAction from '../components/BottomAction.jsx';
import Button from '../components/Button.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Field from '../components/Field.jsx';
import Icon from '../components/Icon.jsx';
import ScreenFallback from '../components/ScreenFallback.jsx';
import ScreenFrame from '../components/ScreenFrame.jsx';
import Skeleton from '../components/Skeleton.jsx';
import { useSnackbar } from '../components/Snackbar.jsx';
import BrandMark from './entry/BrandMark.jsx';
import { rememberLastShop } from './entry/prefs.js';

const RESEND_SECONDS = 30;

/** Keep an email address left-to-right inside an Arabic sentence. */
function isolate(text) {
  return `⁨${text}⁩`;
}

function Alert({ children, tone = 'cut', icon = 'warning' }) {
  const tones = {
    cut: 'border-cut/50 bg-cut/10',
    warn: 'border-warn/50 bg-warn/10',
  };
  return (
    <div role="alert" className={`flex items-start gap-3 rounded-ctl border p-3 text-sm text-text ${tones[tone] || tones.cut}`}>
      <Icon name={icon} size={20} className={tone === 'warn' ? 'mt-0.5 shrink-0 text-warn' : 'mt-0.5 shrink-0 text-cut'} />
      <p className="min-w-0 flex-1">{children}</p>
    </div>
  );
}

/** Skeleton shimmer with the step name while sign-in or joining runs. */
function Working({ title, label }) {
  return (
    <ScreenFrame title={title}>
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-6 py-12 text-center">
        <Skeleton rounded="full" className="h-20 w-20" />
        <p className="text-lg text-text">{label}</p>
        <div className="flex w-full max-w-xs flex-col items-center gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </ScreenFrame>
  );
}

function OrDivider() {
  const { t } = useT();
  return (
    <div className="flex items-center gap-3 text-sm text-text-2" aria-hidden="true">
      <span className="h-px flex-1 bg-line" />
      <span>{t('common.or')}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/** The link was opened on another phone: Firebase needs the address typed again. */
function NeedEmail() {
  const { t } = useT();
  const { completeEmailLink } = useAuth();
  const formId = useId();
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    const address = email.trim();
    if (!address) {
      setError(t('entry.login.emailRequired'));
      return;
    }
    // The provider switches to "completing" and then to signed in or to an error state.
    completeEmailLink(address).catch((err) => console.warn('email link sign-in failed', err));
  };

  return (
    <ScreenFrame
      title={t('entry.login.needEmailTitle')}
      back="/"
      footer={
        <Button type="submit" form={formId} icon="check">
          {t('entry.login.finish')}
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        <BrandMark size="sm" heading="div" />
        <p className="text-text">{t('auth.linkOtherDevice')}</p>
        <form id={formId} onSubmit={submit} noValidate>
          <Field
            label={t('entry.login.email')}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            dir="ltr"
            placeholder={t('entry.login.emailPlaceholder')}
            value={email}
            onChange={(v) => {
              setEmail(v);
              setError(null);
            }}
            error={error}
            icon="mail"
          />
        </form>
      </div>
    </ScreenFrame>
  );
}

/** Email link + Google. In join mode the link continues to /join/<shopId>. */
function SignInForm({ next, joinMode }) {
  const { t } = useT();
  const online = useOnline();
  const { authError, clearAuthError, emailLink } = useAuth();
  const { show } = useSnackbar();
  const formId = useId();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [sent, setSent] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const wait = sent ? Math.max(0, RESEND_SECONDS - Math.floor((now - sent.at) / 1000)) : 0;

  useEffect(() => {
    if (!sent || wait <= 0) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [sent, wait]);

  const [linkErrorDone, setLinkErrorDone] = useState(false);
  // The error of an old link stops showing once a new link was asked for.
  const linkError = emailLink.status === 'error' && !linkErrorDone ? emailLink.error : null;
  const shownError = formError || (authError ? t(authErrorKey(authError)) : null) || (linkError ? t(authErrorKey(linkError)) : null);

  const sendTo = async (address, { again = false } = {}) => {
    if (!online) {
      setFormError(t('entry.login.offline'));
      return;
    }
    setBusy('send');
    setFormError(null);
    setLinkErrorDone(true);
    clearAuthError();
    try {
      const to = await sendEmailLink(address, { next });
      const at = Date.now();
      setSent({ email: to, at });
      setNow(at);
      if (again) show({ message: t('entry.login.resent') });
    } catch (err) {
      const key = authErrorKey(err);
      if (key !== 'auth.error.invalidEmail') console.warn('sign-in link not sent', err);
      if (key === 'auth.error.invalidEmail') {
        setSent(null);
        setEmailError(t(key));
      } else {
        setFormError(t(key));
      }
    } finally {
      setBusy(null);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (busy) return;
    const address = email.trim();
    if (!address) {
      setEmailError(t('entry.login.emailRequired'));
      return;
    }
    sendTo(address);
  };

  const google = async () => {
    if (busy) return;
    if (!online) {
      setFormError(t('entry.login.offline'));
      return;
    }
    setBusy('google');
    setFormError(null);
    clearAuthError();
    try {
      await signInGoogle();
    } catch (err) {
      console.warn('Google sign-in failed', err);
      setFormError(t(authErrorKey(err)));
      setBusy(null);
      return;
    }
    setBusy(null);
  };

  const title = t(joinMode ? 'entry.join.title' : 'entry.login.title');

  if (sent) {
    return (
      <ScreenFrame
        title={title}
        back="/"
        footer={
          <BottomAction>
            <Button
              variant="secondary"
              icon="refresh"
              full
              disabled={wait > 0}
              loading={busy === 'send'}
              onClick={() => sendTo(sent.email, { again: true })}
            >
              <span className="num">{wait > 0 ? t('entry.login.resendIn', { s: wait }) : t('entry.login.resend')}</span>
            </Button>
            <Button
              variant="ghost"
              full
              onClick={() => {
                setSent(null);
                setFormError(null);
              }}
            >
              {t('entry.login.otherEmail')}
            </Button>
          </BottomAction>
        }
      >
        <div className="flex flex-col items-center gap-5 py-8 text-center" aria-live="polite">
          <span className="flex h-20 w-20 items-center justify-center rounded-full border border-brass/60 text-brass">
            <Icon name="mail" size={36} />
          </span>
          <h2 className="text-2xl">{t('entry.login.checkTitle')}</h2>
          <p className="max-w-sm text-text">{t('auth.linkSent', { email: isolate(sent.email) })}</p>
          <p className="max-w-sm text-sm text-text-2">{t('entry.login.spam')}</p>
          {shownError ? <Alert>{shownError}</Alert> : null}
        </div>
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame
      title={title}
      back="/"
      footer={
        <Button type="submit" form={formId} icon="mail" loading={busy === 'send'} disabled={busy === 'google'}>
          {t('entry.login.send')}
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        {joinMode ? (
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-brass/60 text-brass">
            <Icon name="users" size={28} />
          </span>
        ) : (
          <BrandMark size="sm" heading="div" />
        )}
        <div>
          <h2 className="text-2xl">{t(joinMode ? 'entry.join.title' : 'entry.login.heading')}</h2>
          <p className="mt-2 text-text-2">{t(joinMode ? 'entry.join.lead' : 'entry.login.lead')}</p>
        </div>

        {!online && formError !== t('entry.login.offline') ? (
          <Alert tone="warn" icon="wifi-off">
            {t('entry.login.offline')}
          </Alert>
        ) : null}
        {shownError ? <Alert>{shownError}</Alert> : null}

        <form id={formId} onSubmit={submit} noValidate>
          <Field
            label={t('entry.login.email')}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            dir="ltr"
            placeholder={t('entry.login.emailPlaceholder')}
            value={email}
            onChange={(v) => {
              setEmail(v);
              setEmailError(null);
            }}
            error={emailError}
            icon="mail"
          />
        </form>

        <OrDivider />

        <Button variant="secondary" icon="google" full loading={busy === 'google'} disabled={busy === 'send'} onClick={google}>
          {t('entry.login.google')}
        </Button>

        {!joinMode ? (
          <p className="flex items-start gap-2 border-t border-line pt-4 text-sm text-text-2">
            <Icon name="link" size={18} className="mt-0.5 shrink-0" />
            <span>{t('entry.login.customerHint')}</span>
          </p>
        ) : null}
      </div>
    </ScreenFrame>
  );
}

/** Signed in through an invite link: accept the invite, then open the shop. */
function JoinShop({ shopId, user }) {
  const { t } = useT();
  const navigate = useNavigate();
  const online = useOnline();
  const { show } = useSnackbar();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: 'joining', error: null });
  const [leaving, setLeaving] = useState(false);
  const jobRef = useRef({ key: null, promise: null });

  useEffect(() => {
    if (!online) {
      setState({ status: 'offline', error: null });
      return undefined;
    }
    const key = `${user.uid}:${shopId}:${attempt}`;
    // One accept per attempt, also when React runs this effect twice in development.
    if (jobRef.current.key !== key) jobRef.current = { key, promise: acceptInvite(shopId) };
    let alive = true;
    setState({ status: 'joining', error: null });
    jobRef.current.promise.then(
      (res) => {
        if (!alive) return;
        rememberLastShop(res.shopId);
        if (!res.already) show({ message: t('entry.join.welcome', { role: t(`role.${res.role}`) }) });
        navigate(`/s/${res.shopId}`, { replace: true });
      },
      (err) => {
        if (!alive) return;
        console.warn('acceptInvite failed', err);
        const offline = err?.code === 'unavailable' || navigator.onLine === false;
        setState({ status: offline ? 'offline' : 'error', error: err });
      },
    );
    return () => {
      alive = false;
    };
  }, [shopId, user.uid, attempt, online, navigate, show, t]);

  const switchAccount = () => {
    setLeaving(true);
    signOutUser()
      .catch((err) => {
        console.error('sign out failed', err);
        setLeaving(false);
      });
  };

  if (state.status === 'joining') return <Working title={t('entry.join.title')} label={t('entry.join.joining')} />;

  const code = state.error?.code;
  const wrongAccount = code === 'invite/not-found' || code === 'invite/email-not-verified';
  const message = state.status === 'offline' ? t('entry.join.offline') : t(authErrorKey(state.error));
  const canRetry = state.status === 'offline' || !wrongAccount;

  return (
    <ScreenFrame
      title={t('entry.join.title')}
      back="/"
      footer={
        <BottomAction>
          {wrongAccount ? (
            <Button variant="secondary" icon="logout" full loading={leaving} onClick={switchAccount}>
              {t('entry.join.otherAccount')}
            </Button>
          ) : null}
          <Button variant="ghost" icon="home" full onClick={() => navigate('/')}>
            {t('entry.join.myShops')}
          </Button>
        </BottomAction>
      }
    >
      <ErrorState
        icon={state.status === 'offline' ? 'wifi-off' : 'warning'}
        title={t('entry.join.failedTitle')}
        message={message}
        onRetry={canRetry ? () => setAttempt((n) => n + 1) : undefined}
      />
      {user.email ? (
        <p className="break-all text-center text-sm text-text-2">{t('shop.signedInAs', { email: isolate(user.email) })}</p>
      ) : null}
    </ScreenFrame>
  );
}

/**
 * S02: staff sign-in (/login) and joining a shop by invite (/join/:shopId, or
 * /login?invite=<shopId>). Completes email-link sign-in (the provider does the work;
 * this screen asks for the address when the link was opened on another phone).
 */
export default function S02Login({ join = false }) {
  const { t } = useT();
  const { user, loading, isStaffUser, emailLink } = useAuth();
  const [params] = useSearchParams();
  const { shopId: routeShopId } = useParams();
  const inviteShopId = (join ? routeShopId : params.get('invite')) || null;
  const next = inviteShopId ? `/join/${encodeURIComponent(inviteShopId)}` : safeNextPath(params.get('next'), '/');

  if (loading) {
    if (emailLink.status === 'completing') return <Working title={t('entry.login.title')} label={t('auth.completing')} />;
    return <ScreenFallback />;
  }
  if (user && isStaffUser) {
    if (inviteShopId) return <JoinShop shopId={inviteShopId} user={user} />;
    return <Navigate to={/^\/login(?:[/?#]|$)/.test(next) ? '/' : next} replace />;
  }
  if (emailLink.status === 'needEmail') return <NeedEmail />;
  // A link that continues to /join/<shopId> keeps the invite wording after an error.
  const joinNext = /^\/join\/[^/?#]+$/.test(next);
  return <SignInForm next={next} joinMode={Boolean(inviteShopId) || joinNext} />;
}
