import { NavLink, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import TopBar from './TopBar.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useApp } from '../hooks/useApp.jsx';

const NAV = [
  { to: '/owner', key: 'nav.dashboard', icon: 'chart', end: true },
  { to: '/owner/catalog', key: 'nav.catalog', icon: 'grid' },
  { to: '/owner/swatch-scan', key: 'nav.swatch', icon: 'swatch' },
  { to: '/owner/products', key: 'nav.products', icon: 'tag' },
  { to: '/owner/staff', key: 'nav.staff', icon: 'users', owner: true },
  { to: '/owner/settings', key: 'nav.settings', icon: 'settings' },
  { to: '/owner/reports', key: 'nav.reports', icon: 'print' },
];

/** Desktop: fixed side nav + content. Phone: top bar + scrollable tab row. */
export default function OwnerLayout({ title, children, actions }) {
  const { t, name } = useT();
  const app = useApp();
  const navigate = useNavigate();
  const items = NAV.filter((n) => !n.owner || app.isOwner);
  const link = (n, compact) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.end}
      className={({ isActive }) =>
        `press flex min-h-tap items-center gap-3 rounded-control px-3 ${compact ? 'shrink-0 border' : ''} ${
          isActive ? 'bg-plum text-onplum border-plum' : 'text-ink border-line active:bg-surface2'
        }`
      }
    >
      <Icon name={n.icon} size={20} />
      <span className="whitespace-nowrap text-[15px] font-medium">{t(n.key)}</span>
    </NavLink>
  );
  return (
    <div className="min-h-dvh desk:flex">
      <aside className="no-print sticky top-0 hidden h-dvh w-[260px] shrink-0 flex-col border-line bg-surface p-4 desk:flex ltr:border-r rtl:border-l">
        <div className="mb-6 px-2">
          <div className="eyebrow">{t('nav.owner')}</div>
          <div className="font-display text-lg leading-tight">{name({ en: app.salon?.name, ar: app.salon?.nameAr })}</div>
        </div>
        <nav className="flex flex-col gap-1">{items.map((n) => link(n, false))}</nav>
        <div className="mt-auto">
          <button type="button" onClick={() => navigate('/home')} className="press flex min-h-tap w-full items-center gap-3 rounded-control px-3 text-plum">
            <Icon name="scissors" size={20} />
            {t('nav.chair')}
          </button>
        </div>
      </aside>
      <main className="screen min-w-0 flex-1 desk:px-8">
        <TopBar title={title} onBack={() => navigate('/home')} right={actions} />
        <nav className="no-scrollbar no-print -mx-[var(--gutter)] mb-5 flex gap-2 overflow-x-auto px-[var(--gutter)] desk:hidden">{items.map((n) => link(n, true))}</nav>
        <div className="mx-auto max-w-[1200px]">{children}</div>
      </main>
    </div>
  );
}
