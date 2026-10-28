import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Button from '../components/Button.jsx';
import { ErrorBox, Steps } from '../components/States.jsx';
import { useT, translate } from '../lib/i18n/useT.js';
import { useApp } from '../hooks/useApp.jsx';
import { useSession } from '../hooks/useSession.jsx';
import { useCatalog } from '../hooks/useCatalog.js';
import { useStageData } from '../hooks/useStage.js';
import { renderFull } from '../hooks/useThumbs.js';
import { markAiUsed } from '../services/consultations.js';
import { getProvider, cropForAi, lookDrawParams, silhouettePath, drawFringe, imgToCanvas } from '../ai/hair/index.js';

export default function S13AiLook() {
  const { t, name } = useT();
  const app = useApp();
  const session = useSession();
  const navigate = useNavigate();
  const loc = useLocation();
  const catalog = useCatalog();
  const data = useStageData();
  const [state, setState] = useState('idle');
  const [result, setResult] = useState(session.heavy.aiResult);
  const [quota, setQuota] = useState(null);
  const ran = useRef(null);
  const provider = getProvider({ enabled: Boolean(app.settings?.aiPreview), workerUrl: import.meta.env.VITE_AI_WORKER_URL });

  useEffect(() => {
    provider.quota?.(app.salonId).then(setQuota).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const go = loc.state?.go;
    if (!go || ran.current === go || !data) return;
    ran.current = go;
    (async () => {
      setState('rendering');
      try {
        const rd = data.renderData;
        const src = imgToCanvas(data.display);
        const params = session.look.shadeId
          ? lookDrawParams({ look: session.look, catalog, profile: session.profile, renderData: rd, aux: data.aux, swatchesById: app.swatchesById, scannedLevels: app.scannedLevels })
          : { tech: 0 };
        const guide = renderFull(data, params);
        const g = guide.getContext('2d');
        const cut = catalog.cuts.find((c) => c.id === session.look.cutId);
        if (cut) {
          g.setLineDash([]);
          g.lineWidth = Math.max(3, rd.width / 220);
          g.strokeStyle = 'rgba(251,248,244,.95)';
          g.stroke(new Path2D(silhouettePath(cut, rd).outline));
        }
        const fringe = catalog.fringes.find((f) => f.id === session.look.fringeId);
        if (fringe && fringe.id !== 'none') {
          const fc = document.createElement('canvas');
          fc.width = rd.width;
          fc.height = rd.height;
          drawFringe(fc, fringe, rd, params.target || [rd.zones.midL, rd.zones.midLab[1], rd.zones.midLab[2]]);
          g.drawImage(fc, 0, 0);
        }
        const source = await cropForAi(src, rd);
        const guideJ = await cropForAi(guide, rd);
        const style = catalog.styles.find((s) => s.id === session.look.styleId);
        const res = await provider.render({
          salonId: app.salonId,
          sourceJpeg: source.blob,
          guideJpeg: guideJ.blob,
          seed: Math.floor(Math.random() * 1e9),
          style: style ? { name: style.name.en, desc: style.occasions.join(', ') } : undefined,
        });
        const url = URL.createObjectURL(res.blob);
        const r = { url, blob: res.blob };
        session.setHeavy('aiResult', r);
        setResult(r);
        if (res.quota) setQuota(res.quota);
        session.patch({ aiUses: session.aiUses + 1 });
        if (session.consultationId) markAiUsed(app.salonId, { id: session.consultationId, dayKey: undefined, demo: false });
        setState('done');
      } catch (e) {
        setState(e.code === 'cap' ? 'cap' : e.code === 'ai_off' ? 'off' : 'error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.state, data]);

  const share = async () => {
    if (!result) return;
    const file = new File([result.blob], 'careandus-ai-preview.jpg', { type: result.blob.type || 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: t('ai.label') }).catch(() => {});
    }
  };

  return (
    <main className="screen mx-auto max-w-[720px]">
      <TopBar title={t('ai.title')} right={quota ? <span className="num text-xs text-ink2">{t('ai.quota', { used: quota.used, cap: quota.cap })}</span> : null} />
      {state === 'rendering' ? <Steps items={[{ key: 'r', label: t('ai.rendering'), state: 'doing' }]} /> : null}
      {state === 'cap' ? (
        <ErrorBox title={translate('ar', 'ai.cap')} body={translate('en', 'ai.cap')} action={<Button variant="secondary" onClick={() => navigate('/color')}>{t('color.title')}</Button>} />
      ) : null}
      {state === 'off' ? <ErrorBox title={t('ai.off')} /> : null}
      {state === 'error' ? <ErrorBox title={t('ai.error')} body={t('ai.errorBody')} /> : null}
      {result ? (
        <figure className="card overflow-hidden">
          <div className="relative">
            <img src={result.url} alt={t('ai.label')} className="block w-full" />
            <span className="absolute top-3 rounded-full bg-surface px-3 py-1 text-xs font-semibold ltr:left-3 rtl:right-3">{t('ai.label')}</span>
          </div>
          <figcaption className="p-4 text-sm text-ink2">{t('ai.caption', { look: [catalog.cuts.find((c) => c.id === session.look.cutId), catalog.shades.find((s) => s.id === session.look.shadeId)].filter(Boolean).map((x) => name(x.name)).join(' · ') })}</figcaption>
        </figure>
      ) : null}
      <div className="mt-5 space-y-3">
        {result ? <Button variant="secondary" icon="share" onClick={share}>{t('ai.shareHer')}</Button> : null}
        {state !== 'rendering' ? <Button variant="secondary" icon="wand" onClick={() => navigate('/ai/consent')}>{t('ai.another')}</Button> : null}
        <Button icon="check" onClick={() => navigate('/agreement')}>{t('color.toAgreement')}</Button>
        <Button variant="ghost" onClick={() => navigate('/color')}>{t('color.title')}</Button>
      </div>
      <p className="mt-4 text-xs text-ink2">{t('ai.notSaved')}</p>
    </main>
  );
}
