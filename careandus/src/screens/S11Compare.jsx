import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Button from '../components/Button.jsx';
import LightPill from '../components/LightPill.jsx';
import Icon from '../components/Icon.jsx';
import { Empty } from '../components/States.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useApp } from '../hooks/useApp.jsx';
import { useSession } from '../hooks/useSession.jsx';
import { useCatalog } from '../hooks/useCatalog.js';
import { useStageData } from '../hooks/useStage.js';
import { renderThumb } from '../hooks/useThumbs.js';
import { lookDrawParams, silhouettePath } from '../ai/hair/index.js';

export default function S11Compare() {
  const { t } = useT();
  const app = useApp();
  const session = useSession();
  const navigate = useNavigate();
  const catalog = useCatalog();
  const data = useStageData();
  const [light, setLight] = useState(session.look.lightPreset || 'daylight');
  const [open, setOpen] = useState(null);
  const [imgs, setImgs] = useState({});
  const startX = useRef(null);
  const list = session.compare;

  useEffect(() => {
    if (!data) return;
    const out = {};
    for (const c of list) {
      const params = c.shadeId
        ? lookDrawParams({ look: { ...c, lightPreset: light }, catalog, profile: session.profile, renderData: data.renderData, aux: data.aux, swatchesById: app.swatchesById, scannedLevels: app.scannedLevels, ctx: { metallicTest: session.metallicTest } })
        : { tech: 0, light: lookDrawParams({ look: { lightPreset: light }, catalog, profile: session.profile, renderData: data.renderData, aux: data.aux }).light };
      const cut = catalog.cuts.find((x) => x.id === c.cutId);
      out[c.key] = renderThumb(data, params, 720, cut ? (ctx, crop, k) => {
        ctx.save();
        ctx.translate(-crop.x * k, -crop.y * k);
        ctx.scale(k, k);
        ctx.setLineDash([12 / k, 8 / k]);
        ctx.lineWidth = 2 / k;
        ctx.strokeStyle = 'rgba(251,248,244,.9)';
        ctx.stroke(new Path2D(silhouettePath(cut, data.renderData).outline));
        ctx.restore();
      } : undefined);
    }
    setImgs(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.version, list, light]);

  const idx = useMemo(() => list.findIndex((c) => c.key === open), [list, open]);
  if (!list.length) {
    return (
      <main className="screen mx-auto max-w-[720px]">
        <TopBar title={t('compare.title')} />
        <Empty icon="compare" title={t('compare.empty')} body={t('compare.emptyBody')} action={<Button onClick={() => navigate('/looks')}>{t('color.backLooks')}</Button>} />
      </main>
    );
  }
  const go = (d) => setOpen(list[(idx + d + list.length) % list.length].key);

  return (
    <main className="screen mx-auto max-w-[1280px]">
      <TopBar title={t('compare.title')} />
      <div className="mb-4 flex justify-center">
        <LightPill value={light} onChange={setLight} />
      </div>
      <div className="grid grid-cols-2 gap-3 tablet:grid-cols-4">
        {list.map((c) => (
          <figure key={c.key} className="card overflow-hidden">
            <button type="button" className="press block w-full" onClick={() => setOpen(c.key)} aria-label={c.title}>
              {imgs[c.key] ? <img src={imgs[c.key]} alt="" className="block aspect-[4/5] w-full object-cover" /> : <div className="aspect-[4/5] bg-surface2" />}
            </button>
            <figcaption className="flex items-center gap-2 p-3">
              <span className="flex-1 text-sm font-medium leading-tight">{c.title}</span>
              <button type="button" className="press grid min-h-tap min-w-tap place-items-center rounded-full" aria-label={t('common.remove')} onClick={() => session.patch({ compare: list.filter((x) => x.key !== c.key) })}>
                <Icon name="close" size={20} />
              </button>
            </figcaption>
            <div className="px-3 pb-3">
              <Button variant="secondary" onClick={() => { session.setLook({ cutId: c.cutId, fringeId: c.fringeId, shadeId: c.shadeId, technique: c.technique || 'global', techniqueParams: c.techniqueParams || null, finish: c.finish || session.look.finish, lightPreset: light }); navigate('/color'); }}>
                {t('compare.choose')}
              </Button>
            </div>
          </figure>
        ))}
      </div>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-ink"
          onPointerDown={(e) => { startX.current = e.clientX; }}
          onPointerUp={(e) => {
            if (startX.current === null) return;
            const dx = e.clientX - startX.current;
            startX.current = null;
            if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
          }}
        >
          <div className="flex items-center justify-between p-3 text-bg">
            <span className="font-semibold">{list[idx]?.title}</span>
            <button type="button" className="press grid min-h-tap min-w-tap place-items-center rounded-full" onClick={() => setOpen(null)} aria-label={t('common.close')}>
              <Icon name="close" />
            </button>
          </div>
          <img src={imgs[open]} alt="" className="mx-auto max-h-[80dvh] w-auto max-w-full object-contain" />
          <div className="mt-auto flex justify-center gap-3 p-4">
            <Button full={false} variant="secondary" icon="back" onClick={() => go(-1)}>{t('common.prev')}</Button>
            <Button full={false} variant="secondary" iconEnd="chevron" onClick={() => go(1)}>{t('common.next')}</Button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
