import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pickLang, useT } from '../lib/i18n/useT.js';
import { useShop } from '../state/ShopContext.jsx';
import { useAuth } from '../state/AuthContext.jsx';
import { useLive } from '../hooks/useLive.js';
import { useOnline } from '../hooks/useOnline.js';
import { setStaffActive, setStaffRole, watchStaff } from '../services/staff.js';
import { createInvite, deleteInvite, joinUrl, watchInvites } from '../services/invites.js';
import { copyText, openWhatsApp } from '../reports/share.js';
import BottomAction from '../components/BottomAction.jsx';
import Button from '../components/Button.jsx';
import ChipRow from '../components/ChipRow.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Field from '../components/Field.jsx';
import Icon from '../components/Icon.jsx';
import OwnerShell from '../components/OwnerShell.jsx';
import ScreenFrame from '../components/ScreenFrame.jsx';
import { useSnackbar } from '../components/Snackbar.jsx';
import { INVITE_ROLES, JoinLink, PendingInvite, StaffMember } from './manage/StaffParts.jsx';
import { Card, ListSkeleton, Note } from './manage/ui.jsx';
import { EMPTY } from './manage/util.js';

const INVITE_FORM_ID = 'manage-invite-form';
const EMAIL_RE = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

function memberName(m) {
  return m.name || (m.email ? m.email.split('@')[0] : m.id);
}

/** S18: staff (/s/:shopId/owner/staff, owner only). */
export default function S18Staff() {
  const { t, lang } = useT();
  const { shopId, shop } = useShop();
  const { user } = useAuth();
  const { show, confirmUndo } = useSnackbar();
  const online = useOnline();
  const myUid = user ? user.uid : null;

  const [attempt, setAttempt] = useState(0);
  const staffLive = useLive((cb, onError) => watchStaff(shopId, cb, onError), [shopId, attempt]);
  const invitesLive = useLive((cb, onError) => watchInvites(shopId, cb, onError), [shopId, attempt]);
  // Me first, then by join date: changing a role or access never makes a row jump away.
  const staff = useMemo(() => {
    const list = [...(staffLive.data || EMPTY)];
    const joined = (m) => (m.createdAt && typeof m.createdAt.toMillis === 'function' ? m.createdAt.toMillis() : Number.MAX_SAFE_INTEGER);
    return list.sort(
      (a, b) => Number(b.id === myUid) - Number(a.id === myUid) || joined(a) - joined(b) || memberName(a).localeCompare(memberName(b)),
    );
  }, [staffLive.data, myUid]);
  const [withdrawing, setWithdrawing] = useState(() => new Set());
  const invites = useMemo(() => (invitesLive.data || EMPTY).filter((i) => !withdrawing.has(i.email)), [invitesLive.data, withdrawing]);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState('barber');
  const [emailError, setEmailError] = useState(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null); // { email, role, joinUrl, sent }
  const emailRef = useRef(null);
  const resultRef = useRef(null);

  // Bring the outcome (sent, or the join link to share) into view under the form.
  useEffect(() => {
    if (result && resultRef.current) resultRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [result]);

  const shopName = pickLang(lang, shop || {}, 'name', 'nameAr');
  const link = joinUrl(shopId);

  const inviteText = useCallback(
    (to, asRole) => t('manage.staff.waText', { shop: shopName, role: t(`role.${asRole}`), email: to, link }),
    [t, shopName, link],
  );

  const copyLink = useCallback(
    async (text) => {
      const ok = await copyText(text);
      show({ message: ok ? t('manage.staff.copied') : t('manage.staff.copyFailed') });
    },
    [show, t],
  );

  // ------------------------------------------------------------ invite

  const send = async () => {
    if (sending) return;
    const address = email.trim().toLowerCase();
    if (!address) {
      setEmailError(t('manage.staff.emailRequired'));
      emailRef.current?.focus();
      return;
    }
    if (!EMAIL_RE.test(address)) {
      setEmailError(t('auth.error.invalidEmail'));
      emailRef.current?.focus();
      return;
    }
    if (staff.some((m) => String(m.email || '').toLowerCase() === address)) {
      setEmailError(t('manage.staff.alreadyMember', { email: address }));
      emailRef.current?.focus();
      return;
    }
    setEmailError(null);
    setSending(true);
    setResult(null);
    try {
      const res = await createInvite(shopId, address, role);
      setResult(res);
      setEmail('');
    } catch (err) {
      if (err && err.code === 'auth/invalid-email') {
        setEmailError(t('auth.error.invalidEmail'));
        emailRef.current?.focus();
      } else {
        console.error('createInvite failed', err);
        show({ message: t('manage.staff.inviteFailed') });
      }
    } finally {
      setSending(false);
    }
  };

  const withdraw = (invite) => {
    const address = invite.email;
    setWithdrawing((s) => new Set(s).add(address));
    if (result && result.email === address) setResult(null);
    const restore = () =>
      setWithdrawing((s) => {
        const next = new Set(s);
        next.delete(address);
        return next;
      });
    confirmUndo({
      message: t('manage.staff.withdrawn', { email: address }),
      actionLabel: t('common.undo'),
      onUndo: restore,
      onCommit: () => {
        try {
          deleteInvite(shopId, address);
        } catch (err) {
          console.error('deleteInvite failed', err);
          show({ message: t('manage.staff.changeFailed') });
        }
        // The live list drops the invite; keep it hidden until then.
        setTimeout(restore, 4000);
      },
    });
  };

  // ------------------------------------------------------------ team

  const onRole = useCallback(
    (member, next) => {
      if (!next || next === member.role) return;
      const name = memberName(member);
      try {
        setStaffRole(shopId, member.id, next);
      } catch (err) {
        if (err && err.code === 'staff/own-role') show({ message: t('manage.staff.ownRole') });
        else {
          console.error('setStaffRole failed', err);
          show({ message: t('manage.staff.changeFailed') });
        }
        return;
      }
      const before = member.role;
      show({
        message: t('manage.staff.roleChanged', { name, role: t(`role.${next}`) }),
        actionLabel: t('common.undo'),
        onAction: () => {
          try {
            setStaffRole(shopId, member.id, before);
          } catch (err) {
            console.error('undo role failed', err);
          }
        },
      });
    },
    [shopId, show, t],
  );

  const onActive = useCallback(
    (member, on) => {
      const name = memberName(member);
      try {
        setStaffActive(shopId, member.id, on);
      } catch (err) {
        if (err && err.code === 'staff/own-active') show({ message: t('manage.staff.ownActive') });
        else {
          console.error('setStaffActive failed', err);
          show({ message: t('manage.staff.changeFailed') });
        }
        return;
      }
      show({
        message: t(on ? 'manage.staff.turnedOn' : 'manage.staff.turnedOff', { name }),
        actionLabel: t('common.undo'),
        onAction: () => {
          try {
            setStaffActive(shopId, member.id, !on);
          } catch (err) {
            console.error('undo access failed', err);
          }
        },
      });
    },
    [shopId, show, t],
  );

  // ------------------------------------------------------------ render

  const footer = (
    <BottomAction>
      <Button type="submit" form={INVITE_FORM_ID} icon="mail" loading={sending}>
        {t('manage.staff.send')}
      </Button>
    </BottomAction>
  );

  const roleLines = (
    <ul className="flex flex-col gap-2 text-sm">
      {['owner', 'manager', 'barber'].map((r) => (
        <li key={r} className="flex items-start gap-2">
          <Icon name={r === 'owner' ? 'lock' : r === 'manager' ? 'dashboard' : 'scissors'} size={18} className="mt-0.5 shrink-0 text-brass" />
          <span className="text-text-2">
            <span className="font-semibold text-text">{t(`role.${r}`)}: </span>
            {t(`manage.staff.roles.${r}`)}
          </span>
        </li>
      ))}
    </ul>
  );

  const inviteCard = (
    <Card title={t('manage.staff.inviteTitle')} description={t('manage.staff.inviteSub')} icon="mail">
      <form
        id={INVITE_FORM_ID}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex flex-col gap-4"
      >
        <Field
          ref={emailRef}
          label={t('manage.staff.email')}
          value={email}
          onChange={(v) => {
            setEmail(v);
            if (emailError) setEmailError(null);
          }}
          type="email"
          inputMode="email"
          dir="ltr"
          icon="mail"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="send"
          placeholder={t('manage.staff.emailPlaceholder')}
          inputClassName="text-start"
          error={emailError}
        />
        <ChipRow
          label={t('manage.staff.role')}
          value={role}
          onChange={setRole}
          options={INVITE_ROLES.map((r) => ({ value: r, label: t(`role.${r}`) }))}
        />
        {roleLines}
      </form>
      {!online && !result ? (
        <Note tone="warn" icon="wifi-off">
          {t('manage.staff.offline')}
        </Note>
      ) : null}
      {result ? (
        <div ref={resultRef} className="scroll-mb-4">
          {result.sent ? (
            <Note tone="keep" role="status" title={t('auth.inviteSent', { email: result.email })}>
              {t('manage.staff.sentNext', { role: t(`role.${result.role}`) })}
            </Note>
          ) : (
            <div
              role="status"
              className={
                result.demo
                  ? 'flex flex-col gap-3 rounded-ctl border border-brass/50 bg-surface-2 p-3'
                  : 'flex flex-col gap-3 rounded-ctl border border-warn/50 bg-warn/10 p-3'
              }
            >
              {result.demo ? (
                <p className="flex items-start gap-2 text-sm text-text">
                  <Icon name="info" size={20} className="mt-0.5 shrink-0 text-brass" />
                  <span>{t('demo.invite.notSent')}</span>
                </p>
              ) : (
                <p className="flex items-start gap-2 text-sm text-text">
                  <Icon name="warning" size={20} className="mt-0.5 shrink-0 text-warn" />
                  <span>{t('auth.inviteNotSent')}</span>
                </p>
              )}
              <JoinLink
                url={result.joinUrl || link}
                t={t}
                onCopy={() => copyLink(result.joinUrl || link)}
                onWhatsApp={() => openWhatsApp(inviteText(result.email, result.role))}
              />
            </div>
          )}
        </div>
      ) : null}
    </Card>
  );

  let pendingBody;
  if (invitesLive.error) pendingBody = <ErrorState message={t('manage.staff.error')} onRetry={() => setAttempt((n) => n + 1)} />;
  else if (invitesLive.loading) pendingBody = <ListSkeleton label={t('manage.staff.loading')} rows={1} rowClassName="h-16" />;
  else if (!invites.length) pendingBody = <p className="text-sm text-text-2">{t('manage.staff.pendingEmpty')}</p>;
  else {
    pendingBody = (
      <ul className="-my-3 divide-y divide-line">
        {invites.map((inv) => (
          <PendingInvite
            key={inv.email}
            invite={inv}
            t={t}
            lang={lang}
            onCopy={() => copyLink(link)}
            onWhatsApp={(i) => openWhatsApp(inviteText(i.email, i.role))}
            onDelete={withdraw}
          />
        ))}
      </ul>
    );
  }

  let teamBody;
  if (staffLive.error) teamBody = <ErrorState message={t('manage.staff.error')} onRetry={() => setAttempt((n) => n + 1)} />;
  else if (staffLive.loading) teamBody = <ListSkeleton label={t('manage.staff.loading')} rows={2} rowClassName="h-36" />;
  else if (!staff.length) teamBody = <p className="text-sm text-text-2">{t('manage.staff.teamEmpty')}</p>;
  else {
    teamBody = (
      <ul className="-my-4 divide-y divide-line">
        {staff.map((m) => (
          <StaffMember key={m.id} member={m} isMe={m.id === myUid} onRole={onRole} onActive={onActive} t={t} lang={lang} />
        ))}
      </ul>
    );
  }

  const activeCount = staff.filter((m) => m.active === true).length;

  return (
    <OwnerShell>
      <ScreenFrame title={t('ui.owner.staff')} wide footer={footer}>
        <div className="relative grid items-start gap-4 lg:grid-cols-2 lg:gap-6">
          <div className="flex min-w-0 flex-col gap-4">
            {inviteCard}
            <Card
              title={t('manage.staff.pendingTitle')}
              description={t('manage.staff.pendingSub')}
              icon="clock"
              actions={invites.length ? <span className="num rounded-full border border-line px-2.5 py-0.5 text-sm text-text-2">{invites.length}</span> : null}
            >
              {pendingBody}
            </Card>
          </div>
          <Card
            title={t('manage.staff.teamTitle')}
            description={t('manage.staff.teamSub')}
            icon="users"
            actions={
              staff.length ? (
                <span className="num rounded-full border border-line px-2.5 py-0.5 text-sm text-text-2">
                  {t('manage.staff.activeCount', { n: activeCount, total: staff.length })}
                </span>
              ) : null
            }
          >
            {teamBody}
          </Card>
        </div>
      </ScreenFrame>
    </OwnerShell>
  );
}
