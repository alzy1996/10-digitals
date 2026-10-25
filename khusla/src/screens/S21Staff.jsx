import { useState } from 'react';
import OwnerLayout from '../components/OwnerLayout.jsx';
import Button from '../components/Button.jsx';
import Chip, { Tag } from '../components/Chip.jsx';
import Icon from '../components/Icon.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useApp } from '../hooks/useApp.jsx';
import { useLive } from '../hooks/useLive.js';
import { useSnackbar } from '../components/Snackbar.jsx';
import { watchStaff, updateStaff, removeStaff } from '../services/staff.js';
import { watchInvites, createInvite, deleteInvite, isEmail } from '../services/invites.js';
import { whatsappLink } from '../reports/agreementCardPdf.js';

export default function S21Staff() {
  const { t } = useT();
  const app = useApp();
  const snack = useSnackbar();
  const [staff] = useLive((cb) => watchStaff(app.salonId, cb), [app.salonId], []);
  const [invites] = useLive((cb) => watchInvites(app.salonId, cb), [app.salonId], []);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('stylist');
  const [link, setLink] = useState(null);

  const invite = () => {
    try {
      const url = createInvite(app.salonId, email, role);
      setLink({ url, email: email.trim().toLowerCase() });
      setEmail('');
    } catch {
      snack.show({ message: t('staff.badEmail'), tone: 'risk' });
    }
  };

  return (
    <OwnerLayout title={t('staff.title')}>
      <div className="grid grid-cols-1 gap-6 desk:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg">{t('staff.team')}</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {(staff || []).map((m) => {
              const self = m.uid === app.me?.uid;
              return (
                <li key={m.uid} className={`p-4 ${m.active ? '' : 'opacity-55'}`}>
                  <div className="flex items-center gap-2">
                    <span className="flex-1">
                      <span className="block font-medium">{m.name}{self ? ` · ${t('staff.you')}` : ''}</span>
                      <span className="block text-xs text-ink2" dir="ltr">{m.email}</span>
                    </span>
                    {!m.active ? <Tag tone="warn">{t('staff.inactive')}</Tag> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {['owner', 'manager', 'stylist'].map((r) => (
                      <Chip key={r} selected={m.role === r} disabled={self} onClick={() => !self && updateStaff(app.salonId, m, { role: r })}>
                        {t(`role.${r}`)}
                      </Chip>
                    ))}
                    {!self ? (
                      <>
                        <Chip onClick={() => updateStaff(app.salonId, m, { active: !m.active })}>{m.active ? t('staff.deactivate') : t('staff.activate')}</Chip>
                        <Chip tone="risk" icon="trash" onClick={() => removeStaff(app.salonId, m)}>{t('common.remove')}</Chip>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
        <section>
          <h2 className="mb-3 text-lg">{t('staff.invite')}</h2>
          <div className="card p-5">
            <label className="label mb-1 block" htmlFor="inv-email">{t('login.email')}</label>
            <input id="inv-email" type="email" dir="ltr" className="field mb-3" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@salon.om" />
            <div className="mb-4 flex gap-2">
              {['manager', 'stylist'].map((r) => (
                <Chip key={r} selected={role === r} onClick={() => setRole(r)}>{t(`role.${r}`)}</Chip>
              ))}
            </div>
            <Button icon="plus" disabled={!isEmail(email)} onClick={invite}>{t('staff.sendInvite')}</Button>
            {link ? (
              <div className="mt-4 rounded-control border border-ok p-3 text-sm">
                <div className="font-semibold text-ok">{t('staff.inviteReady', { email: link.email })}</div>
                <div className="mt-1 break-all text-xs text-ink2" dir="ltr">{link.url}</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button variant="secondary" icon="share" onClick={async () => { try { await navigator.clipboard.writeText(link.url); snack.show({ message: t('common.copied') }); } catch { /* copy manually */ } }}>{t('common.copy')}</Button>
                  <Button variant="secondary" icon="whatsapp" onClick={() => window.open(whatsappLink('', t('staff.inviteText', { url: link.url })), '_blank', 'noopener')}>WhatsApp</Button>
                </div>
                <p className="mt-2 text-xs text-ink2">{t('staff.inviteHow')}</p>
              </div>
            ) : null}
          </div>
          {(invites || []).length ? (
            <>
              <h3 className="mb-2 mt-6 text-base font-semibold">{t('staff.pending')}</h3>
              <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                {(invites || []).map((i) => (
                  <li key={i.id} className="flex items-center gap-3 p-3">
                    <Icon name="user" className="text-ink2" />
                    <span className="flex-1 text-sm" dir="ltr">{i.email}</span>
                    <Tag>{t(`role.${i.role}`)}</Tag>
                    <button type="button" aria-label={t('common.delete')} className="press grid min-h-tap min-w-tap place-items-center rounded-full text-risk" onClick={() => deleteInvite(app.salonId, i.id)}>
                      <Icon name="trash" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      </div>
    </OwnerLayout>
  );
}
