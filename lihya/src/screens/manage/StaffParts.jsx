// Pieces of the staff screen (S18): the join-link box, a pending invite and a team member.

import Button from '../../components/Button.jsx';
import Chip from '../../components/Chip.jsx';
import ChipRow from '../../components/ChipRow.jsx';
import IconButton from '../../components/IconButton.jsx';
import Toggle from '../../components/Toggle.jsx';
import { cx } from '../../components/kit.js';
import { formatMuscat } from '../../lib/time.js';

export const STAFF_ROLES = Object.freeze(['owner', 'manager', 'barber']);
export const INVITE_ROLES = Object.freeze(['barber', 'manager']);

function dateText(value, lang) {
  if (!value) return '';
  try {
    const s = formatMuscat(value, lang, { dateStyle: 'medium' });
    return s === 'Invalid Date' ? '' : s;
  } catch {
    return '';
  }
}

/** Join link with Copy and Share on WhatsApp (when the email did not go out, or to resend by hand). */
export function JoinLink({ url, onCopy, onWhatsApp, t }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-2">{t('manage.staff.link')}</span>
        <p dir="ltr" className="select-all break-all rounded-ctl border border-line bg-surface-2 px-3 py-2.5 text-start font-mono text-sm text-text">
          {url}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon="copy" onClick={onCopy}>
          {t('manage.staff.copyLink')}
        </Button>
        <Button variant="secondary" icon="whatsapp" onClick={onWhatsApp}>
          {t('manage.staff.shareWa')}
        </Button>
      </div>
    </div>
  );
}

/** One pending invite: email, role, date, share by hand, withdraw. */
export function PendingInvite({ invite, onCopy, onWhatsApp, onDelete, t, lang }) {
  const date = dateText(invite.createdAt, lang);
  return (
    <li className="flex flex-wrap items-center gap-2 py-3">
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex min-w-0">
          <p dir="ltr" className="min-w-0 truncate text-base font-medium">
            {invite.email}
          </p>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-2">
          <Chip size="sm">{t(`role.${invite.role}`)}</Chip>
          {date ? <span>{t('manage.staff.invitedOn', { date })}</span> : <span>{t('manage.staff.notSynced')}</span>}
        </div>
      </div>
      <div className="ms-auto flex shrink-0 gap-2">
        <IconButton icon="whatsapp" label={t('manage.staff.shareWaFor', { email: invite.email })} onClick={() => onWhatsApp(invite)} tone="bordered" />
        <IconButton icon="copy" label={t('manage.staff.copyFor', { email: invite.email })} onClick={() => onCopy(invite)} tone="bordered" />
        <IconButton icon="trash" label={t('manage.staff.withdrawFor', { email: invite.email })} onClick={() => onDelete(invite)} tone="danger" />
      </div>
    </li>
  );
}

/** One team member: name, email, joined date, role chips and the access switch. */
export function StaffMember({ member, isMe, onRole, onActive, t, lang }) {
  const name = member.name || (member.email ? member.email.split('@')[0] : member.id);
  const active = member.active === true;
  const joined = dateText(member.createdAt, lang);
  const initial = String(name || '?').trim().slice(0, 1).toUpperCase();
  const named = (text) => (
    <>
      <span className="sr-only">{name}: </span>
      {text}
    </>
  );
  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cx(
            'display flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-xl font-semibold',
            isMe ? 'border-brass text-brass' : 'border-line text-text-2',
          )}
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cx('flex flex-wrap items-center gap-2 text-base font-semibold', !active && 'text-text-2')}>
            <span className="break-words">{name}</span>
            {isMe ? (
              <Chip size="sm" tone="info">
                {t('manage.staff.you')}
              </Chip>
            ) : null}
            {!active ? (
              <Chip size="sm" tone="warn" icon="lock">
                {t('manage.staff.paused')}
              </Chip>
            ) : null}
          </p>
          {member.email ? (
            <div className="flex min-w-0">
              <p dir="ltr" className="min-w-0 truncate text-sm text-text-2">
                {member.email}
              </p>
            </div>
          ) : null}
          {joined ? <p className="text-sm text-text-2">{t('manage.staff.joined', { date: joined })}</p> : null}
        </div>
      </div>
      <ChipRow
        label={named(t('manage.staff.role'))}
        value={member.role}
        onChange={(role) => onRole(member, role)}
        options={STAFF_ROLES.map((r) => ({ value: r, label: t(`role.${r}`), disabled: isMe }))}
      />
      <Toggle
        checked={active}
        onChange={(on) => onActive(member, on)}
        disabled={isMe}
        label={named(t('manage.staff.access'))}
        description={isMe ? t('manage.staff.ownLocked') : active ? t('manage.staff.accessOn') : t('manage.staff.accessOff')}
        className="disabled:opacity-60"
      />
    </li>
  );
}
