// Staff sign-in: email/password or Google (both free on Firebase Spark). No SMS (paid + fraud risk).
import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LogIn, UserPlus, KeyRound, ArrowLeft } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { useData } from '../store/DataProvider'
import { Logo, LangToggle, Field, Spinner, Segmented, useToast } from '../components/ui'

const AUTH_ERRORS = {
  'auth/invalid-credential': 'err_auth_invalid',
  'auth/wrong-password': 'err_auth_invalid',
  'auth/user-not-found': 'err_auth_invalid',
  'auth/invalid-email': 'err_auth_email',
  'auth/email-already-in-use': 'err_auth_in_use',
  'auth/weak-password': 'err_auth_weak',
  'auth/too-many-requests': 'err_auth_too_many',
  'auth/popup-closed-by-user': 'err_auth_popup',
  'auth/operation-not-allowed': 'err_auth_disabled',
  'auth/network-request-failed': 'err_auth_network',
}

export default function Login() {
  const { t } = useI18n()
  const { mode, user, auth } = useData()
  const toast = useToast()
  const navigate = useNavigate()
  const loc = useLocation()
  const [tab, setTab] = useState('in')
  const [form, setForm] = useState({ name: '', email: '', pass: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const dest = loc.state?.from || '/admin'

  if (mode === 'demo') return <Navigate to="/admin" replace />
  if (user && !user.isAnonymous) return <Navigate to={dest} replace />

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const run = async (fn) => {
    setErr('')
    setBusy(true)
    try {
      await fn()
      navigate(dest, { replace: true })
    } catch (e) {
      setErr(t(AUTH_ERRORS[e.code] || 'err_auth_generic'))
    } finally {
      setBusy(false)
    }
  }
  const submit = (e) => {
    e.preventDefault()
    const email = form.email.trim()
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr(t('err_auth_email'))
    if (form.pass.length < 6) return setErr(t('err_auth_weak'))
    if (tab === 'in') run(() => auth.signInEmail(email, form.pass))
    else run(() => auth.signUpEmail(email, form.pass, form.name.trim()))
  }
  const reset = async () => {
    const email = form.email.trim()
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr(t('err_auth_email'))
    try {
      await auth.resetPassword(email)
      toast(t('reset_sent'))
    } catch (e) {
      setErr(t(AUTH_ERRORS[e.code] || 'err_auth_generic'))
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-porcelain">
      <header className="flex items-center justify-between px-4 py-3 pt-safe">
        <Link to="/" className="icon-btn h-11 w-11 border border-ink/15 bg-white/80" aria-label={t('back')}>
          <ArrowLeft size={20} className="rtl:rotate-180" />
        </Link>
        <LangToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-5 pb-12">
        <div className="w-full max-w-md animate-rise">
          <div className="text-center">
            <Logo className="justify-center" />
            <h1 className="mt-6 font-display text-[38px] font-semibold leading-tight">{t('staff_login')}</h1>
            <p className="mt-1 text-[15px] text-ink-500">{t('login_sub')}</p>
          </div>
          <div className="card mt-6 p-5">
            <Segmented
              value={tab}
              onChange={(v) => {
                setTab(v)
                setErr('')
              }}
              options={[
                { value: 'in', label: t('sign_in') },
                { value: 'up', label: t('create_account') },
              ]}
            />
            <form onSubmit={submit} className="mt-5 grid gap-4" noValidate>
              {tab === 'up' && (
                <Field label={t('your_name')}>
                  <input className="field" value={form.name} onChange={set('name')} autoComplete="name" />
                </Field>
              )}
              <Field label={t('email')}>
                <input className="field" type="email" value={form.email} onChange={set('email')} autoComplete="email" dir="ltr" required />
              </Field>
              <Field label={t('password')}>
                <input className="field" type="password" value={form.pass} onChange={set('pass')} autoComplete={tab === 'in' ? 'current-password' : 'new-password'} dir="ltr" required minLength={6} />
              </Field>
              {err && <p className="rounded-2xl bg-bad/10 px-4 py-3 text-[14px] font-semibold text-bad">{err}</p>}
              <button className="btn-primary w-full" disabled={busy}>
                {busy ? <Spinner size={18} /> : tab === 'in' ? <LogIn size={18} /> : <UserPlus size={18} />}
                {tab === 'in' ? t('sign_in') : t('create_account')}
              </button>
            </form>
            <div className="my-4 flex items-center gap-3 text-[12px] font-bold text-ink-400">
              <span className="h-px flex-1 bg-ink/10" />
              {t('or')}
              <span className="h-px flex-1 bg-ink/10" />
            </div>
            <button className="btn-ghost w-full" disabled={busy} onClick={() => run(() => auth.signInGoogle())}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              {t('google_sign_in')}
            </button>
            {tab === 'in' && (
              <button onClick={reset} className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 text-[14px] font-semibold text-mocha">
                <KeyRound size={16} />
                {t('forgot_password')}
              </button>
            )}
          </div>
          <p className="mt-5 text-center text-[13px] text-ink-400">{t('login_hint')}</p>
        </div>
      </main>
    </div>
  )
}
