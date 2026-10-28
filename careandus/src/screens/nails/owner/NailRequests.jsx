// Owner: booking requests customers sent from Try at home (from Nail Mirror's Requests inbox).
// Live list, status tabs with counts, status buttons, one-tap WhatsApp in the customer's language.
import { useMemo, useState } from 'react';
import OwnerLayout from '../../../components/OwnerLayout.jsx';
import Button from '../../../components/Button.jsx';
import Chip from '../../../components/Chip.jsx';
import { Empty } from '../../../components/States.jsx';
import { useT, translate } from '../../../lib/i18n/useT.js';
import { useApp } from '../../../hooks/useApp.jsx';
import { useLive } from '../../../hooks/useLive.js';
import { watchRequests, setRequestStatus } from '../../../services/requests.js';
import { REQUEST_STATUS } from '../../../services/schema.js';
import { whatsappLink } from '../../../reports/agreementCardPdf.js';
import { designSummary } from '../../../ai/nails/index.js';
import { formatDateTime } from '../../../lib/time.js';
import DesignCard from '../DesignCard.jsx';
import { useNailCatalog } from '../useNailCatalog.js';
import { hydrateDesign } from '../lib.js';

export default function NailRequests() {
  const { t, lang, name } = useT();
  const app = useApp();
  const catalog = useNailCatalog();
  const [all] = useLive(app.salonId ? (cb) => watchRequests(app.salonId, cb) : null, [app.salonId], []);
  const [tab, setTab] = useState('new');
  const nailsReqs = useMemo(() => (all || []).filter((r) => r.section === 'nails'), [all]);
  const counts = useMemo(() => Object.fromEntries(REQUEST_STATUS.map((s) => [s, nailsReqs.filter((r) => (r.status || 'new') === s).length])), [nailsReqs]);
  const list = nailsReqs.filter((r) => (r.status || 'new') === tab);
  const salonName = name({ en: app.salon?.name, ar: app.salon?.nameAr });

  const waFor = (r, design) => {
    const l = r.lang === 'en' ? 'en' : 'ar';
    const tt = (k, v) => translate(l, k, v);
    const pickL = (p) => (l === 'ar' ? p.nameAr || p.name : p.name || p.nameAr) || p.hex;
    const text = [tt('nails.wa_reply', { name: r.customerName || '', salon: salonName }), designSummary(design, tt, pickL)].join('\n');
    return whatsappLink(r.customerPhone, text);
  };

  return (
    <OwnerLayout title={t('nails.owner_requests')}>
      <div className="no-scrollbar -mx-1 mb-4 flex gap-2 overflow-x-auto px-1" role="tablist">
        {REQUEST_STATUS.map((s) => (
          <Chip key={s} selected={tab === s} onClick={() => setTab(s)} role="tab" aria-selected={tab === s}>
            {t(`nails.status_${s}`)} <span className="num">({counts[s] || 0})</span>
          </Chip>
        ))}
      </div>
      {!list.length ? <Empty icon="list" title={t('nails.no_requests')} body={tab === 'new' ? t('nails.no_requests_body') : null} /> : null}
      <ul className="grid grid-cols-1 gap-3 desk:grid-cols-2" data-testid="nails-requests">
        {list.map((r) => {
          const design = r.params?.base ? hydrateDesign(r.params, catalog.byId) : null;
          const when = r.createdAt?.toDate ? r.createdAt.toDate() : null;
          return (
            <li key={r.id} className="card p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{r.customerName || t('nails.guest')}</p>
                  <p className="num text-[13px] text-ink2" dir="ltr">{r.customerPhone || ''}</p>
                </div>
                <p className="num text-[12px] text-ink2">{when ? formatDateTime(when, lang) : ''}</p>
              </div>
              {design ? <DesignCard design={design} compact /> : null}
              {r.preferredDate || r.note ? (
                <dl className="mt-3 space-y-1 text-[14px]">
                  {r.preferredDate ? (
                    <div>
                      <dt className="inline text-ink2">{t('nails.preferred_time')}: </dt>
                      <dd className="inline">{r.preferredDate}</dd>
                    </div>
                  ) : null}
                  {r.note ? (
                    <div>
                      <dt className="inline text-ink2">{t('nails.note')}: </dt>
                      <dd className="inline">{r.note}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {REQUEST_STATUS.filter((s) => s !== (r.status || 'new')).map((s) => (
                  <Chip key={s} onClick={() => setRequestStatus(app.salonId, r.id, s)}>
                    {t(`nails.mark_${s}`)}
                  </Chip>
                ))}
              </div>
              {r.customerPhone && design ? (
                <div className="mt-3">
                  <Button
                    variant="secondary"
                    icon="whatsapp"
                    onClick={() => {
                      window.open(waFor(r, design), '_blank', 'noopener');
                      if ((r.status || 'new') === 'new') setRequestStatus(app.salonId, r.id, 'contacted');
                    }}
                  >
                    {t('nails.open_whatsapp')}
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </OwnerLayout>
  );
}
