// Salon admin shell: guards access (staff only), handles first-time salon setup + invites,
// desktop sidebar / mobile bottom nav, live "new requests" badge.
import { useState } from 'react'
import { NavLink, Navigate, Outlet, Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Inbox, Images, Palette, Scissors, FileBarChart, Users, Settings as Cog, History, LogOut, Sparkles, MoreHorizontal, ShieldAlert } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { useData } from '../store/DataProvider'
import { Logo, LangToggle, Spinner, Sheet, useToast } from '../components/ui'

const NAV = [
  { to: '/admin', key: 'nav_dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/requests', key: 'nav_requests', icon: Inbox, badge: 'requests' },
  { to: '/admin/looks', key: 'nav_looks', icon: Images },
  { to: '/admin/inventory', key: 'nav_inventory', icon: Palette },
  { to: '/admin/services', key: 'nav_services', icon: Scissors },
  { to: '/admin/reports', key: 'nav_reports', icon: FileBarChart },
  { to: '/admin/staff', key: 'nav_staff', icon: Users, owner: true },
  { to: '/admin/settings', key: 'nav_settings', icon: Cog, owner: true },
  { to: '/admin/audit', key: 'nav_audit', icon: History },
]
const MOBILE_MAIN = ['/admin', '/admin/requests', '/admin/inventory', '/admin/looks']

export default function AdminLayout() {
  const { t } = useI18n()
  const data = useData()
  const { mode, user, authReady, member, memberReady, isStaff, isOwner, salonExists, staff, auth, actions } = data
  const toast = useToast()
  const loc = useLocation()
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!authReady || (user && !memberReady)) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner size={30} />
      </div>
    )
  }
  if (mode === 'firebase' && (!user || user.isAnonymous)) return <Navigate to="/login" state={{ from: loc.pathname }} replace />

  // Signed in but not a member yet → claim (first owner) or accept invite
  if (mode === 'firebase' && !member) {
    const run = async (fn) => {
      setBusy(true)
      try {
        await fn()
        toast(t('welcome_aboard'))
      } catch (e) {
        toast(t('err_' + (e.message || 'generic')) || e.message, 'error', 4000)
      } finally {
        setBusy(false)
      }
    }
    return (
      <div className="flex min-h-dvh items-center justify-center bg-porcelain px-5">
        <div className="card w-full max-w-md p-6 text-center">
          <Logo className="justify-center" />
          <ShieldAlert className="mx-auto mt-6 text-mocha" size={36} />
          <h1 className="mt-3 font-display text-[30px] font-semibold">{salonExists === false ? t('setup_title') : t('no_access_title')}</h1>
          <p className="mt-2 text-[15px] text-ink-500">{salonExists === false ? t('setup_text') : t('no_access_text', { email: user.email || '' })}</p>
          <div className="mt-6 flex flex-col gap-3">
            {salonExists === false && (
              <button className="btn-primary" disabled={busy} onClick={() => run(() => actions.claimSalon({ withSeed: true }))}>
                {busy ? <Spinner size={18} /> : <Sparkles size={18} />}
                {t('setup_cta')}
              </button>
            )}
            {salonExists !== false && (
              <button className="btn-primary" disabled={busy} onClick={() => run(() => actions.acceptInvite())}>
                {busy ? <Spinner size={18} /> : null}
                {t('accept_invite')}
              </button>
            )}
            <button className="btn-ghost" onClick={() => auth.signOut()}>
              <LogOut size={18} />
              {t('sign_out')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const newRequests = staff.requests.filter((r) => r.status === 'new').length
  const items = NAV.filter((n) => !n.owner || isOwner)

  return (
    <div className="min-h-dvh bg-porcelain lg:flex">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden print:!hidden h-dvh w-[260px] shrink-0 flex-col border-e border-ink/5 bg-porcelain-50 p-4 lg:flex">
        <Link to="/" className="px-2 py-2">
          <Logo />
        </Link>
        <nav className="mt-6 flex flex-1 flex-col gap-1">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `flex min-h-[48px] items-center gap-3 rounded-2xl px-4 text-[15px] font-semibold transition ${isActive ? 'bg-ink text-white' : 'text-ink-700 hover:bg-ink/5'}`}
            >
              <n.icon size={19} />
              <span className="flex-1">{t(n.key)}</span>
              {n.badge === 'requests' && newRequests > 0 && <span className="rounded-full bg-bad px-2 py-0.5 text-[12px] font-bold text-white">{newRequests}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 space-y-2 border-t border-ink/10 pt-4">
          <Link to="/try" className="btn-mocha w-full">
            <Sparkles size={18} />
            {t('open_studio')}
          </Link>
          <div className="flex items-center gap-2">
            <LangToggle />
            <button onClick={() => auth.signOut()} className="btn-ghost min-h-[44px] flex-1 text-[14px]" disabled={mode === 'demo'}>
              <LogOut size={16} />
              {t('sign_out')}
            </button>
          </div>
          <p className="truncate px-1 text-[12px] text-ink-400">{user?.email}</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1 pb-28 lg:pb-10">
        {/* mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 print:hidden border-b border-ink/5 bg-porcelain/90 px-4 py-2 pt-safe backdrop-blur lg:hidden">
          <Link to="/">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/try" className="btn-mocha min-h-[44px] px-4 text-[14px]">
              <Sparkles size={16} />
              {t('studio')}
            </Link>
            <LangToggle />
          </div>
        </header>
        {mode === 'demo' && (
          <div className="mx-4 mt-3 rounded-2xl print:hidden bg-champagne-100 px-4 py-3 text-[13px] font-semibold text-champagne-700 lg:mx-8">{t('demo_banner')}</div>
        )}
        {data.error && (
          <div className="mx-4 mt-3 flex items-center justify-between gap-2 rounded-2xl bg-bad/10 px-4 py-3 text-[13px] font-semibold text-bad lg:mx-8">
            <span>
              {t('sync_error')}: {data.error}
            </span>
            <button onClick={data.clearError} className="underline">
              {t('close')}
            </button>
          </div>
        )}
        <main className="mx-auto max-w-6xl px-4 py-5 lg:px-8 lg:py-8 print:max-w-none print:p-0">
          <Outlet />
        </main>
      </div>

      {/* mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 print:hidden border-t border-ink/10 bg-white/95 pb-safe backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-lg justify-around px-2 pt-1.5">
          {items
            .filter((n) => MOBILE_MAIN.includes(n.to))
            .map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `relative flex min-w-[64px] flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[11px] font-bold ${isActive ? 'text-ink' : 'text-ink-400'}`}>
                <n.icon size={22} />
                {t(n.key)}
                {n.badge === 'requests' && newRequests > 0 && <span className="absolute end-2 top-0 rounded-full bg-bad px-1.5 text-[10px] text-white">{newRequests}</span>}
              </NavLink>
            ))}
          <button onClick={() => setMore(true)} className="flex min-w-[64px] flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[11px] font-bold text-ink-400">
            <MoreHorizontal size={22} />
            {t('more')}
          </button>
        </div>
      </nav>
      <Sheet open={more} onClose={() => setMore(false)} title={t('more')}>
        <div className="grid grid-cols-2 gap-2">
          {items
            .filter((n) => !MOBILE_MAIN.includes(n.to))
            .map((n) => (
              <NavLink key={n.to} to={n.to} onClick={() => setMore(false)} className="card flex min-h-[72px] items-center gap-3 p-4 text-[15px] font-bold">
                <n.icon size={20} className="text-mocha" />
                {t(n.key)}
              </NavLink>
            ))}
          <button onClick={() => auth.signOut()} className="card flex min-h-[72px] items-center gap-3 p-4 text-[15px] font-bold text-bad" disabled={mode === 'demo'}>
            <LogOut size={20} />
            {t('sign_out')}
          </button>
        </div>
      </Sheet>
      {!isStaff && null}
    </div>
  )
}
