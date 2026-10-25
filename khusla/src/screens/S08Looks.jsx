import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Button from '../components/Button.jsx';
import Chip, { Tag } from '../components/Chip.jsx';
import Sheet from '../components/Sheet.jsx';
import LookCard from '../components/LookCard.jsx';
import Icon from '../components/Icon.jsx';
import { Empty } from '../components/States.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useApp } from '../hooks/useApp.jsx';
import { useSession } from '../hooks/useSession.jsx';
import { useCatalog } from '../hooks/useCatalog.js';
import { useStageData } from '../hooks/useStage.js';
import { useConsultation } from '../hooks/useConsultation.js';
import { renderThumb } from '../hooks/useThumbs.js';
import { recommend, lookDrawParams, silhouettePath } from '../ai/index.js';
import { FEATURES } from '../config/app.js';

function drawOutline(cut, rd) {
  if (!cut) return undefined;
  return (ctx, crop, k) => {
    const { outline, layers } = silhouettePath(cut, rd);
    ctx.save();
    ctx.translate(-crop.x * k, -crop.y * k);
    ctx.scale(k, k);
    ctx.setLineDash([10 / k, 7 / k]);
    ctx.lineWidth = 2.2 / k;
    ctx.strokeStyle = 'rgba(251,248,244,0.92)';
    ctx.stroke(new Path2D(outline));
    ctx.strokeStyle = 'rgba(183,110,98,0.95)';
    ctx.lineWidth = 1.4 / k;
    if (layers) ctx.stroke(new Path2D(layers));
    ctx.restore();
  };
}

export default function S08Looks() {
  const { t, name } = useT();
  const app = useApp();
  const session = useSession();
  const navigate = useNavigate();
  const catalog = useCatalog();
  const data = useStageData();
  const consultation = useConsultation();
  const [tab, setTab] = useState('looks');
  const [thumbs, setThumbs] = useState({});
  const [nt, setNt] = useState(false);
  const ctx = useMemo(() => ({ metallicTest: session.metallicTest, patchRequired: session.patchRequired }), [session.metallicTest, session.patchRequired]);

  const rec = useMemo(() => (session.profile ? recommend(catalog, session.profile, session.goals, ctx) : null), [catalog, session.profile, session.goals, ctx]);

  useEffect(() => {
    if (rec && rec.notToday.length !== session.notTodayShown) session.patch({ notTodayShown: rec.notToday.length });
  }, [rec, session]);

  const items = useMemo(() => {
    if (!rec) return [];
    if (tab === 'looks') {
      return rec.looks.map((lk) => ({
        key: lk.id,
        cut: lk.cut?.cut || null,
        fringe: lk.cut?.fringe || null,
        shadeId: lk.color?.shadeId || null,
        technique: lk.color?.techniqueId || null,
        score: lk.score,
        reasons: lk.reasons,
        plan: lk.color?.plan || null,
        bigChange: lk.cut?.bigChange,
      }));
    }
    if (tab === 'cuts') return rec.cuts.slice(0, 12).map((c) => ({ key: c.id, cut: c.cut, fringe: c.fringe, score: c.score, reasons: c.reasons, bigChange: c.bigChange }));
    return rec.colors.slice(0, 12).map((c) => ({ key: c.id, shadeId: c.shadeId, technique: c.techniqueId, score: c.score, reasons: c.reasons, plan: c.plan }));
  }, [rec, tab]);

  // render thumbnails progressively so the screen stays responsive
  useEffect(() => {
    if (!data || !items.length) return undefined;
    let cancelled = false;
    let i = 0;
    const next = () => {
      if (cancelled || i >= items.length) return;
      const it = items[i];
      i += 1;
      const key = `${tab}:${it.key}:${data.version}`;
      if (!thumbs[key]) {
        try {
          const params = it.shadeId
            ? lookDrawParams({ look: { shadeId: it.shadeId, technique: it.technique, finish: 'satin', lightPreset: 'daylight' }, catalog, profile: session.profile, renderData: data.renderData, aux: data.aux, swatchesById: app.swatchesById, scannedLevels: app.scannedLevels, ctx })
            : { tech: 0 };
          const url = renderThumb(data, params, 420, drawOutline(it.cut, data.renderData));
          setThumbs((m) => ({ ...m, [key]: url }));
        } catch {
          // keep the card without a preview
        }
      }
      setTimeout(next, 0);
    };
    next();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, data?.version]);

  if (!rec) return null;

  const choose = (it) => {
    const look = {
      cutId: it.cut?.id || session.look.cutId,
      fringeId: it.fringe?.id || session.look.fringeId || 'none',
      shadeId: it.shadeId ?? session.look.shadeId,
      technique: it.technique || session.look.technique || 'global',
      techniqueParams: null,
    };
    session.setLook(look);
    consultation.ensure({ params: { ...session.look, ...look } });
    navigate(it.shadeId || session.goals.change === 'color' ? '/color' : '/cut');
  };

  const shadeName = (id) => name(catalog.shades.find((s) => s.id === id)?.name);
  const techName = (id) => name(catalog.techniques.find((x) => x.id === id)?.name);
  const titleOf = (it) => {
    const parts = [];
    if (it.cut) parts.push(name(it.cut.name));
    if (it.shadeId) parts.push(shadeName(it.shadeId));
    return parts.join(' · ') || t('looks.keep');
  };

  const showStyles = session.goals.change === 'style';

  return (
    <main className="screen mx-auto max-w-[1100px]">
      <TopBar title={t('looks.title')} step={t('flow.step', { n: 5, total: 7 })} right={session.compare.length ? <Tag tone="plum">{session.compare.length}/4</Tag> : null} />
      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto" role="tablist">
        {['looks', 'cuts', 'colors'].map((k) => (
          <Chip key={k} selected={tab === k} onClick={() => setTab(k)} role="tab" aria-selected={tab === k}>
            {t(`looks.tab.${k}`)}
          </Chip>
        ))}
        {rec.notToday.length ? (
          <Chip tone="warn" icon="alert" onClick={() => setNt(true)}>
            {t('looks.notToday', { n: rec.notToday.length })}
          </Chip>
        ) : null}
      </div>

      {showStyles && tab === 'looks' ? (
        <section className="mb-6">
          <h2 className="mb-2 text-lg">{t('looks.styles')}</h2>
          <p className="mb-3 text-sm text-ink2">{FEATURES.aiPreview || app.settings?.aiPreview ? t('looks.stylesAi') : t('looks.stylesNoAi')}</p>
          <div className="grid grid-cols-2 gap-3 tablet:grid-cols-4">
            {catalog.styles.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => { session.setLook({ styleId: st.id }); navigate(app.settings?.aiPreview && session.mode === 'chair' ? '/ai/consent' : '/agreement'); }}
                className={`press card p-4 text-start ${session.look.styleId === st.id ? 'outline outline-2 outline-plum' : ''}`}
              >
                <Icon name="comb" className="text-clay" />
                <div className="mt-2 font-display text-lg leading-tight">{name(st.name)}</div>
                <div className="mt-1 text-xs text-ink2">{st.occasions.map((o) => t(`occasion.${o}`)).join(' · ')}</div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {items.length ? (
        <div className="grid grid-cols-2 gap-3 tablet:grid-cols-3 desk:grid-cols-4">
          {items.map((it) => (
            <div key={it.key} className="relative">
              <LookCard
                src={thumbs[`${tab}:${it.key}:${data?.version}`]}
                title={titleOf(it)}
                subtitle={[it.fringe && it.fringe.id !== 'none' ? name(it.fringe.name) : null, it.technique ? techName(it.technique) : null].filter(Boolean).join(' · ')}
                reasons={it.reasons}
                score={it.score}
                badge={it.bigChange ? t('looks.bigChange') : it.plan?.sessionsTotal > 1 ? t('looks.sessions', { n: it.plan.sessionsTotal }) : null}
                onClick={() => choose(it)}
              />
              <button
                type="button"
                aria-label={t('looks.addCompare')}
                onClick={() => {
                  const entry = { key: it.key, cutId: it.cut?.id || null, fringeId: it.fringe?.id || 'none', shadeId: it.shadeId, technique: it.technique, title: titleOf(it) };
                  session.patch({ compare: session.compare.some((c) => c.key === it.key) ? session.compare.filter((c) => c.key !== it.key) : [...session.compare, entry].slice(-4) });
                }}
                className={`press absolute top-2 grid min-h-tap min-w-tap place-items-center rounded-full ltr:right-2 rtl:left-2 ${session.compare.some((c) => c.key === it.key) ? 'bg-plum text-onplum' : 'bg-surface/90 text-ink'}`}
              >
                <Icon name={session.compare.some((c) => c.key === it.key) ? 'check' : 'compare'} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Empty icon="wand" title={t('looks.empty')} body={t('looks.emptyBody')} />
      )}

      <div className="sticky bottom-0 mt-6 grid grid-cols-2 gap-3 bg-bg/95 py-3">
        <Button variant="secondary" icon="compare" disabled={session.compare.length < 2} onClick={() => navigate('/compare')}>
          {t('looks.compare')}
        </Button>
        <Button icon="drop" onClick={() => navigate(session.goals.change === 'cut' ? '/cut' : '/color')}>
          {session.goals.change === 'cut' ? t('looks.openCut') : t('looks.openColor')}
        </Button>
      </div>

      <Sheet open={nt} modal onClose={() => setNt(false)} title={t('looks.notTodayTitle')}>
        <ul className="max-h-[60vh] space-y-3 overflow-y-auto pb-2">
          {rec.notToday.map((n) => (
            <li key={n.id} className="card p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">{shadeName(n.shadeId)}</div>
                <Tag tone="risk">{n.blocked ? t('looks.blocked') : t('looks.sessions', { n: n.plan.sessionsTotal })}</Tag>
              </div>
              <p className="mt-1 text-sm text-ink2">{n.blocked ? t(`block.${n.plan.blockReason}`) : t('safe.sessions', { n: n.plan.sessionsTotal, level: n.plan.session1Level })}</p>
              {n.alternative ? (
                <Button
                  variant="secondary"
                  className="mt-3"
                  iconEnd="chevron"
                  onClick={() => {
                    setNt(false);
                    choose({ shadeId: n.alternative.shadeId, technique: n.alternative.techniqueId });
                  }}
                >
                  {t('looks.startWith', { shade: shadeName(n.alternative.shadeId), technique: techName(n.alternative.techniqueId) })}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </Sheet>
    </main>
  );
}
