// AI match (from Nail Mirror): skin depth + undertone + hand proportions -> ranked shades, finishes and shapes.
// Everything runs on the device; nothing from this sheet is stored except what the stylist approves.
import { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import Button from '../../components/Button.jsx';
import Chip from '../../components/Chip.jsx';
import { useT } from '../../lib/i18n/useT.js';
import { analyzeSkin, findAutoWhite, monkToDepth, monkLab, recommendShades, recommendFinishes, analyzeHandShape } from '../../ai/nails/index.js';
import { MONK_SCALE, OCCASIONS, PERSONAS, UNDERTONES, DEPTH_BY_KEY, UNDERTONE_BY_KEY, FINISH_BY_KEY, SHAPE_BY_KEY } from '../../data/nails/taxonomy.js';
import { NailSwatch } from './NailSwatch.jsx';
import { ShapeIcon } from './ShapeIcon.jsx';
import { StudioSheet, Spinner, usePick } from './ui.jsx';

export function AnalysisSheet({ open, onClose, engine, white, catalog, onApplyShade, onApplyShape, onCompare, onCalibrate, onResult, initial }) {
  const { t } = useT();
  const pick = usePick();
  const [busy, setBusy] = useState(false);
  const [skin, setSkin] = useState(initial?.skin || null);
  const [hand, setHand] = useState(initial?.hand || null);
  const [err, setErr] = useState(null);
  const [occasion, setOccasion] = useState(initial?.occasion || 'daily');
  const [persona, setPersona] = useState(initial?.persona || null);
  const [undertone, setUndertone] = useState(initial?.undertone || null);
  const [monkOverride, setMonkOverride] = useState(initial?.monkOverride || null);

  useEffect(() => {
    if (!open || !engine) return undefined;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setErr(null);
      try {
        if (engine.mode === 'live') await engine.freeze();
        const hands = engine.hands || [];
        if (!hands.length) {
          setErr('no_hand_photo');
          return;
        }
        const nails = engine.currentNails();
        let best = hands[0];
        let bestScore = -Infinity;
        hands.forEach((h) => {
          const vis = nails.filter((n) => n.key.startsWith(h.handedness)).reduce((a, n) => a + n.alpha, 0);
          const sc = vis + h.score;
          if (sc > bestScore) {
            bestScore = sc;
            best = h;
          }
        });
        const data = engine.photoImageData(900);
        const side = nails.find((n) => n.key.startsWith(best.handedness))?.side;
        const autoWhite = white ? null : findAutoWhite(data.img);
        const s = analyzeSkin(data.img, best.landmarks, { white, autoWhite, dorsal: side });
        const hs = analyzeHandShape(best, nails.filter((n) => n.key.startsWith(best.handedness)));
        if (cancelled) return;
        if (!s.ok) setErr(s.reason);
        setSkin(s.ok ? s : null);
        setHand(hs);
        if (s.ok) setUndertone((u) => u || s.undertone);
      } catch (e) {
        console.warn(e);
        if (!cancelled) setErr('analysis_failed');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, engine, white]);

  // A tapped Monk orb overrides the camera reading (depth + reference colour for nude matching)
  const effSkin = useMemo(() => {
    if (!skin) return null;
    if (!monkOverride) return skin;
    return { ...skin, monk: monkOverride, depth: monkToDepth(monkOverride), lab: monkLab(monkOverride), corrected: true };
  }, [skin, monkOverride]);
  const ctx = useMemo(
    () => ({ skin: effSkin, depth: effSkin?.depth, undertone: undertone || skin?.undertone, occasion, persona, preferInStock: true, limit: 12 }),
    [effSkin, skin, undertone, occasion, persona],
  );
  const recs = useMemo(() => (skin ? recommendShades(catalog, ctx) : []), [catalog, ctx, skin]);
  const finishes = useMemo(() => recommendFinishes(ctx), [ctx]);

  useEffect(() => {
    if (skin || hand) onResult?.({ skin: effSkin, hand, occasion, persona, undertone: undertone || skin?.undertone, monkOverride });
  }, [effSkin, skin, hand, occasion, persona, undertone, monkOverride, onResult]);

  const reasonText = (r) => {
    const p = r.p || {};
    const vars = {};
    if (p.depth) vars.depth = pick(DEPTH_BY_KEY[p.depth]);
    if (p.undertone) vars.undertone = pick(UNDERTONE_BY_KEY[p.undertone]);
    if (p.occasion) vars.occasion = pick(OCCASIONS.find((o) => o.key === p.occasion));
    if (p.persona) vars.persona = pick(PERSONAS.find((o) => o.key === p.persona));
    return t(`nails.${r.k}`, vars);
  };
  const curUndertone = undertone || skin?.undertone;

  return (
    <StudioSheet open={open} onClose={onClose} title={t('nails.ai_match')}>
      {busy ? (
        <div className="flex flex-col items-center gap-3 py-12 text-ink2" aria-busy>
          <Spinner size={30} />
          <p className="font-semibold">{t('nails.analyzing_hand')}</p>
        </div>
      ) : null}
      {!busy && err ? (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-card border border-warn p-4 text-[14px]">
          <Icon name="alert" className="mt-0.5 text-warn" size={20} />
          <span>{t(`nails.err_${err}`)}</span>
        </div>
      ) : null}
      {!busy && skin ? (
        <div className="flex flex-col gap-5">
          <section className="card p-4">
            <div className="flex items-center gap-4">
              <span className="h-16 w-16 shrink-0 rounded-full border-4 border-surface shadow-sheet" style={{ background: monkOverride ? MONK_SCALE[monkOverride - 1].hex : skin.hex }} />
              <div className="min-w-0 flex-1">
                <p className="eyebrow flex items-center gap-2">
                  {t('nails.your_skin')}
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] tracking-normal ${skin.calibrated || monkOverride ? 'border-ok text-ok' : 'border-warn text-warn'}`}>
                    {monkOverride ? t('nails.badge_confirmed') : skin.calibrated ? t('nails.badge_calibrated') : t('nails.badge_preview')}
                  </span>
                </p>
                <p className="font-display text-[24px] leading-tight">
                  {pick(DEPTH_BY_KEY[effSkin.depth])} · {pick(UNDERTONE_BY_KEY[curUndertone])}
                </p>
                <p className="num text-[13px] text-ink2">
                  {t('nails.monk_level', { n: effSkin.monk })} · ITA {skin.ita}° · {t('nails.confidence')} {monkOverride ? 100 : Math.round(skin.confidence * 100)}%
                </p>
              </div>
            </div>
            <p className="mt-4 text-[12px] font-semibold text-ink2">{t('nails.tap_closest_orb')}</p>
            <div className="mt-1.5 flex gap-1" role="radiogroup" aria-label={t('nails.monk_scale')}>
              {MONK_SCALE.map((m) => {
                const sel = m.level === effSkin.monk;
                return (
                  <button
                    key={m.level}
                    type="button"
                    role="radio"
                    aria-checked={sel}
                    aria-label={`MST ${m.level}`}
                    onClick={() => setMonkOverride(m.level === skin.monk && !monkOverride ? null : m.level)}
                    className="flex h-12 flex-1 items-center justify-center"
                  >
                    <span className={`block h-8 w-full rounded-full transition ${sel ? 'scale-110 ring-2 ring-ink ring-offset-2' : ''}`} style={{ background: m.hex }} />
                  </button>
                );
              })}
            </div>
            {skin.warnings.length > 0 || !skin.calibrated ? (
              <div className="mt-4 flex flex-col gap-2">
                {skin.warnings.map((w) => (
                  <p key={w} className="flex items-start gap-2 text-[13px] text-warn">
                    <Icon name="alert" size={16} className="mt-0.5" />
                    {t(`nails.warn_${w}`)}
                  </p>
                ))}
                {!skin.calibrated ? (
                  <Button variant="ghost" full={false} icon="drop" onClick={onCalibrate} className="self-start">
                    {t('nails.calibrate_for_accuracy')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </section>

          <section>
            <p className="label mb-2">{t('nails.confirm_undertone')}</p>
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {UNDERTONES.map((u) => (
                <Chip key={u.key} selected={curUndertone === u.key} onClick={() => setUndertone(u.key)}>
                  {pick(u)}
                </Chip>
              ))}
            </div>
            <p className="mt-1.5 text-[12px] text-ink2">{pick(UNDERTONE_BY_KEY[curUndertone]?.hint)}</p>
          </section>

          <section className="grid gap-4 tablet:grid-cols-2">
            <div>
              <p className="label mb-2">{t('nails.occasion')}</p>
              <div className="flex flex-wrap gap-2">
                {OCCASIONS.map((o) => (
                  <Chip key={o.key} selected={occasion === o.key} onClick={() => setOccasion(o.key)}>
                    {pick(o)}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="label mb-2">{t('nails.style')}</p>
              <div className="flex flex-wrap gap-2">
                {PERSONAS.map((o) => (
                  <Chip key={o.key} selected={persona === o.key} onClick={() => setPersona(persona === o.key ? null : o.key)}>
                    {pick(o)}
                  </Chip>
                ))}
              </div>
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-end justify-between gap-2">
              <h3 className="font-display text-[22px]">{t('nails.best_for_you')}</h3>
              {recs.length >= 2 ? (
                <Button variant="ghost" full={false} icon="compare" onClick={() => onCompare(recs.slice(0, 4).map((r) => r.polish))}>
                  {t('nails.compare_top4')}
                </Button>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-2 tablet:grid-cols-2">
              {recs.map((r, i) => (
                <button key={r.polish.id} type="button" onClick={() => onApplyShade(r.polish)} className="card press flex min-h-tap items-center gap-3 p-3 text-start">
                  <span className="num w-5 shrink-0 text-center text-[13px] font-bold text-ink2">{i + 1}</span>
                  <NailSwatch hex={r.polish.hex} hex2={r.polish.hex2} finish={r.polish.finish} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold">{pick(r.polish)}</span>
                    <span className="block truncate text-[12px] text-ink2">{r.reasons.map(reasonText).join(' · ') || pick(FINISH_BY_KEY[r.polish.finish])}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-plum px-3 py-1.5 text-[12px] font-bold text-onplum">{t('nails.try')}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-ink2">
              {t('nails.finishes_suggested')}: {finishes.map((f) => pick(FINISH_BY_KEY[f])).join(' · ')}
            </p>
          </section>
        </div>
      ) : null}

      {!busy && hand ? (
        <section className="mt-5">
          <h3 className="font-display text-[22px]">{t('nails.shape_for_hand')}</h3>
          <p className="mb-2 text-[13px] text-ink2">{hand.reasons.map((r) => t(`nails.${r}`)).join(' ')}</p>
          <div className="flex flex-wrap gap-2">
            {hand.shapes.map((s) => (
              <button key={s} type="button" onClick={() => onApplyShape(s, hand.length)} className="press inline-flex min-h-[56px] items-center gap-2 rounded-full border border-line bg-surface px-4 text-[15px]">
                <ShapeIcon shape={s} length={0.45} size={30} />
                {pick(SHAPE_BY_KEY[s])}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <p className="mt-6 flex items-start gap-2 text-[12px] text-ink2">
        <Icon name="lock" size={16} className="mt-0.5" />
        {t('nails.privacy_on_device')}
      </p>
      <p className="mt-1 flex items-start gap-2 text-[12px] text-ink2">
        <Icon name="info" size={16} className="mt-0.5" />
        {t('nails.ai_disclaimer')}
      </p>
    </StudioSheet>
  );
}
