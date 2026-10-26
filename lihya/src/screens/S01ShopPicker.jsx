import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useT } from '../lib/i18n/useT.js';
import { useAuth } from '../state/AuthContext.jsx';
import { useLive } from '../hooks/useLive.js';
import { useOnline } from '../hooks/useOnline.js';
import { watchMyShops } from '../services/shops.js';
import { signOutAndClear } from '../services/auth.js';
import { APP } from '../config/app.js';
import Button from '../components/Button.jsx';
import Chip from '../components/Chip.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Icon from '../components/Icon.jsx';
import LangToggle from '../components/LangToggle.jsx';
import Skeleton from '../components/Skeleton.jsx';
import SyncBadge from '../components/SyncBadge.jsx';
import { useSnackbar } from '../components/Snackbar.jsx';
import BrandMark from './entry/BrandMark.jsx';
import { readLastShop, rememberLastShop } from './entry/prefs.js';

/** Page shell for the splash: language toggle row, scrolling body, bottom-anchored actions. */
function Shell({ children, footer }) {
  return (
    <div className="flex h-[100dvh] flex-col bg-bg text-text">
      <header className="pt-safe shrink-0">
        <div className="gutter mx-auto flex h-14 w-full max-w-[640px] items-center justify-end gap-1">
          <SyncBadge />
          <LangToggle className="-me-2" />
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="gutter mx-auto flex min-h-full w-full max-w-[640px] flex-col py-4">{children}</div>
      </main>
      {footer ? (
        <div className="shrink-0 border-t border-line bg-bg">
          <div className="gutter pb-safe mx-auto flex w-full max-w-[640px] flex-col gap-3 pt-3">{footer}</div>
        </div>
      ) : null}
    </div>
  );
}

function ShopRow({ shop, onOpen }) {
  const { t, lang } = useT();
  const main = lang === 'ar' ? shop.nameAr || shop.name : shop.name || shop.nameAr;
  const other = lang === 'ar' ? shop.name : shop.nameAr;
  const loadingName = !shop.name && !shop.nameAr;
  return (
    <button
      type="button"
      onClick={() => onOpen(shop)}
      aria-label={loadingName ? `${t('entry.shops.untitled')}, ${t(`role.${shop.role}`)}` : undefined}
      className="press flex min-h-[84px] w-full items-center gap-4 rounded-card border border-line bg-surface px-4 py-3 text-start active:bg-surface-2"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-brass/50 text-brass">
        <Icon name="scissors" size={24} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {loadingName ? (
          <>
            <Skeleton className="h-6 w-40 max-w-full" />
            <span className="sr-only">{t('entry.shops.loadingName')}</span>
          </>
        ) : (
          <>
            <span className="truncate font-display text-xl leading-tight text-text">
              <bdi>{main}</bdi>
            </span>
            {other && other !== main ? (
              <span className="truncate text-sm text-text-2">
                <bdi>{other}</bdi>
              </span>
            ) : null}
          </>
        )}
      </span>
      {shop.role ? (
        <Chip size="sm" tone={shop.role === 'owner' ? 'default' : 'info'} className="shrink-0">
          {t(`role.${shop.role}`)}
        </Chip>
      ) : null}
      <Icon name="chevron-right" size={20} className="shrink-0 text-text-2" />
    </button>
  );
}

function ShopListSkeleton() {
  return (
    <ul className="flex flex-col gap-3" aria-hidden="true">
      {[0, 1].map((i) => (
        <li key={i}>
          <Skeleton rounded="card" className="h-[84px] w-full" />
        </li>
      ))}
    </ul>
  );
}

function SignedOut() {
  const { t } = useT();
  return (
    <Shell
      footer={
        <Button as={Link} to="/login" variant="primary" icon="user">
          {t('entry.splash.signIn')}
        </Button>
      }
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-8 py-6 text-center">
        <BrandMark size="lg" />
        <div className="flex w-full max-w-sm flex-col items-center gap-5">
          <hr className="rule-brass w-16" />
          <p className="text-lg leading-snug text-text">{t('app.tagline')}</p>
          <p className="text-sm text-text-2">{t('entry.splash.staff')}</p>
        </div>
      </div>
      <p className="flex items-start gap-2 border-t border-line pt-4 text-sm text-text-2">
        <Icon name="link" size={18} className="mt-0.5 shrink-0" />
        <span>{t('entry.splash.customerHint')}</span>
      </p>
    </Shell>
  );
}

function MyShops({ user }) {
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const online = useOnline();
  const { show } = useSnackbar();
  const [attempt, setAttempt] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const uid = user.uid;

  const live = useLive((cb, onError) => watchMyShops(uid, cb, onError), [uid, attempt]);
  const all = useMemo(() => (Array.isArray(live.data) ? live.data : []), [live.data]);
  const shops = useMemo(() => all.filter((s) => s.active), [all]);
  const paused = all.length - shops.length;

  // Auto-open the shop this phone used last, only when the app was just opened here
  // (not when the barber came back to pick another shop) and the shop is still mine.
  const fresh = location.key === 'default';
  const autoRef = useRef({ done: !fresh, target: fresh ? readLastShop() : null });
  useEffect(() => {
    const auto = autoRef.current;
    if (auto.done || live.loading) return;
    if (!auto.target) {
      auto.done = true;
      return;
    }
    if (shops.some((s) => s.shopId === auto.target)) {
      auto.done = true;
      // Replace: Back from the shop must not land here and bounce into the shop again.
      navigate(`/s/${auto.target}`, { replace: true });
      return;
    }
    // Wait for the server answer before giving up (the offline cache may not know it yet).
    if (!live.fromCache || !online) auto.done = true;
  }, [shops, live.loading, live.fromCache, online, navigate]);

  const open = (shop) => {
    autoRef.current.done = true;
    rememberLastShop(shop.shopId);
    navigate(`/s/${shop.shopId}`);
  };

  // Shared phone: the customer session and this shop's offline copy (client names,
  // phones) are cleared too; the app then reloads at the start screen.
  const signOut = () => {
    if (signingOut) return;
    setSigningOut(true);
    signOutAndClear({ to: '/' }).catch((err) => {
      console.error('sign out failed', err);
      setSigningOut(false);
      show({ message: t('common.error') });
    });
  };

  const loading = live.loading && !live.error;
  const emptyOffline = !loading && !live.error && shops.length === 0 && live.fromCache && !online;

  let list;
  if (live.error) {
    list = <ErrorState message={t('entry.shops.error')} onRetry={() => setAttempt((n) => n + 1)} />;
  } else if (loading) {
    list = <ShopListSkeleton />;
  } else if (emptyOffline) {
    list = <EmptyState icon="wifi-off" title={t('common.offline')} message={t('entry.shops.offline')} />;
  } else if (shops.length === 0) {
    list = <EmptyState icon="scissors" title={t('entry.shops.empty.title')} message={t('entry.shops.empty.body')} />;
  } else {
    list = (
      <ul className="flex flex-col gap-3">
        {shops.map((s) => (
          <li key={s.shopId}>
            <ShopRow shop={s} onOpen={open} />
          </li>
        ))}
      </ul>
    );
  }

  const hasShops = shops.length > 0;
  const createButton = (
    <Button as={Link} to="/create-shop" variant={hasShops ? 'secondary' : 'primary'} icon="plus" full>
      {t('entry.shops.create')}
    </Button>
  );

  return (
    <Shell footer={loading || live.error ? null : createButton}>
      <BrandMark size="sm" />
      <hr className="rule-brass mt-5" />
      <section aria-labelledby="my-shops" className="mt-6 flex flex-col gap-4">
        <div>
          <h2 id="my-shops" className="text-xl">
            {t('entry.shops.title')}
          </h2>
          {hasShops ? <p className="mt-1 text-sm text-text-2">{t('entry.shops.lead')}</p> : null}
        </div>
        {list}
        {paused > 0 && !loading ? (
          <p className="flex items-start gap-2 text-sm text-text-2">
            <Icon name="lock" size={18} className="mt-0.5 shrink-0" />
            <span>{t('entry.shops.paused', { n: paused })}</span>
          </p>
        ) : null}
      </section>
      <div className="mt-auto flex flex-col gap-1 border-t border-line pt-4">
        {user.email ? (
          <p className="break-all text-sm text-text-2">{t('shop.signedInAs', { email: `\u2068${user.email}\u2069` })}</p>
        ) : null}
        <Button variant="ghost" icon="logout" onClick={signOut} loading={signingOut} className="-ms-3 self-start">
          {t('entry.shops.signOut')}
        </Button>
      </div>
    </Shell>
  );
}

function Checking() {
  const { t } = useT();
  return (
    <Shell>
      <div role="status" aria-busy="true" className="flex flex-1 flex-col items-center justify-center gap-8">
        <BrandMark size="lg" />
        <Skeleton className="h-5 w-48" />
        <span className="sr-only">{t('entry.splash.checking')}</span>
      </div>
    </Shell>
  );
}

/** S01: splash and shop picker (route /). */
export default function S01ShopPicker() {
  const { t } = useT();
  const { user, loading, isStaffUser } = useAuth();

  useEffect(() => {
    document.title = `${t('app.name')} · ${t('app.tagline')}`;
    return () => {
      document.title = APP.name;
    };
  }, [t]);

  if (loading) return <Checking />;
  if (!user || !isStaffUser) return <SignedOut />;
  return <MyShops user={user} />;
}
