import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useT } from '../lib/i18n/useT.js';
import { useAuth } from '../state/AuthContext.jsx';
import { useShop } from '../state/ShopContext.jsx';
import { useSession } from '../hooks/useSession.js';
import { useLive } from '../hooks/useLive.js';
import { createClient, searchClients, watchRecentClients } from '../services/clients.js';
import BottomAction from '../components/BottomAction.jsx';
import Button from '../components/Button.jsx';
import Chip from '../components/Chip.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Field from '../components/Field.jsx';
import IconButton from '../components/IconButton.jsx';
import ScreenFrame from '../components/ScreenFrame.jsx';
import Skeleton from '../components/Skeleton.jsx';
import { useSnackbar } from '../components/Snackbar.jsx';
import ClientRow from './entry/ClientRow.jsx';
import ModelStatus, { useModelWarmup } from './entry/ModelStatus.jsx';

const RECENT_COUNT = 20;
const SEARCH_DELAY_MS = 300;

function RowsSkeleton({ count = 3, label }) {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      {label ? <span className="sr-only">{label}</span> : null}
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} rounded="card" className="h-[72px] w-full" />
      ))}
    </div>
  );
}

/** Client search by name or phone: debounced, works offline from the cache. */
function useClientSearch(shopId, query) {
  const [state, setState] = useState({ q: '', status: 'idle', list: [], error: null });
  const [attempt, setAttempt] = useState(0);
  const q = query.trim();

  useEffect(() => {
    if (!q) {
      setState({ q: '', status: 'idle', list: [], error: null });
      return undefined;
    }
    let alive = true;
    setState((s) => ({ ...s, q, status: 'loading', error: null }));
    const timer = setTimeout(() => {
      searchClients(shopId, q).then(
        (list) => {
          if (alive) setState({ q, status: 'done', list: Array.isArray(list) ? list : [], error: null });
        },
        (error) => {
          console.warn('client search failed', error);
          if (alive) setState({ q, status: 'error', list: [], error });
        },
      );
    }, SEARCH_DELAY_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [shopId, q, attempt]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}

/** Inline "Add new client": name and an optional phone, then the visit starts. */
function AddClientForm({ shopId, initialName, onCreated, onCancel }) {
  const { t } = useT();
  const { show } = useSnackbar();
  const formId = useId();
  const [name, setName] = useState(initialName || '');
  const [phone, setPhone] = useState('');
  const [nameError, setNameError] = useState(null);
  const [phoneError, setPhoneError] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    const displayName = name.trim();
    if (!displayName) {
      setNameError(t('entry.home.nameRequired'));
      return;
    }
    try {
      const id = createClient(shopId, { displayName, phone: phone.trim() || null });
      onCreated({ id, displayName, walkIn: false });
    } catch (err) {
      if (err?.code === 'invalid-argument' && err.message === 'phone') setPhoneError(t('entry.home.phoneInvalid'));
      else if (err?.code === 'invalid-argument') setNameError(t('entry.home.nameRequired'));
      else {
        console.error('createClient failed', err);
        show({ message: t('common.error') });
      }
    }
  };

  return (
    <form
      id={formId}
      onSubmit={submit}
      noValidate
      aria-labelledby={`${formId}-title`}
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4"
    >
      <h3 id={`${formId}-title`} className="text-lg">
        {t('entry.home.addTitle')}
      </h3>
      <Field
        label={t('entry.home.clientName')}
        dir="auto"
        autoComplete="off"
        autoCapitalize="words"
        maxLength={80}
        autoFocus
        value={name}
        onChange={(v) => {
          setName(v);
          setNameError(null);
        }}
        error={nameError}
      />
      <Field
        label={t('entry.home.clientPhone')}
        type="tel"
        inputMode="tel"
        autoComplete="off"
        dir="ltr"
        placeholder="+968 9123 4567"
        icon="phone"
        value={phone}
        onChange={(v) => {
          setPhone(v);
          setPhoneError(null);
        }}
        error={phoneError}
      />
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
        <Button type="submit" variant="secondary" icon="check" full className="sm:w-auto sm:flex-1">
          {t('entry.home.saveAndStart')}
        </Button>
        <Button variant="ghost" full className="sm:w-auto" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

/** S03: barber home (/s/:shopId). Who is in the chair, then the camera. */
export default function S03BarberHome() {
  const { t, pick } = useT();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { shopId, shop, canManage } = useShop();
  const { wipe, setClient, path } = useSession();
  const models = useModelWarmup();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(null);
  const [recentAttempt, setRecentAttempt] = useState(0);
  const startingRef = useRef(false);
  const search = useClientSearch(shopId, query);

  const recent = useLive(
    (cb, onError) => watchRecentClients(shopId, RECENT_COUNT, cb, onError),
    [shopId, recentAttempt],
  );
  const recentList = Array.isArray(recent.data) ? recent.data : [];

  const shopName = pick(shop || {}, 'name', 'nameAr') || t('entry.shops.untitled');

  // A fresh session for every customer: photos and answers of the last one are wiped first.
  const start = (client) => {
    if (startingRef.current) return;
    startingRef.current = true;
    const pending = wipe('newCustomer');
    setClient(client);
    navigate(path('capture'));
    Promise.resolve(pending).catch((err) => console.warn('session wipe did not finish', err));
  };

  const startWalkIn = () => start({ id: null, displayName: null, walkIn: true });
  const pickClient = (c) => start({ id: c.id, displayName: c.displayName || null, walkIn: false });

  const q = query.trim();
  const searching = Boolean(q);
  const isolated = `\u2068${q}\u2069`;

  let results = null;
  if (searching) {
    if (search.status === 'loading' || search.q !== q) {
      results = <RowsSkeleton count={2} label={t('entry.home.searching')} />;
    } else if (search.status === 'error') {
      results = <ErrorState className="py-6" message={t('entry.home.searchError')} onRetry={search.retry} />;
    } else if (search.list.length === 0) {
      results = (
        <div className="flex flex-col items-start gap-3 rounded-card border border-dashed border-line p-4">
          <p className="text-text-2">{t('entry.home.noMatch', { q: isolated })}</p>
          {!adding ? (
            <Button variant="secondary" icon="plus" onClick={() => setAdding({ name: q })}>
              {t('entry.home.addAs', { q: isolated })}
            </Button>
          ) : null}
        </div>
      );
    } else {
      results = (
        <ul className="flex flex-col gap-3" aria-label={t('entry.home.results')}>
          {search.list.map((c) => (
            <li key={c.id}>
              <ClientRow client={c} onPick={pickClient} />
            </li>
          ))}
        </ul>
      );
    }
  }

  let recentBody;
  if (recent.error) {
    recentBody = <ErrorState message={t('entry.home.recentError')} onRetry={() => setRecentAttempt((n) => n + 1)} />;
  } else if (recent.loading) {
    recentBody = <RowsSkeleton count={3} label={t('common.loading')} />;
  } else if (recentList.length === 0) {
    recentBody = (
      <EmptyState icon="users" title={t('entry.home.recentEmpty.title')} message={t('entry.home.recentEmpty.body')} />
    );
  } else {
    recentBody = (
      <ul className="flex flex-col gap-3">
        {recentList.map((c) => (
          <li key={c.id}>
            <ClientRow client={c} onPick={pickClient} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ScreenFrame
      title={shopName}
      wide
      actions={
        canManage ? (
          <Button
            as={Link}
            to={`/s/${shopId}/owner`}
            variant="secondary"
            size="sm"
            icon="dashboard"
            title={t('entry.home.ownerLabel')}
            className="px-3"
          >
            {t('entry.home.owner')}
          </Button>
        ) : null
      }
      footer={
        <BottomAction className="mx-auto w-full max-w-[640px]">
          <ModelStatus phase={models.phase} pct={models.pct} onRetry={models.retry} />
          <Button variant="primary" icon="camera" onClick={startWalkIn}>
            {t('entry.home.newCustomer')}
          </Button>
          <Button as={Link} to={path('look-code')} variant="secondary" icon="keypad" full>
            {t('entry.home.lookCode')}
          </Button>
        </BottomAction>
      }
    >
      <div className="grid gap-8 md:grid-cols-2 md:gap-6">
        <section aria-labelledby="who-title" className="flex flex-col gap-4">
          <div>
            <h2 id="who-title" className="text-xl">
              {t('entry.home.whoTitle')}
            </h2>
            <p className="mt-1 text-sm text-text-2">{t('entry.home.whoLead')}</p>
          </div>

          <div role="search">
            <Field
              label={t('entry.home.searchLabel')}
              type="text"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              dir="auto"
              icon="search"
              placeholder={t('entry.home.searchPlaceholder')}
              value={query}
              onChange={(v) => setQuery(v)}
              end={
                query ? (
                  <IconButton icon="close" label={t('entry.home.searchClear')} tone="muted" onClick={() => setQuery('')} />
                ) : null
              }
            />
          </div>

          {results}

          {!adding ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-text-2">{t('entry.home.notListed')}</p>
              <div className="flex flex-wrap gap-2">
                <Chip icon="user" role="button" onClick={startWalkIn}>
                  {t('common.walkIn')}
                </Chip>
                <Chip icon="plus" role="button" onClick={() => setAdding({ name: q })}>
                  {t('entry.home.addClient')}
                </Chip>
              </div>
            </div>
          ) : (
            <AddClientForm
              shopId={shopId}
              initialName={adding.name}
              onCreated={(client) => start(client)}
              onCancel={() => setAdding(null)}
            />
          )}
        </section>

        <section aria-labelledby="recent-title" className={searching ? 'hidden flex-col gap-4 md:flex' : 'flex flex-col gap-4'}>
          <h2 id="recent-title" className="text-xl">
            {t('entry.home.recentTitle')}
          </h2>
          {recentBody}
        </section>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-sm text-text-2">
        {user && user.email ? (
          <span className="min-w-0 break-all">
            <bdi>{user.email}</bdi>
          </span>
        ) : (
          <span />
        )}
        <Button as={Link} to="/" variant="ghost" size="sm" icon="home" className="-me-3">
          {t('entry.home.switchShop')}
        </Button>
      </div>
    </ScreenFrame>
  );
}
