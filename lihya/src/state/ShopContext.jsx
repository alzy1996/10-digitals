import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useT } from '../lib/i18n/useT.js';
import { PREF_KEYS } from '../config/app.js';
import { useAuth } from './AuthContext.jsx';
import { useLive } from '../hooks/useLive.js';
import { useOnline } from '../hooks/useOnline.js';
import { mergeSettings, watchPublicInfo, watchShop } from '../services/shops.js';
import { watchMyStaff } from '../services/staff.js';
import { watchPublicStyles } from '../services/styles.js';
import { signOutUser } from '../services/auth.js';
import Button from '../components/Button.jsx';
import Icon from '../components/Icon.jsx';
import ScreenFallback from '../components/ScreenFallback.jsx';
import ErrorState from '../components/ErrorState.jsx';
import LangToggle from '../components/LangToggle.jsx';

const ShopContext = createContext(null);
const PublicShopContext = createContext(null);

// ------------------------------------------------------------------ shared full-screen notice

function FullScreen({ children }) {
  return (
    <main className="flex min-h-[100dvh] flex-col bg-bg px-4 pb-8 pt-4 text-text">
      <div className="flex justify-end">
        <LangToggle />
      </div>
      <div className="flex flex-1 items-center justify-center">{children}</div>
    </main>
  );
}

function Notice({ icon, title, body, note, children }) {
  return (
    <FullScreen>
      <section className="w-full max-w-md rounded-card border border-line bg-surface p-6" aria-live="polite">
        <Icon name={icon} size={32} className="text-brass" />
        <h1 className="mt-4 text-xl font-semibold">{title}</h1>
        <p className="mt-3 text-text-2">{body}</p>
        {note ? <p className="mt-3 break-all text-sm text-text-2">{note}</p> : null}
        {children ? <div className="mt-6 flex flex-col gap-3">{children}</div> : null}
      </section>
    </FullScreen>
  );
}

function rememberShop(shopId) {
  try {
    localStorage.setItem(PREF_KEYS.lastShop, shopId);
  } catch {
    // private mode: the picker simply does not preselect
  }
}

// ------------------------------------------------------------------ staff shop

function shopStatus({ shopId, meLive, shopLive }) {
  const me = meLive.data;
  if (!shopId) return 'notMember';
  if (meLive.error) return meLive.error.code === 'permission-denied' ? 'notMember' : 'error';
  // The offline cache may simply not know this doc yet: wait for the server.
  if (meLive.loading || (!me && meLive.fromCache)) return 'loading';
  if (!me) return 'notMember';
  if (me.active !== true) return 'deactivated';
  if (shopLive.error) return 'error';
  if (shopLive.loading || (!shopLive.data && shopLive.fromCache)) return 'loading';
  if (!shopLive.data) return 'notFound';
  return 'ready';
}

/**
 * Staff shop context for /s/:shopId. Renders a full-screen state until I am an
 * active member: loading, offline, not a member, deactivated, not found or error.
 */
export function ShopProvider({ shopId, children }) {
  const { t } = useT();
  const navigate = useNavigate();
  const online = useOnline();
  const { user } = useAuth();
  const uid = user ? user.uid : null;
  const [attempt, setAttempt] = useState(0);

  const meLive = useLive(
    (cb, onError) => (shopId && uid ? watchMyStaff(shopId, uid, cb, onError) : null),
    [shopId, uid, attempt],
  );
  const active = Boolean(meLive.data && meLive.data.active === true);
  const shopLive = useLive((cb, onError) => (active ? watchShop(shopId, cb, onError) : null), [shopId, active, attempt]);

  const status = shopStatus({ shopId, meLive, shopLive });
  const me = meLive.data;
  const shop = shopLive.data;
  const role = active ? me.role : null;
  const settings = useMemo(() => mergeSettings(shop ? shop.settings : null), [shop]);

  useEffect(() => {
    if (status === 'ready') rememberShop(shopId);
  }, [status, shopId]);

  const loadError = status === 'error' ? meLive.error || shopLive.error : null;
  useEffect(() => {
    if (loadError) console.error('ShopProvider: the shop could not be loaded', loadError);
  }, [loadError]);

  const value = useMemo(
    () => ({
      shopId,
      shop,
      settings,
      me,
      role,
      isOwner: role === 'owner',
      isManager: role === 'manager',
      canManage: role === 'owner' || role === 'manager',
      loading: status === 'loading',
      error: loadError,
      hasPendingWrites: Boolean(meLive.hasPendingWrites || shopLive.hasPendingWrites),
    }),
    [shopId, shop, settings, me, role, status, loadError, meLive.hasPendingWrites, shopLive.hasPendingWrites],
  );

  const signOutAndLogin = () => {
    signOutUser()
      .catch((err) => console.error('sign out failed', err))
      .finally(() => navigate('/login', { replace: true }));
  };
  const pickShop = () => navigate('/');

  if (status === 'loading') {
    if (!online) {
      return <Notice icon="wifi-off" title={t('shop.offline.title')} body={t('shop.offline.body')} />;
    }
    return <ScreenFallback />;
  }

  if (status === 'error') {
    return (
      <FullScreen>
        <ErrorState title={t('shop.error.title')} message={t('shop.error.body')} onRetry={() => setAttempt((n) => n + 1)} />
      </FullScreen>
    );
  }

  if (status === 'notMember') {
    return (
      <Notice
        icon="lock"
        title={t('shop.notMember.title')}
        body={t('shop.notMember.body')}
        note={user && user.email ? t('shop.signedInAs', { email: user.email }) : null}
      >
        <Button variant="primary" icon="mail" onClick={() => navigate(`/join/${shopId}`)}>
          {t('shop.notMember.join')}
        </Button>
        <Button variant="secondary" icon="home" onClick={pickShop}>
          {t('shop.pickAnother')}
        </Button>
        <Button variant="ghost" icon="logout" onClick={signOutAndLogin}>
          {t('common.signOut')}
        </Button>
      </Notice>
    );
  }

  if (status === 'deactivated') {
    return (
      <Notice icon="lock" title={t('shop.deactivated.title')} body={t('shop.deactivated.body')}>
        <Button variant="secondary" icon="home" onClick={pickShop}>
          {t('shop.pickAnother')}
        </Button>
        <Button variant="ghost" icon="logout" onClick={signOutAndLogin}>
          {t('common.signOut')}
        </Button>
      </Notice>
    );
  }

  if (status === 'notFound') {
    return (
      <Notice icon="warning" title={t('shop.notFound.title')} body={t('shop.notFound.body')}>
        <Button variant="secondary" icon="home" onClick={pickShop}>
          {t('shop.pickAnother')}
        </Button>
      </Notice>
    );
  }

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

/** { shopId, shop, settings, me, role, isOwner, isManager, canManage, loading, error, hasPendingWrites } */
export function useShop() {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShop must be used inside <ShopProvider>');
  return ctx;
}

/** Owner/manager pages: anyone else goes back to the barber home of this shop. */
export function RequireRole({ roles, children }) {
  const { shopId, role, loading } = useShop();
  if (loading) return <ScreenFallback />;
  if (!Array.isArray(roles) || !roles.includes(role)) return <Navigate to={`/s/${shopId}`} replace />;
  return children;
}

// ------------------------------------------------------------------ public shop (Try at home)

function publicStatus({ shopId, infoLive, stylesLive }) {
  const info = infoLive.data;
  if (!shopId) return 'inactive';
  if (infoLive.error) return infoLive.error.code === 'permission-denied' ? 'inactive' : 'error';
  if (infoLive.loading || (!info && infoLive.fromCache)) return 'loading';
  if (!info || info.tryAtHome !== true) return 'inactive';
  if (stylesLive.error) return stylesLive.error.code === 'permission-denied' ? 'inactive' : 'error';
  if (stylesLive.loading) return 'loading';
  return 'ready';
}

/**
 * Customer context for /try/:shopId: the shop's public info and its visible
 * styles, readable without staff access while the owner keeps Try at home on.
 */
export function PublicShopProvider({ shopId, children }) {
  const { t } = useT();
  const online = useOnline();
  const [attempt, setAttempt] = useState(0);

  const infoLive = useLive((cb, onError) => (shopId ? watchPublicInfo(shopId, cb, onError) : null), [shopId, attempt]);
  const on = Boolean(infoLive.data && infoLive.data.tryAtHome === true);
  const stylesLive = useLive((cb, onError) => (on ? watchPublicStyles(shopId, cb, onError) : null), [shopId, on, attempt]);

  const status = publicStatus({ shopId, infoLive, stylesLive });
  const info = infoLive.data;
  const styles = stylesLive.data;

  const value = useMemo(
    () => ({
      shopId,
      info,
      styles: Array.isArray(styles) ? styles : [],
      loading: status === 'loading',
      error: status === 'error' ? infoLive.error || stylesLive.error : null,
    }),
    [shopId, info, styles, status, infoLive.error, stylesLive.error],
  );

  if (status === 'loading') {
    if (!online) {
      return <Notice icon="wifi-off" title={t('shop.offline.title')} body={t('shop.public.offlineBody')} />;
    }
    return <ScreenFallback />;
  }

  if (status === 'error') {
    return (
      <FullScreen>
        <ErrorState title={t('shop.error.title')} message={t('shop.public.errorBody')} onRetry={() => setAttempt((n) => n + 1)} />
      </FullScreen>
    );
  }

  if (status === 'inactive') {
    return (
      <Notice icon="link" title={t('shop.public.inactive.title')} body={t('shop.public.inactive.body')}>
        <Button variant="secondary" icon="refresh" onClick={() => setAttempt((n) => n + 1)}>
          {t('common.retry')}
        </Button>
      </Notice>
    );
  }

  return <PublicShopContext.Provider value={value}>{children}</PublicShopContext.Provider>;
}

/** { shopId, info: { name, nameAr, tryAtHome, whatsapp }, styles, loading, error } */
export function usePublicShop() {
  const ctx = useContext(PublicShopContext);
  if (!ctx) throw new Error('usePublicShop must be used inside <PublicShopProvider>');
  return ctx;
}
