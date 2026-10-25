// Staff (owner only): who can open this salon's admin. The owner adds an email + role; the person signs in
// at /login with that exact email and taps "Accept invite". No emails are sent — the owner shares the steps.
import { useMemo, useState } from 'react'
import { UserPlus, UserMinus, Crown, Paintbrush, Copy, MessageCircle, Lock, Trash2, CircleCheck, Hourglass, Info } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { useData } from '../store/DataProvider'
import { PageHeader, AuditLine } from './common'
import { Field, Badge, Confirm, Spinner, useToast } from '../components/ui'
import { appUrl } from '../lib/base'
import { waLink, dateOnly } from '../lib/format'

const ROLES = ['tech', 'owner']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const lower = (s) => String(s || '').trim().toLowerCase()

/** Firestore resolves a write only after the server acknowledges it. Offline the write is already safe in the
 *  local queue (and visible at once), so don't leave the salon staring at a spinner. */
function settle(promise) {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) return promise
  promise.catch(() => {})
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve('queued'), 1200))])
}

export default function Staff() {
  const { isOwner } = useData()
  return isOwner ? <StaffAdmin /> : <OwnerOnly />
}

function StaffAdmin() {
  const { t, pick, lang } = useI18n()
  const { staff, user, mode, actions } = useData()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('tech')
  const [touched, setTouched] = useState(false)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lastInvite, setLastInvite] = useState(null) // { email, role } — just added, ready to share
  const [memberToRemove, setMemberToRemove] = useState(null)
  const [inviteToRemove, setInviteToRemove] = useState(null)

  const loginUrl = appUrl('login')
  const salonName = pick(staff.salon || {}) || t('app_name')

  const memberEmails = useMemo(() => new Set(staff.members.map((m) => lower(m.email)).filter(Boolean)), [staff.members])
  const members = useMemo(() => {
    const coll = new Intl.Collator(lang === 'ar' ? 'ar' : 'en', { sensitivity: 'base' })
    const rank = (m) => (m.role === 'owner' ? 0 : 1)
    return [...staff.members].sort((a, b) => rank(a) - rank(b) || coll.compare(a.name || a.email || '', b.name || b.email || ''))
  }, [staff.members, lang])
  const inviteByEmail = useMemo(() => new Map(staff.invites.map((i) => [lower(i.email || i.id), i])), [staff.invites])
  // An accepted invite stays in the database; only show the ones nobody has used yet.
  const pending = useMemo(
    () => staff.invites.filter((i) => !memberEmails.has(lower(i.email || i.id))).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [staff.invites, memberEmails],
  )

  // ---------------------------------------------------------------- invite form
  const key = lower(email)
  const error = useMemo(() => {
    if (!key) return t('set_err_email_required')
    if (!EMAIL_RE.test(key)) return t('set_err_email')
    if (memberEmails.has(key)) return t('set_err_already_member')
    return null
  }, [key, memberEmails, t])
  const shownError = tried ? error : touched && key ? error : null
  const alreadyInvited = !error && inviteByEmail.has(key)

  const shareText = (to) => t('set_share_text', { salon: salonName, url: loginUrl, email: to })

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      toast(t('set_copied'), 'ok', 1400)
    } catch {
      toast(t('set_copy_failed'), 'error')
    }
  }

  const invite = async (e) => {
    e.preventDefault()
    if (busy) return
    setTried(true)
    if (error) {
      toast(error, 'error')
      return
    }
    setBusy(true)
    try {
      const res = await settle(actions.inviteStaff(key, role))
      if (res === 'queued') toast(t('set_saved_offline'), 'info', 3500)
      else toast(alreadyInvited ? t('set_invite_updated') : t('set_invite_added'))
      setLastInvite({ email: key, role })
      setEmail('')
      setRole('tech')
      setTouched(false)
      setTried(false)
    } catch (x) {
      console.warn('[inviteStaff]', x)
      toast(x?.message === 'invalid_email' ? t('set_err_email') : t('set_err_generic'), 'error', 4000)
    } finally {
      setBusy(false)
    }
  }

  // ---------------------------------------------------------------- removals
  const doRemoveMember = async () => {
    const m = memberToRemove
    if (!m) return
    try {
      await settle(actions.removeMember(m.id))
      // Also withdraw the invite they joined with, so they cannot simply accept it again.
      const inv = inviteByEmail.get(lower(m.email))
      if (inv) await settle(actions.removeInvite(inv.id || lower(inv.email)))
      toast(t('set_member_removed'))
    } catch (x) {
      console.warn('[removeMember]', x)
      toast(t('set_err_generic'), 'error', 4000)
    }
  }

  const doRemoveInvite = async () => {
    const inv = inviteToRemove
    if (!inv) return
    try {
      await settle(actions.removeInvite(inv.id || lower(inv.email)))
      if (lastInvite && lastInvite.email === lower(inv.email || inv.id)) setLastInvite(null)
      toast(t('set_invite_removed'))
    } catch (x) {
      console.warn('[removeInvite]', x)
      toast(t('set_err_generic'), 'error', 4000)
    }
  }

  const memberLabel = (m) => m?.name || m?.email || t('set_member_unnamed')

  return (
    <div className="animate-rise">
      <PageHeader eyebrow={t('set_staff_eyebrow')} title={t('set_staff_title')} subtitle={t('set_staff_subtitle')} />

      {mode === 'demo' && (
        <p className="mb-4 flex items-start gap-2 rounded-2xl bg-glaze-50 px-4 py-3 text-[13px] font-semibold text-glaze-700">
          <Info size={16} className="mt-0.5 shrink-0" />
          {t('set_staff_demo')}
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* team + pending invites (left column on desktop) */}
        <div className="flex flex-col gap-6 lg:row-span-2">
          <section>
            <h2 className="mb-3 flex items-baseline gap-2 font-display text-[28px] font-semibold">
              {t('set_team_title')}
              <span className="font-sans text-[14px] font-bold text-ink-400">{members.length}</span>
            </h2>
            {members.length === 0 ? (
              <p className="rounded-3xl border border-dashed border-ink/15 p-5 text-[14px] text-ink-500">{t('set_team_empty')}</p>
            ) : (
              <div className="card divide-y divide-ink/5">
                {members.map((m) => {
                  const isMe = m.id === user?.uid
                  const canRemove = m.role !== 'owner' && !isMe
                  const label = memberLabel(m)
                  return (
                    <div key={m.id} className="flex min-h-[72px] items-center gap-3 p-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-mocha-50 text-[16px] font-bold text-mocha" aria-hidden="true">
                        {label.trim().charAt(0).toUpperCase() || '?'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-[15px] font-bold" dir="auto">
                            {label}
                          </span>
                          {isMe && (
                            <Badge tone="glaze" className="shrink-0">
                              {t('set_you')}
                            </Badge>
                          )}
                        </p>
                        {m.email && m.email !== label && (
                          <p className="truncate text-[12px] text-ink-500">
                            <span dir="ltr">{m.email}</span>
                          </p>
                        )}
                        {m.createdAt ? <p className="text-[11px] text-ink-400">{t('set_joined', { date: dateOnly(m.createdAt, lang) })}</p> : null}
                      </div>
                      <RoleBadge role={m.role} />
                      {canRemove && (
                        <button type="button" onClick={() => setMemberToRemove(m)} className="icon-btn h-11 w-11 shrink-0 border border-bad/25 text-bad" aria-label={t('set_member_remove', { name: label })}>
                          <UserMinus size={18} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 flex items-baseline gap-2 font-display text-[28px] font-semibold">
              {t('set_pending_title')}
              <span className="font-sans text-[14px] font-bold text-ink-400">{pending.length}</span>
            </h2>
            {pending.length === 0 ? (
              <p className="rounded-3xl border border-dashed border-ink/15 p-5 text-[14px] text-ink-500">{t('set_no_invites')}</p>
            ) : (
              <div className="card divide-y divide-ink/5">
                {pending.map((inv) => {
                  const to = inv.email || inv.id
                  return (
                    <div key={inv.id || to} className="flex min-h-[72px] items-center gap-3 p-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-champagne-100 text-champagne-700" aria-hidden="true">
                        <Hourglass size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-bold">
                          <span dir="ltr">{to}</span>
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <RoleBadge role={inv.role} />
                          <AuditLine rec={inv} />
                        </div>
                      </div>
                      <a
                        href={waLink('', shareText(to))}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="icon-btn h-11 w-11 shrink-0 bg-ok/10 text-ok"
                        aria-label={t('set_share_wa')}
                        title={t('set_share_wa')}
                      >
                        <MessageCircle size={18} />
                      </a>
                      <button type="button" onClick={() => setInviteToRemove(inv)} className="icon-btn h-11 w-11 shrink-0 border border-bad/25 text-bad" aria-label={t('set_invite_remove')} title={t('set_invite_remove')}>
                        <Trash2 size={18} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        {/* invite form — first on phones (the one action of this screen) */}
        <section className="order-first lg:order-none">
          <h2 className="mb-3 font-display text-[28px] font-semibold">{t('set_invite_title')}</h2>
          <form onSubmit={invite} noValidate className="card flex flex-col gap-4 p-4 sm:p-5">
            <Field label={t('set_invite_email')} hint={alreadyInvited ? t('set_invite_exists') : t('set_invite_email_hint')} error={shownError}>
              <input
                className="field"
                type="email"
                inputMode="email"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                dir="ltr"
                maxLength={120}
                placeholder={t('set_invite_email_ph')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched(true)}
                aria-invalid={!!shownError}
              />
            </Field>
            <Field label={t('set_invite_role')} hint={t(role === 'owner' ? 'set_role_owner_hint' : 'set_role_tech_hint')}>
              <select className="field" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t('set_role_' + r)}
                  </option>
                ))}
              </select>
            </Field>
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? <Spinner size={18} /> : <UserPlus size={18} />}
              {t('set_invite_btn')}
            </button>
            <p className="text-[12px] text-ink-400">{t('set_invite_note')}</p>
          </form>

          {lastInvite && (
            <div className="mt-3 animate-rise rounded-3xl bg-ok/10 p-4" aria-live="polite">
              <p className="flex items-center gap-2 text-[15px] font-bold text-ok">
                <CircleCheck size={18} className="shrink-0" />
                {t('set_invite_ready')}
              </p>
              <p className="mt-1 truncate text-[13px] font-semibold text-ink-700">
                <span dir="ltr">{lastInvite.email}</span> · {t('set_role_' + lastInvite.role)}
              </p>
              <p className="mt-1 text-[13px] text-ink-700">{t('set_invite_ready_text')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={waLink('', shareText(lastInvite.email))} target="_blank" rel="noopener noreferrer" className="btn-ghost min-h-[44px] px-4 text-[14px] text-ok">
                  <MessageCircle size={16} />
                  {t('set_share_wa')}
                </a>
                <button type="button" className="btn-ghost min-h-[44px] px-4 text-[14px]" onClick={() => copy(shareText(lastInvite.email))}>
                  <Copy size={16} />
                  {t('set_copy_text')}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* how staff join */}
        <section>
          <h2 className="mb-3 font-display text-[28px] font-semibold">{t('set_how_title')}</h2>
          <ol className="card divide-y divide-ink/5">
            {[1, 2, 3].map((n) => (
              <li key={n} className="flex gap-3 p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink font-display text-[18px] font-semibold text-porcelain">{n}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold">{t(`set_step${n}_title`)}</p>
                  <p className="mt-0.5 text-[13px] text-ink-500">{t(`set_step${n}_text`)}</p>
                  {n === 2 && (
                    <div className="mt-2 flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate rounded-xl bg-ink/5 px-3 py-2 font-mono text-[13px] font-semibold">
                        <span dir="ltr">{loginUrl}</span>
                      </p>
                      <button type="button" onClick={() => copy(loginUrl)} className="icon-btn h-11 w-11 shrink-0 bg-ink/5" aria-label={t('set_copy_login')} title={t('set_copy_login')}>
                        <Copy size={18} />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <Confirm
        open={!!memberToRemove}
        title={t('set_member_remove_title', { name: memberLabel(memberToRemove) })}
        text={t('set_member_remove_text', { name: memberLabel(memberToRemove) })}
        confirmLabel={t('remove')}
        onConfirm={doRemoveMember}
        onClose={() => setMemberToRemove(null)}
      />
      <Confirm
        open={!!inviteToRemove}
        title={t('set_invite_remove_title')}
        text={t('set_invite_remove_text', { email: inviteToRemove ? inviteToRemove.email || inviteToRemove.id : '' })}
        confirmLabel={t('remove')}
        onConfirm={doRemoveInvite}
        onClose={() => setInviteToRemove(null)}
      />
    </div>
  )
}

function RoleBadge({ role }) {
  const { t } = useI18n()
  const owner = role === 'owner'
  return (
    <Badge tone={owner ? 'mocha' : 'glaze'} className="shrink-0">
      {owner ? <Crown size={12} /> : <Paintbrush size={12} />}
      {t(owner ? 'set_role_owner' : 'set_role_tech')}
    </Badge>
  )
}

function OwnerOnly() {
  const { t } = useI18n()
  return (
    <div className="animate-rise">
      <PageHeader eyebrow={t('set_staff_eyebrow')} title={t('set_staff_title')} />
      <div className="flex max-w-2xl items-start gap-3 rounded-3xl bg-champagne-100 p-5 text-champagne-700">
        <Lock size={20} className="mt-0.5 shrink-0" />
        <div>
          <p className="text-[15px] font-bold">{t('set_staff_owner_only_title')}</p>
          <p className="mt-1 text-[14px]">{t('set_staff_owner_only_text')}</p>
        </div>
      </div>
    </div>
  )
}
