import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useShop } from '../state/ShopContext.jsx';
import { pickLang } from '../lib/i18n/useT.js';
import { ShellContext, cx, useOptionalT } from './kit.js';

/** Owner navigation items; Staff and Settings are owner only (managers do not see them). */
export function ownerNavItems(shopId, role) {
  const base = `/s/${encodeURIComponent(shopId || '')}`;
  const all = [
    { key: 'dashboard', to: `${base}/owner`, icon: 'dashboard', label: 'ui.owner.dashboard', end: true },
    { key: 'catalog', to: `${base}/owner/catalog`, icon: 'catalog', label: 'ui.owner.catalog' },
    { key: 'products', to: `${base}/owner/products`, icon: 'box', label: 'ui.owner.products' },
    { key: 'staff', to: `${base}/owner/staff`, icon: 'users', label: 'ui.owner.staff', ownerOnly: true },
    { key: 'settings', to: `${base}/owner/settings`, icon: 'settings', label: 'ui.owner.settings', ownerOnly: true },
    { key: 'reports', to: `${base}/owner/reports`, icon: 'report', label: 'ui.owner.reports' },
  ];
  const items = all.filter((it) => !it.ownerOnly || role === 'owner');
  const chair = { key: 'chair', to: base, icon: 'scissors', label: 'ui.owner.backToChair', end: true };
  return { items, chair };
}

function OwnerTabs({ items, chair, t, label }) {
  const listRef = useRef(null);
  const { pathname } = useLocation();
  useEffect(() => {
    const el = listRef.current && listRef.current.querySelector('a.active');
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [pathname]);
  const tab =
    'press flex min-h-[48px] shrink-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 text-sm font-medium text-text-2 ' +
    'active:bg-surface-2 [&.active]:border-brass [&.active]:text-text';
  return (
    <nav aria-label={label} className="border-b border-line bg-bg">
      <ul ref={listRef} className="gutter flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((it) => (
          <li key={it.key} className="shrink-0">
            <NavLink to={it.to} end={it.end} className={tab}>
              <Icon name={it.icon} size={18} />
              <span>{t(it.label)}</span>
            </NavLink>
          </li>
        ))}
        <li className="shrink-0">
          <NavLink to={chair.to} end className={tab}>
            <Icon name={chair.icon} size={18} />
            <span>{t(chair.label)}</span>
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}

/**
 * Owner area layout (PRD 9.7): on desktop (lg) a fixed side nav on the start side and the
 * content column; on phones and tablets a row of tabs. Use it around a ScreenFrame:
 * <OwnerShell><ScreenFrame title wide>{content}</ScreenFrame></OwnerShell> — the frame then shows the
 * tabs under its top bar. Without a ScreenFrame the shell shows the tabs itself.
 */
export default function OwnerShell({ children }) {
  const { t, lang } = useOptionalT();
  const shopCtx = useShop() || {};
  const { shopId, shop } = shopCtx;
  const role = shopCtx.role || (shopCtx.isOwner ? 'owner' : null);
  const [framed, setFramed] = useState(false);
  const navLabel = t('ui.owner.nav');

  const { items, chair } = useMemo(() => ownerNavItems(shopId, role), [shopId, role]);
  const tabs = useMemo(
    () => <OwnerTabs items={items} chair={chair} t={t} label={navLabel} />,
    // t changes with the language
    [items, chair, t, navLabel],
  );
  const ctx = useMemo(() => ({ nav: tabs, setFramed }), [tabs]);
  const shopName = shop ? pickLang(lang, shop, 'name', 'nameAr') : '';

  const side =
    'press flex min-h-[48px] items-center gap-3 rounded-ctl px-3 text-base text-text-2 active:bg-surface-2 ' +
    '[&.active]:bg-surface-2 [&.active]:font-semibold [&.active]:text-text';

  return (
    <ShellContext.Provider value={ctx}>
      <div className="flex h-[100dvh] bg-bg text-text">
        <aside className="hidden shrink-0 flex-col border-e border-line bg-surface lg:flex lg:w-64">
          <div className="pt-safe gutter flex items-center gap-3 pb-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-ctl border border-brass/60 text-brass">
              <Icon name="logo" size={26} />
            </span>
            <div className="min-w-0">
              <div className="display text-xl font-semibold leading-tight text-brass">{t('app.name')}</div>
              {shopName ? <div className="truncate text-sm text-text-2">{shopName}</div> : null}
            </div>
          </div>
          <hr className="rule-brass mx-4" />
          <nav aria-label={navLabel} className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
            {items.map((it) => (
              <NavLink key={it.key} to={it.to} end={it.end} className={side}>
                <Icon name={it.icon} size={22} />
                <span className="truncate">{t(it.label)}</span>
              </NavLink>
            ))}
            <div className="flex-1" />
            <NavLink to={chair.to} end className={cx(side, 'border border-line')}>
              <Icon name={chair.icon} size={22} />
              <span className="truncate">{t(chair.label)}</span>
            </NavLink>
          </nav>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          {!framed ? <div className="shrink-0 lg:hidden">{tabs}</div> : null}
          {framed ? children : <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>}
        </div>
      </div>
    </ShellContext.Provider>
  );
}
