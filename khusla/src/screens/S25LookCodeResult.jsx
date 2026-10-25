import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Button from '../components/Button.jsx';
import { ErrorBox, Steps } from '../components/States.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useSession } from '../hooks/useSession.jsx';
import { useOnline } from '../hooks/useOnline.js';
import { createLookCode } from '../services/lookCodes.js';
import { whatsappLink } from '../reports/agreementCardPdf.js';
import { formatDate } from '../lib/time.js';

export default function S25LookCodeResult() {
  const { salonId } = useParams();
  const { t, lang, name } = useT();
  const session = useSession();
  const navigate = useNavigate();
  const online = useOnline();
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const started = useRef(false);

  useEffect(() => {
    if (!session.active || started.current || !online) return;
    started.current = true;
    createLookCode(salonId, session.look)
      .then((r) => {
        setRes(r);
        session.patch({ lookCode: r.code });
      })
      .catch((e) => setErr(e.code || 'error'));
  }, [salonId, session, online]);

  if (!session.active) {
    return (
      <main className="screen mx-auto max-w-[560px]">
        <TopBar title={t('home.codeTitle')} back={false} />
        <Button onClick={() => navigate(`/t/${salonId}`)}>{t('home.start')}</Button>
      </main>
    );
  }

  const salon = session.salonPublic;
  const cut = session.catalog?.cuts.find((c) => c.id === session.look.cutId);
  const shade = session.catalog?.shades.find((s) => s.id === session.look.shadeId);
  const text = res
    ? t('home.waText', { code: res.code, look: [cut, shade].filter(Boolean).map((x) => name(x.name)).join(' · ') || '—' })
    : '';

  return (
    <main className="screen mx-auto max-w-[560px]">
      <TopBar title={t('home.codeTitle')} />
      {!online ? <ErrorBox title={t('home.codeOffline')} /> : null}
      {!res && !err && online ? <Steps items={[{ key: 'c', label: t('home.codeMaking'), state: 'doing' }]} /> : null}
      {err ? <ErrorBox title={t('home.codeError')} body={t('home.codeErrorBody')} action={<Button variant="secondary" onClick={() => { started.current = false; setErr(null); }}>{t('common.retry')}</Button>} /> : null}
      {res ? (
        <section className="card p-6 text-center">
          <div className="eyebrow">{t('home.yourCode')}</div>
          <div className="num mt-3 font-display text-[48px] tracking-[0.18em]" dir="ltr">{res.code}</div>
          <p className="mt-2 text-sm text-ink2">{t('home.codeExpires', { date: formatDate(res.expiresAt, lang) })}</p>
          <p className="mt-4 text-sm">{t('home.codeHow')}</p>
          <p className="mt-2 text-xs text-ink2">{t('home.codeNoPhoto')}</p>
        </section>
      ) : null}
      {res ? (
        <div className="mt-5 space-y-3">
          {salon?.whatsapp ? (
            <Button icon="whatsapp" onClick={() => window.open(whatsappLink(salon.whatsapp, text), '_blank', 'noopener')}>{t('home.bookWa')}</Button>
          ) : null}
          <Button variant="secondary" icon="share" onClick={async () => { try { await navigator.clipboard.writeText(text); } catch { /* manual copy */ } }}>{t('home.copyCode')}</Button>
          <Button variant="ghost" icon="trash" onClick={async () => { await session.wipe(); navigate(`/t/${salonId}`, { replace: true }); }}>{t('home.finishWipe')}</Button>
        </div>
      ) : null}
    </main>
  );
}
