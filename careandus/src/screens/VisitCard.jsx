// One Agreement Card for the whole visit: every service (hair, nails, beard) of the
// same client, with each service's approvals and the salon's own prices.
import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Button from '../components/Button.jsx';
import { Tag } from '../components/Chip.jsx';
import { Empty } from '../components/States.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useApp } from '../hooks/useApp.jsx';
import { useSession } from '../hooks/useSession.jsx';
import { useLive } from '../hooks/useLive.js';
import { useSnackbar } from '../components/Snackbar.jsx';
import { watchVisit } from '../services/consultations.js';
import { watchPolishes } from '../services/sections/nails.js';
import { visitSummary, visitText } from '../reports/visit.js';
import { agreementPdf, downloadBlob, whatsappLink } from '../reports/agreementCardPdf.js';
import { formatOmr } from '../lib/format.js';
import { sectionMeta } from '../lib/sections.js';

export default function VisitCard() {
  const { visitId } = useParams();
  const { t, lang, name } = useT();
  const app = useApp();
  const session = useSession();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const card = useRef(null);
  const [busy, setBusy] = useState(false);
  const [list] = useLive((cb) => watchVisit(app.salonId, visitId, cb), [app.salonId, visitId], []);
  const [polishes] = useLive((cb) => watchPolishes(app.salonId, cb), [app.salonId], []);
  const summary = useMemo(
    () => visitSummary(list || [], { t, name, catalog: app.catalog, polishes: polishes || [], products: app.products }),
    [list, polishes, app.catalog, app.products, t, name],
  );
  const salonName = name({ en: app.salon?.name, ar: app.salon?.nameAr });
  const clientName = session.visitId === visitId ? session.client?.displayName : '';
  const money = (v) => formatOmr(v, lang);

  const pdf = async () => {
    setBusy(true);
    try {
      const { blob, filename } = await agreementPdf(card.current, `visit-${visitId}.pdf`);
      downloadBlob(blob, filename);
    } finally {
      setBusy(false);
    }
  };

  const whatsapp = async () => {
    const text = visitText(summary, { t, name, salonName, sectionName: (s) => name(sectionMeta(s).name), formatOmr: money });
    try {
      await navigator.clipboard.writeText(text);
      snack.show({ message: t('common.copied') });
    } catch {
      // the WhatsApp text still opens below
    }
    window.open(whatsappLink(session.client?.phone || '', text), '_blank', 'noopener');
  };

  return (
    <main className="screen mx-auto max-w-[720px]">
      <TopBar title={t('visit.title')} onBack={() => navigate(-1)} />
      {!summary.services.length ? (
        <Empty icon="list" title={t('visit.empty')} />
      ) : (
        <>
          <article ref={card} className="card mb-5 p-5">
            <p className="eyebrow">{salonName}</p>
            <h1 className="mt-1 text-2xl">{clientName || t('visit.title')}</h1>
            <p className="mb-4 text-sm text-ink2">{t('visit.lead')}</p>
            <div className="space-y-4">
              {summary.services.map((s) => (
                <section key={s.id} className="rounded-control border border-line p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h2 className="text-lg">{name(sectionMeta(s.section).name)}</h2>
                    <Tag tone={s.approved ? 'ok' : 'warn'}>{s.approved ? t('visit.approved') : t('visit.notApproved')}</Tag>
                  </div>
                  <ul className="space-y-1 text-[15px]">
                    {s.lines.map((l) => <li key={l}>{l}</li>)}
                    {s.priceItems.map((p) => (
                      <li key={p.label} className="flex justify-between gap-3 text-ink2">
                        <span>{p.label}</span>
                        <span dir="ltr">{money(p.priceOmr)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            {summary.totalOmr ? (
              <div className="mt-4 flex justify-between border-t border-line pt-3 font-semibold">
                <span>{t('visit.total')}</span>
                <span dir="ltr">{money(summary.totalOmr)}</span>
              </div>
            ) : null}
          </article>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" icon="print" busy={busy} onClick={pdf}>{t('visit.pdf')}</Button>
            <Button variant="secondary" icon="whatsapp" onClick={whatsapp}>{t('visit.whatsapp')}</Button>
          </div>
        </>
      )}
    </main>
  );
}
