import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Button from '../components/Button.jsx';
import Sheet from '../components/Sheet.jsx';
import Icon from '../components/Icon.jsx';
import { Empty } from '../components/States.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useApp } from '../hooks/useApp.jsx';
import { useSession } from '../hooks/useSession.jsx';
import { useLive } from '../hooks/useLive.js';
import { watchClients, searchClients, createClient } from '../services/clients.js';
import { watchConsultationsDay } from '../services/consultations.js';
import { signOut } from '../services/auth.js';
import { dayKey, formatDate } from '../lib/time.js';
import { mySections, sectionEntry, sectionMeta, newVisitId } from '../lib/sections.js';

export default function S03Home() {
  const { t, lang, name } = useT();
  const app = useApp();
  const session = useSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(null); // { client } while choosing the service
  const services = mySections(app.salon, app.me);
  const [q, setQ] = useState('');
  const [clients, clientsLoading] = useLive((cb) => watchClients(app.salonId, cb), [app.salonId], []);
  const [today] = useLive((cb) => watchConsultationsDay(app.salonId, dayKey(), cb), [app.salonId], []);
  const results = useMemo(() => searchClients(clients || [], q), [clients, q]);
  const mine = (today || []).filter((c) => c.stylistUid === app.me?.uid && !c.demo);

  const startService = async (client, section) => {
    await session.start('chair', { client: client || null, salonId: app.salonId, section, visitId: newVisitId() });
    navigate(sectionEntry(section));
  };

  // One service: straight in. Several: one tap on Hair, Nails or Beard.
  const begin = async (client) => {
    setOpen(false);
    if (services.length <= 1) return startService(client, services[0] || 'hair');
    setPicking({ client: client || null });
  };

  const addNew = async () => {
    const displayName = q.trim();
    if (!displayName) return;
    const id = createClient(app.salonId, { displayName });
    await begin({ id, displayName });
  };

  return (
    <main className="screen mx-auto max-w-[720px]">
      <TopBar
        back={false}
        right={
          app.isManager ? (
            <button type="button" onClick={() => navigate('/owner')} className="press grid min-h-tap min-w-tap place-items-center rounded-full border border-line" aria-label={t('nav.owner')}>
              <Icon name="chart" />
            </button>
          ) : null
        }
      />
      <section className="mb-6">
        <p className="eyebrow">{name({ en: app.salon?.name, ar: app.salon?.nameAr })}</p>
        <h1 className="mt-1 text-2xl">{t('home.hello', { name: app.me?.name?.split(' ')[0] || '' })}</h1>
        <p className="mt-1 text-sm text-ink2">{t('home.todayCount', { n: mine.length })}</p>
      </section>

      <Button icon="camera" onClick={() => setOpen(true)} className="!min-h-[72px] text-[20px]">
        {t('home.newClient')}
      </Button>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Button variant="secondary" icon="qr" onClick={() => navigate('/code')}>
          {t('home.lookCode')}
        </Button>
        <Button variant="secondary" icon="user" onClick={() => begin(null)}>
          {t('home.walkIn')}
        </Button>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg">{t('home.recent')}</h2>
        {(clients || []).length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {(clients || []).slice(0, 6).map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => begin(c)} className="press flex min-h-[64px] w-full items-center gap-3 px-4 text-start active:bg-surface2">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-surface2 font-semibold text-plum">{c.displayName?.[0] || '·'}</span>
                  <span className="flex-1">
                    <span className="block font-medium">{c.displayName}</span>
                    <span className="block text-xs text-ink2">
                      {c.lastVisitAt ? t('home.lastVisit', { date: formatDate(c.lastVisitAt, lang) }) : t('home.noVisit')}
                      {c.demo ? ` · ${t('common.demo')}` : ''}
                    </span>
                  </span>
                  <Icon name="chevron" className="text-ink2 rtl:-scale-x-100" />
                </button>
              </li>
            ))}
          </ul>
        ) : clientsLoading ? (
          <div className="h-32 rounded-card bg-surface2" style={{ animation: 'pulse-soft 1.2s infinite' }} aria-busy />
        ) : (
          <Empty icon="users" title={t('home.noClients')} body={t('home.noClientsBody')} />
        )}
      </section>

      <div className="mt-8 flex justify-center">
        <Button variant="ghost" full={false} icon="logout" onClick={async () => { await session.wipe(); await signOut(); navigate('/'); }}>
          {t('common.signOut')}
        </Button>
      </div>

      <Sheet open={Boolean(picking)} modal onClose={() => setPicking(null)} title={t('home.whichService')}>
        <div className="grid gap-3 pb-2">
          {services.map((s) => (
            <Button key={s} variant="secondary" icon={sectionMeta(s).icon} iconEnd="chevron" className="!min-h-[72px] justify-between text-[20px]" onClick={() => { const c = picking.client; setPicking(null); startService(c, s); }}>
              {name(sectionMeta(s).name)}
            </Button>
          ))}
        </div>
      </Sheet>

      <Sheet open={open} modal onClose={() => setOpen(false)} title={t('home.whoIs')}>
        <label className="label mb-2 block" htmlFor="client-q">{t('home.searchLabel')}</label>
        <div className="relative mb-3">
          <input id="client-q" className="field ps-11" value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder={t('home.searchPlaceholder')} />
          <Icon name="search" className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink2 ltr:left-3 rtl:right-3" />
        </div>
        <div className="max-h-[42vh] space-y-2 overflow-y-auto pb-3">
          {results.map((c) => (
            <Button key={c.id} variant="secondary" iconEnd="chevron" onClick={() => begin(c)} className="justify-between">
              {c.displayName}
            </Button>
          ))}
        </div>
        {q.trim() ? (
          <Button icon="plus" onClick={addNew}>
            {t('home.addClient', { name: q.trim() })}
          </Button>
        ) : (
          <Button variant="secondary" icon="user" onClick={() => begin(null)}>
            {t('home.walkIn')}
          </Button>
        )}
      </Sheet>
    </main>
  );
}
