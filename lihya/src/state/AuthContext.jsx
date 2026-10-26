import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { DEMO_USER, demoMode, firebaseConfigured } from '../lib/firebase.js';
import { useT } from '../lib/i18n/useT.js';
import {
  clearEmailLinkFromUrl,
  completeEmailLink,
  consumeRedirectResult,
  isEmailLink,
  storedEmailForSignIn,
  watchAuth,
} from '../services/auth.js';
import { trackQueuedWrites } from '../services/db.js';
import Icon from '../components/Icon.jsx';
import LangToggle from '../components/LangToggle.jsx';
import ScreenFallback from '../components/ScreenFallback.jsx';

const AuthContext = createContext(null);

function initialLinkState() {
  if (typeof window === 'undefined' || !isEmailLink(window.location.href)) return { status: 'none', error: null };
  return { status: storedEmailForSignIn() ? 'completing' : 'needEmail', error: null };
}

/** Shown instead of the app when there is no Firebase config and no emulator switch. */
function SetupNotice() {
  const { t } = useT();
  return (
    <main className="flex min-h-[100dvh] flex-col bg-bg px-4 pb-8 pt-4 text-text">
      <div className="flex justify-end">
        <LangToggle />
      </div>
      <div className="flex flex-1 items-center justify-center">
        <section className="w-full max-w-md rounded-card border border-line bg-surface p-6" aria-labelledby="setup-title">
          <Icon name="settings" size={32} className="text-brass" />
          <h1 id="setup-title" className="mt-4 text-xl font-semibold">
            {t('setup.title')}
          </h1>
          <p className="mt-3 text-text-2">{t('setup.body')}</p>
        </section>
      </div>
    </main>
  );
}

function AuthProviderInner({ children }) {
  const [session, setSession] = useState({ user: null, ready: false });
  const [link, setLink] = useState(initialLinkState);
  const [authError, setAuthError] = useState(null);

  useEffect(() => watchAuth((user) => setSession({ user, ready: true })), []);

  useEffect(() => {
    consumeRedirectResult().catch((err) => setAuthError(err));
  }, []);

  // Finish an email-link sign-in (the AuthProvider does it on load when this
  // device sent the link; the login screen calls it with a typed address otherwise).
  const finishEmailLink = useCallback((email) => {
    setLink({ status: 'completing', error: null });
    return completeEmailLink(window.location.href, email || null).then(
      (user) => {
        clearEmailLinkFromUrl();
        setLink({ status: 'done', error: null });
        return user;
      },
      (err) => {
        setLink({ status: err?.code === 'auth/missing-email' ? 'needEmail' : 'error', error: err });
        throw err;
      },
    );
  }, []);

  useEffect(() => {
    if (initialLinkState().status === 'completing') finishEmailLink(null).catch(() => {});
  }, [finishEmailLink]);

  const uid = session.user ? session.user.uid : null;
  useEffect(() => {
    if (uid) trackQueuedWrites();
  }, [uid]);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const value = useMemo(() => {
    const user = session.user;
    return {
      user,
      loading: !session.ready || link.status === 'completing',
      isAnonymous: Boolean(user && user.isAnonymous),
      isStaffUser: Boolean(user && !user.isAnonymous),
      emailLink: link,
      completeEmailLink: finishEmailLink,
      authError,
      clearAuthError,
    };
  }, [session, link, finishEmailLink, authError, clearAuthError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const noop = () => {};

// Demo mode: the demo owner is signed in from the first frame; Firebase Auth never runs.
const DEMO_AUTH = Object.freeze({
  user: DEMO_USER,
  loading: false,
  isAnonymous: false,
  isStaffUser: true,
  emailLink: Object.freeze({ status: 'none', error: null }),
  completeEmailLink: () => Promise.resolve(DEMO_USER),
  authError: null,
  clearAuthError: noop,
});

/**
 * Auth state for the whole app. Without a Firebase config (and without the
 * emulator switch or demo mode) it renders the setup notice instead of the app.
 */
export function AuthProvider({ children }) {
  if (demoMode) return <AuthContext.Provider value={DEMO_AUTH}>{children}</AuthContext.Provider>;
  if (!firebaseConfigured) return <SetupNotice />;
  return <AuthProviderInner>{children}</AuthProviderInner>;
}

/**
 * { user, loading, isAnonymous, isStaffUser, emailLink: { status: 'none'|'completing'|'needEmail'|'done'|'error', error },
 *   completeEmailLink(email) -> Promise<user>, authError, clearAuthError() }
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/**
 * Staff routes: signed-in, non-anonymous users only (the demo owner in demo mode). Anyone
 * else goes to /login?next=<this path>. Must be rendered inside the router.
 */
export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <ScreenFallback />;
  if (!user || user.isAnonymous) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return children;
}

export default AuthProvider;
