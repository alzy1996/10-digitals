import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Button from '../components/Button.jsx';
import Chip, { ChipRow, Tag } from '../components/Chip.jsx';
import Slider from '../components/Slider.jsx';
import SwatchChip from '../components/SwatchChip.jsx';
import LightPill from '../components/LightPill.jsx';
import LevelLadder from '../components/LevelLadder.jsx';
import HairStage from '../components/HairStage.jsx';
import LiveMirror from '../components/LiveMirror.jsx';
import GreyJourney from '../components/GreyJourney.jsx';
import Icon from '../components/Icon.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useApp } from '../hooks/useApp.jsx';
import { useSession } from '../hooks/useSession.jsx';
import { useCatalog } from '../hooks/useCatalog.js';
import { useStageData } from '../hooks/useStage.js';
import { useConsultation } from '../hooks/useConsultation.js';
import { renderThumb } from '../hooks/useThumbs.js';
import { lookDrawParams, lowMaintenanceScore, shaylaPath, shadeLab, labToHex, levelLabOf, effectiveRootL } from '../ai/hair/index.js';
import finishes from '../data/finishes.json';

const FAMILIES = ['natural', 'brunette', 'cool', 'neutral', 'warm', 'red', 'metallic', 'pastel', 'vivid'];

export default function S09ColorLab() {
  const { t, name } = useT();
  const app = useApp();
  const session = useSession();
  const navigate = useNavigate();
  const catalog = useCatalog();
  const data = useStageData();
  const consultation = useConsultation();
  const stageRef = useRef(null);
  const look = session.look;
  const shade = catalog.shades.find((s) => s.id === look.shadeId);
  const [family, setFamily] = useState(shade?.family || 'brunette');
  const [weeks, setWeeks] = useState(0);
  const [hijab, setHijab] = useState(session.goals.visibleZone === 'front');
  const [mode, setMode] = useState('final'); // final | session1 | henna
  const [showMask, setShowMask] = useState(false);
  const [live, setLive] = useState(false);
  const [panel, setPanel] = useState('shade');
  const technique = catalog.techniques.find((x) => x.id === look.technique) || catalog.techniques.find((x) => x.id === 'global');
  const tp = { ...(technique?.params || {}), level: 0, ...(look.techniqueParams || {}) };
  const ctx = useMemo(
    () => ({ metallicTest: session.metallicTest, patchRequired: session.patchRequired, growthCmPerMonth: session.client?.growthCmPerMonth || app.settings?.growthCmPerMonth || 1.25 }),
    [session.metallicTest, session.patchRequired, session.client, app.settings],
  );

  const params = useMemo(() => {
    if (!data || !session.profile) return null;
    const p = lookDrawParams({
      look: { ...look, techniqueParams: tp, regrowthWeeks: weeks, hijab, mode, showMask },
      catalog,
      profile: session.profile,
      renderData: data.renderData,
      aux: data.aux,
      swatchesById: app.swatchesById,
      scannedLevels: app.scannedLevels,
      ctx,
    });
    if (tp.level && p.target && shade) {
      const lv = Math.max(1, Math.min(12, shade.level + tp.level));
      const base = levelLabOf(shade.level, app.scannedLevels);
      const dest = levelLabOf(lv, app.scannedLevels);
      const dL = dest[0] - base[0];
      p.target = [p.target[0] + dL, p.target[1], p.target[2]];
    }
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, session.profile, look, tp.level, tp.start, tp.density, tp.softness, weeks, hijab, mode, showMask, catalog, app.swatchesById, app.scannedLevels, ctx]);

  const plan = params?.plan;
  const hennaPure = session.history.henna === 'pure';

  // side-by-side "After session 1" and "Final" previews (only when more than one session)
  const sidePreviews = useMemo(() => {
    if (!data || !plan || plan.sessionsTotal < 2 || !params) return null;
    try {
      const base = { ...look, techniqueParams: tp, lightPreset: look.lightPreset };
      const mk = (m) => renderThumb(data, lookDrawParams({ look: { ...base, mode: m }, catalog, profile: session.profile, renderData: data.renderData, aux: data.aux, swatchesById: app.swatchesById, scannedLevels: app.scannedLevels, ctx }), 300);
      return { s1: mk('session1'), final: mk('final') };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.version, plan?.sessionsTotal, plan?.session1Level, look.shadeId, look.technique, look.lightPreset]);

  const lowMaint = useMemo(() => {
    if (!params?.target || !data) return null;
    const naturalL = effectiveRootL(data.renderData.zones.rootL, session.profile.hair.greyPct);
    const atRootL = ['root', 'shadow'].includes(technique?.mask) ? params.target2?.[0] ?? naturalL : ['balayage', 'foilyage', 'ombre', 'sombre', 'money', 'peekaboo', 'chroma', 'melt'].includes(technique?.mask) ? naturalL : params.target[0];
    return lowMaintenanceScore({ mask: technique?.mask, naturalL, colorL: atRootL });
  }, [params, data, technique, session.profile.hair.greyPct]);

  if (!data || !params) return null;

  const setTp = (k, v) => session.setLook({ techniqueParams: { ...tp, [k]: v } });
  const pickShade = (id) => {
    session.setLook({ shadeId: id });
    setMode('final');
    consultation.ensure();
  };
  const shades = catalog.shades.filter((s) => s.family === family);
  const sh = shaylaPath(data.renderData);
  const W = data.display.width;
  const H = data.display.height;
  const shade2Needed = technique?.needsSecondShade;
  const scanned = shade?.swatchRef ? app.swatchesById[shade.swatchRef] : null;

  const controls = (
    <div>
      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist">
        {['shade', 'technique', 'lift', 'regrowth', ...(session.profile.hair.greyPct >= 20 ? ['grey'] : [])].map((k) => (
          <Chip key={k} selected={panel === k} onClick={() => setPanel(k)} role="tab" aria-selected={panel === k}>
            {t(`color.panel.${k}`)}
          </Chip>
        ))}
      </div>

      {panel === 'shade' ? (
        <section>
          <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto pb-1">
            {FAMILIES.filter((f) => catalog.shades.some((s) => s.family === f)).map((f) => (
              <Chip key={f} selected={family === f} onClick={() => setFamily(f)}>
                {t(`family.${f}`)}
              </Chip>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 tablet:grid-cols-2 desk:grid-cols-3">
            {shades.map((s) => {
              const sc = s.swatchRef ? app.swatchesById[s.swatchRef] : null;
              const col = labToHex(shadeLab(s, app.swatchesById));
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pickShade(s.id)}
                  aria-pressed={look.shadeId === s.id}
                  className={`press flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-control border p-2 text-center ${look.shadeId === s.id ? 'border-plum bg-surface2' : 'border-line bg-surface'}`}
                >
                  <SwatchChip color={col} size={40} label={name(s.name)} selected={look.shadeId === s.id} />
                  <span className="text-[13px] leading-tight">{name(s.name)}</span>
                  <span className="num text-[11px] text-ink2">
                    {t('color.levelShort', { n: s.level })}
                    {sc ? ` · ${sc.code}` : ''}
                    {s.trend2026 ? ' · 2026' : ''}
                  </span>
                </button>
              );
            })}
          </div>
          {shade?.highUpkeep ? <p className="mt-3 text-sm text-warn">{t('color.highUpkeep')}</p> : null}
          <div className="mt-5">
            <ChipRow label={t('color.finish')} value={look.finish} onChange={(v) => session.setLook({ finish: v })} options={finishes.map((f) => ({ value: f.id, label: name(f.name) }))} />
          </div>
          {scanned ? <p className="text-xs text-ok">{t('color.scanned', { code: scanned.code })}</p> : <p className="text-xs text-ink2">{t('color.startingSwatch')}</p>}
        </section>
      ) : null}

      {panel === 'technique' ? (
        <section>
          <div className="mb-4 flex flex-wrap gap-2">
            {catalog.techniques.map((x) => (
              <Chip key={x.id} selected={look.technique === x.id} onClick={() => session.setLook({ technique: x.id, techniqueParams: null })}>
                {name(x.name)}
              </Chip>
            ))}
          </div>
          <p className="mb-4 text-sm text-ink2">{name(technique?.where)}</p>
          <Slider label={t('color.start')} value={tp.start ?? 0} min={0} max={0.8} step={0.01} onChange={(v) => setTp('start', v)} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label={t('color.density')} value={tp.density ?? 1} min={0.1} max={1} step={0.01} onChange={(v) => setTp('density', v)} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label={t('color.softness')} value={tp.softness ?? 0.3} min={0} max={1} step={0.01} onChange={(v) => setTp('softness', v)} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label={t('color.level')} value={tp.level ?? 0} min={-3} max={3} step={1} onChange={(v) => setTp('level', v)} format={(v) => (v > 0 ? `+${v}` : String(v))} />
          {shade2Needed ? (
            <div className="mb-4">
              <div className="label mb-2">{t('color.secondShade')}</div>
              <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                <Chip selected={!look.shade2Id} onClick={() => session.setLook({ shade2Id: null })}>{t('color.natural')}</Chip>
                {catalog.shades.map((s) => (
                  <button key={s.id} type="button" onClick={() => session.setLook({ shade2Id: s.id })} className={`press shrink-0 rounded-control border p-1 ${look.shade2Id === s.id ? 'border-plum' : 'border-line'}`} aria-label={name(s.name)}>
                    <SwatchChip color={labToHex(shadeLab(s, app.swatchesById))} size={40} label={name(s.name)} selected={look.shade2Id === s.id} />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <Chip selected={showMask} icon="eye" onClick={() => setShowMask((v) => !v)}>{t('color.showPlacement')}</Chip>
        </section>
      ) : null}

      {panel === 'lift' && plan ? (
        <section>
          <div className="flex gap-4">
            <LevelLadder now={{ root: session.profile.hair.rootLevel, ends: session.profile.hair.endsLevel }} session1={plan.sessionsTotal > 1 ? plan.session1Level : null} final={plan.targetLevel} swatches={app.scannedLevels ? Object.fromEntries(Object.entries(app.scannedLevels).map(([k, v]) => [k, labToHex(v)])) : null} height={300} />
            <div className="flex-1 space-y-2">
              <div>
                <div className="label">{t('lift.process')}</div>
                <div className="text-lg font-semibold">{t(`process.${plan.process}`)}</div>
              </div>
              <div>
                <div className="label">{t('lift.sessions')}</div>
                <div className={`num text-lg font-semibold ${plan.sessionsTotal > 1 ? 'text-warn' : plan.blocked ? 'text-risk' : 'text-ok'}`}>{plan.blocked ? t('lift.blocked') : plan.sessionsTotal}</div>
              </div>
              {plan.developerVolume ? <div className="text-sm text-ink2">{t('lift.developer', { vol: plan.developerVolume })}</div> : null}
              <div className="flex flex-wrap gap-1.5">
                {plan.tests.map((x) => (
                  <Tag key={x} tone="warn">{t(`test.${x}`)}</Tag>
                ))}
                {plan.fillerLikely ? <Tag tone="warn">{t('lift.filler')}</Tag> : null}
                {plan.needsNaturalTone ? <Tag tone="warn">{t('lift.naturalTone')}</Tag> : null}
              </div>
              {plan.blocked ? <p className="text-sm text-risk">{t(`block.${plan.blockReason}`)}</p> : null}
              {plan.warnings.includes('henna_copper') ? <p className="text-sm text-risk">{t('lift.hennaCopper')}</p> : null}
            </div>
          </div>
          {session.history.henna === 'compound' || session.history.henna === 'unsure' ? (
            <ChipRow label={t('lift.metallicTest')} value={session.metallicTest} onChange={(v) => session.patch({ metallicTest: v })} options={['not-done', 'negative', 'positive'].map((v) => ({ value: v, label: t(`metallic.${v}`) }))} />
          ) : null}
          {sidePreviews ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[['s1', 'lift.afterSession1'], ['final', 'lift.final']].map(([k, label]) => (
                <figure key={k} className="overflow-hidden rounded-control border border-line">
                  <img src={sidePreviews[k]} alt="" className="block aspect-[4/5] w-full object-cover" />
                  <figcaption className="p-2 text-center text-xs font-semibold">{t(label)}</figcaption>
                </figure>
              ))}
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Chip selected={mode === 'final'} onClick={() => setMode('final')}>{t('lift.final')}</Chip>
            {plan.sessionsTotal > 1 ? <Chip selected={mode === 'session1'} onClick={() => setMode('session1')}>{t('lift.afterSession1')}</Chip> : null}
            {hennaPure ? <Chip selected={mode === 'henna'} onClick={() => setMode('henna')}>{t('lift.hennaStage')}</Chip> : null}
          </div>
          <p className="mt-3 text-xs text-ink2">{t('lift.disclaimer')}</p>
        </section>
      ) : null}

      {panel === 'grey' ? (
        <GreyJourney
          data={data}
          catalog={catalog}
          profile={session.profile}
          ctx={ctx}
          swatchesById={app.swatchesById}
          scannedLevels={app.scannedLevels}
          onChoose={(c) => {
            session.setLook({ shadeId: c.shadeId, technique: c.technique, finish: c.finish, techniqueParams: c.techniqueParams || null });
            setWeeks(8);
            setPanel('regrowth');
          }}
        />
      ) : null}

      {panel === 'regrowth' ? (
        <section>
          <Slider label={t('regrowth.weeks')} value={weeks} min={0} max={12} step={4} onChange={setWeeks} format={(v) => t('regrowth.w', { n: v })} ticks={['0', '4', '8', '12']} />
          {lowMaint !== null ? (
            <div className="card p-4">
              <div className="label">{t('regrowth.score')}</div>
              <div className={`num font-display text-2xl ${lowMaint >= 70 ? 'text-ok' : lowMaint >= 45 ? 'text-warn' : 'text-risk'}`}>{lowMaint}/100</div>
              <p className="mt-1 text-sm text-ink2">{lowMaint >= 70 ? t('regrowth.soft') : t('regrowth.hard')}</p>
            </div>
          ) : null}
          <div className="mt-4">
            <Chip selected={hijab} icon="hijab" onClick={() => setHijab((v) => !v)}>{t('color.hijab')}</Chip>
            <p className="mt-2 text-xs text-ink2">{t('color.hijabNote')}</p>
          </div>
        </section>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-2">
        <Button variant="secondary" icon="scissors" onClick={() => navigate('/cut')}>{t('color.toCut')}</Button>
        <Button variant="secondary" icon="compare" onClick={() => {
          const entry = { key: `${look.cutId}~${look.shadeId}|${look.technique}`, cutId: look.cutId, fringeId: look.fringeId, shadeId: look.shadeId, technique: look.technique, techniqueParams: tp, finish: look.finish, title: [catalog.cuts.find((c) => c.id === look.cutId), shade].filter(Boolean).map((x) => name(x.name)).join(' · ') };
          session.patch({ compare: [...session.compare.filter((c) => c.key !== entry.key), entry].slice(-4) });
        }}>{t('looks.addCompare')}</Button>
        <Button variant="secondary" icon="camera" onClick={() => setLive(true)}>{t('color.live')}</Button>
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
          <Button icon="check" onClick={() => navigate('/agreement')}>{t('color.toAgreement')}</Button>
        )}
      </div>
    </div>
  );

  return (
    <main className="screen mx-auto max-w-[1280px]">
      <TopBar title={t('color.title')} step={t('flow.step', { n: 6, total: 7 })} />
      <div className="tablet:flex tablet:items-start tablet:gap-6">
        <div className="tablet:sticky tablet:top-20 tablet:w-[70%]">
          <HairStage ref={stageRef} data={data} params={params} className="max-h-[62dvh] tablet:max-h-[82dvh]" label={t('color.canvas')}>
            {hijab ? (
              <svg viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
                <g fill="none" stroke="var(--clay)" strokeWidth={Math.max(1.5, W / 400)} strokeLinecap="round" opacity="0.9">
                  <path d={sh.outer} />
                  <path d={sh.inner} strokeDasharray={`${W / 80} ${W / 120}`} />
                  <path d={sh.drape} strokeDasharray={`${W / 80} ${W / 120}`} />
                </g>
              </svg>
            ) : null}
            <div className="absolute inset-x-0 bottom-12 flex justify-center">
              <LightPill value={look.lightPreset} onChange={(v) => session.setLook({ lightPreset: v })} />
            </div>
            {mode !== 'final' ? (
              <span className="absolute bottom-3 rounded-full bg-surface px-3 py-1 text-xs font-semibold ltr:left-3 rtl:right-3">{mode === 'session1' ? t('lift.afterSession1') : t('lift.hennaStage')}</span>
            ) : null}
            {plan?.sessionsTotal > 1 && mode === 'final' ? (
              <span className="absolute bottom-3 rounded-full bg-surface px-3 py-1 text-xs font-semibold text-warn ltr:left-3 rtl:right-3">{t('looks.sessions', { n: plan.sessionsTotal })}</span>
            ) : null}
          </HairStage>
          <p className="mt-2 flex items-center justify-center gap-1 text-xs text-ink2">
            <Icon name="info" size={14} />
            {t('color.previewNote')}
          </p>
        </div>
        <div className="mt-4 tablet:mt-0 tablet:w-[30%]">{controls}</div>
      </div>
      {live ? <LiveMirror params={params} onClose={() => setLive(false)} /> : null}
    </main>
  );
}
