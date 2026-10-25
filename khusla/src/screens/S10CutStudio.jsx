import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Button from '../components/Button.jsx';
import Chip, { Tag } from '../components/Chip.jsx';
import HairStage from '../components/HairStage.jsx';
import LengthTape from '../components/LengthTape.jsx';
import Slider from '../components/Slider.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useApp } from '../hooks/useApp.jsx';
import { useSession } from '../hooks/useSession.jsx';
import { useCatalog } from '../hooks/useCatalog.js';
import { useStageData } from '../hooks/useStage.js';
import { useConsultation } from '../hooks/useConsultation.js';
import { useSnackbar } from '../components/Snackbar.jsx';
import {
  lookDrawParams,
  recommend,
  silhouettePath,
  drawFringe,
  dryLength,
  shrinkageFor,
  newLengthFromY,
  yFromNewLength,
  cutTargetCm,
  quickShorten,
  roundLengthCm,
  applyOverride,
} from '../ai/index.js';
import Icon from '../components/Icon.jsx';
import { formatCm } from '../lib/format.js';

export default function S10CutStudio() {
  const { t, lang, name } = useT();
  const app = useApp();
  const session = useSession();
  const navigate = useNavigate();
  const snack = useSnackbar();
  const catalog = useCatalog();
  const data = useStageData();
  const consultation = useConsultation();
  const fringeRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const look = session.look;
  const profile = session.profile;
  const rd = data?.renderData;
  const mmPerPx = profile?.scale.mmPerPx || (rd ? 300 / rd.height : 0.3);
  const currentCm = profile?.hair.lengthCm ?? 30;
  const tipY = rd?.tipY || (rd ? rd.height * 0.9 : 0);
  const shrinkPct = shrinkageFor(profile?.hair.texture, session.client?.shrinkagePct);
  const [shrink, setShrink] = useState(shrinkPct);

  const ranked = useMemo(() => (profile ? recommend(catalog, profile, { ...session.goals, change: 'cut' }, {}).cuts : []), [catalog, profile, session.goals]);
  const cut = catalog.cuts.find((c) => c.id === look.cutId) || ranked[0]?.cut || null;
  const fringe = catalog.fringes.find((f) => f.id === look.fringeId) || null;
  const newCm = look.lengthCm ?? Math.min(currentCm, cut ? cutTargetCm(cut, currentCm) : currentCm);
  const lineY = rd ? Math.max(rd.hairlineY || 0, Math.min(rd.height - 2, yFromNewLength({ newCm, tipY, currentCm, mmPerPx }))) : 0;

  useEffect(() => {
    if (cut && !look.cutId) session.setLook({ cutId: cut.id });
  }, [cut, look.cutId, session]);

  const params = useMemo(() => {
    if (!data || !profile) return null;
    if (!look.shadeId) return { tech: 0, light: undefined };
    return lookDrawParams({ look, catalog, profile, renderData: rd, aux: data.aux, swatchesById: app.swatchesById, scannedLevels: app.scannedLevels, ctx: { metallicTest: session.metallicTest } });
  }, [data, profile, look, catalog, rd, app.swatchesById, app.scannedLevels, session.metallicTest]);

  useEffect(() => {
    if (!fringeRef.current || !rd) return;
    const c = fringeRef.current;
    c.width = rd.width;
    c.height = rd.height;
    const hairLab = params?.target || [rd.zones.midL, rd.zones.midLab[1], rd.zones.midLab[2]];
    drawFringe(c, fringe, rd, hairLab);
  }, [fringe, rd, params]);

  if (!data || !profile) return null;

  const setLine = (y) => {
    const { newCm: n } = newLengthFromY({ y: Math.max(rd.hairlineY || 0, Math.min(tipY, y)), tipY, currentCm, mmPerPx });
    session.setLook({ lengthCm: Math.max(2, n) });
  };
  const deltaCm = roundLengthCm(newCm - currentCm);
  const dryCm = dryLength(newCm, shrink);
  const sil = cut ? silhouettePath(cut, rd, lineY) : null;
  const W = rd.width;
  const H = rd.height;
  const big = currentCm - newCm > 15;
  // Quick shorten only removes hair hanging below the chin; shorter cuts reveal face and ears
  const belowChin = lineY > rd.pts[152][1];

  const shorten = async () => {
    setBusy(true);
    try {
      const a = session.heavy.analysis;
      const res = await quickShorten(a.display, a.renderData.alpha, a.aux.aux3, lineY, 10 / mmPerPx);
      const aux1 = Uint8Array.from(a.aux.aux1);
      for (let i = 0; i < res.alpha.length; i += 1) aux1[i * 4] = Math.round(Math.max(0, Math.min(1, res.alpha[i])) * 255);
      session.setHeavy('shortened', { data: res.data, aux1, method: res.method, lineY });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="screen mx-auto max-w-[1280px]">
      <TopBar title={t('cut.title')} step={t('flow.step', { n: 6, total: 7 })} />
      <div className="tablet:flex tablet:items-start tablet:gap-6">
        <div className="tablet:sticky tablet:top-20 tablet:w-[70%]">
          <HairStage data={data} params={params} className="max-h-[62dvh] tablet:max-h-[82dvh]" label={t('cut.canvas')}>
            <canvas ref={fringeRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
            {sil ? (
              <svg viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
                <path d={sil.outline} fill="none" stroke="rgba(251,248,244,.92)" strokeWidth={Math.max(1.5, W / 360)} strokeDasharray={`${W / 70} ${W / 110}`} />
                {sil.layers ? <path d={sil.layers} fill="none" stroke="var(--clay)" strokeWidth={Math.max(1, W / 500)} /> : null}
              </svg>
            ) : null}
            <LengthTape imgW={W} imgH={H} y={lineY} onChange={setLine} mmPerPx={mmPerPx} deltaCm={deltaCm} dryCm={dryCm} newCm={newCm} x0={W * 0.12} x1={W * 0.88} />
            {data.shortened ? <span className="absolute top-3 rounded-full bg-surface px-3 py-1 text-xs font-semibold ltr:left-3 rtl:right-3">{t('cut.quickPreview')}</span> : null}
          </HairStage>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="card p-3">
              <div className="label">{t('cut.now')}</div>
              <div className="num text-lg font-semibold">≈ {formatCm(currentCm, lang)}</div>
            </div>
            <div className="card p-3">
              <div className="label">{t('cut.new')}</div>
              <div className="num text-lg font-semibold text-plum">{formatCm(newCm, lang)}</div>
              <div className="num text-xs text-ink2">{deltaCm <= 0 ? '−' : '+'}{formatCm(Math.abs(deltaCm), lang)}</div>
            </div>
            <div className="card p-3">
              <div className="label">{t('cut.dry')}</div>
              <div className="num text-lg font-semibold">≈ {formatCm(dryCm, lang)}</div>
              <div className="num text-xs text-ink2">{t('cut.shrinkShort', { pct: shrink })}</div>
            </div>
          </div>
          {big ? <p className="mt-2 text-center text-sm text-warn">{t('cut.bigChange')}</p> : null}
          {!profile.scale.mmPerPx ? <p className="mt-2 text-center text-sm text-warn">{t('cut.noScale')}</p> : null}
        </div>

        <div className="mt-5 tablet:mt-0 tablet:w-[30%]">
          <div className="card mb-4 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="label">{t('cut.currentLength')}</span>
              <div className="flex items-center gap-2">
                <button type="button" aria-label="−" className="press grid min-h-tap min-w-tap place-items-center rounded-full border border-line" onClick={() => session.patch({ profile: applyOverride(profile, 'hair.lengthCm', Math.max(2, currentCm - 1)) })}>
                  <Icon name="minus" />
                </button>
                <span className="num min-w-[64px] text-center font-semibold">{formatCm(currentCm, lang)}</span>
                <button type="button" aria-label="+" className="press grid min-h-tap min-w-tap place-items-center rounded-full border border-line" onClick={() => session.patch({ profile: applyOverride(profile, 'hair.lengthCm', Math.min(120, currentCm + 1)) })}>
                  <Icon name="plus" />
                </button>
              </div>
            </div>
            {currentCm < 12 ? <p className="mt-2 text-xs text-warn">{t('cut.tiedBack')}</p> : null}
          </div>
          <h2 className="mb-2 text-lg">{t('cut.cuts')}</h2>
          <div className="no-scrollbar mb-4 flex max-h-[38vh] flex-wrap gap-2 overflow-y-auto">
            {ranked.slice(0, 16).map((r) => (
              <Chip
                key={r.id}
                selected={cut?.id === r.id}
                onClick={() => {
                  session.setLook({ cutId: r.id, lengthCm: Math.min(currentCm, r.targetCm), fringeId: r.fringe?.id || look.fringeId });
                  consultation.ensure();
                }}
              >
                {name(r.cut.name)}
                {r.cut.trend2026 ? <span className="text-xs opacity-70"> 2026</span> : null}
              </Chip>
            ))}
          </div>
          {cut ? (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {(ranked.find((r) => r.id === cut.id)?.reasons || []).map((r) => (
                <Tag key={r.key}>{name(r.text)}</Tag>
              ))}
              <Tag>{t('cut.trim', { n: cut.trimWeeks })}</Tag>
            </div>
          ) : null}
          <h2 className="mb-2 text-lg">{t('cut.fringe')}</h2>
          <div className="mb-5 flex flex-wrap gap-2">
            {catalog.fringes.map((f) => (
              <Chip key={f.id} selected={(look.fringeId || 'none') === f.id} onClick={() => session.setLook({ fringeId: f.id })}>
                {name(f.name)}
              </Chip>
            ))}
          </div>
          <Slider label={t('cut.shrinkage')} value={shrink} min={0} max={75} step={5} onChange={setShrink} format={(v) => `${v}%`} />
          <p className="-mt-3 mb-4 text-xs text-ink2">{t('cut.shrinkNote')}</p>
          {data.shortened ? (
            <Button variant="secondary" icon="undo" onClick={() => { session.setHeavy('shortened', null); snack.show({ message: t('cut.shortenUndone') }); }}>
              {t('cut.undoShorten')}
            </Button>
          ) : (
            <Button variant="secondary" icon="scissors" busy={busy} onClick={shorten} disabled={newCm >= currentCm || !belowChin}>
              {t('cut.quickShorten')}
            </Button>
          )}
          <p className="mt-2 text-xs text-ink2">{belowChin ? t('cut.quickNote') : t('cut.quickAboveChin')}</p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button variant="secondary" icon="drop" onClick={() => navigate('/color')}>{t('cut.toColor')}</Button>
            {app.settings?.aiPreview && session.mode === 'chair' ? (
              <Button variant="secondary" icon="wand" onClick={() => navigate('/ai/consent')}>{t('ai.button')}</Button>
            ) : (
              <Button variant="secondary" icon="grid" onClick={() => navigate('/looks')}>{t('color.backLooks')}</Button>
            )}
          </div>
          <div className="mt-3">
            {session.mode === 'home' ? (
              <Button icon="qr" onClick={() => navigate(`/t/${session.salonId}/code`)}>{t('home.getCode')}</Button>
            ) : (
              <Button icon="check" onClick={() => { session.patch({ shrinkPct: shrink }); navigate('/agreement'); }}>{t('color.toAgreement')}</Button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
