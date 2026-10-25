// AI Match: skin depth + undertone + hand proportions → ranked shades, finishes and shapes with reasons.
import { useEffect, useMemo, useState } from 'react'
import { Sparkles, AlertTriangle, Pipette, Wand2, ShieldCheck } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import { Sheet, Spinner } from '../../components/ui'
import { NailSwatch } from '../../components/NailSwatch'
import { ShapeIcon } from '../../components/ShapeIcon'
import { analyzeSkin, findAutoWhite, monkToDepth, monkLab } from '../../ai/skinAnalysis'
import { recommendShades, recommendFinishes, analyzeHandShape } from '../../ai/recommend'
import { MONK_SCALE, OCCASIONS, PERSONAS, UNDERTONES, DEPTH_BY_KEY, UNDERTONE_BY_KEY, FINISH_BY_KEY, SHAPE_BY_KEY } from '../../data/taxonomy'

export function AnalysisSheet({ open, onClose, engine, white, catalog, onApplyShade, onApplyShape, onCompare, onCalibrate, onResult, initial }) {
  const { t, pick } = useI18n()
  const [busy, setBusy] = useState(false)
  const [skin, setSkin] = useState(initial?.skin || null)
  const [hand, setHand] = useState(initial?.hand || null)
  const [err, setErr] = useState(null)
  const [occasion, setOccasion] = useState(initial?.occasion || 'daily')
  const [persona, setPersona] = useState(initial?.persona || null)
  const [undertone, setUndertone] = useState(initial?.undertone || null)
  const [monkOverride, setMonkOverride] = useState(initial?.monkOverride || null)

  useEffect(() => {
    if (!open || !engine) return
    let cancelled = false
    ;(async () => {
      setBusy(true)
      setErr(null)
      try {
        if (engine.mode === 'live') await engine.freeze()
        const hands = engine.hands || []
        if (!hands.length) {
          setErr('no_hand_photo')
          return
        }
        const nails = engine.currentNails()
        let best = hands[0]
        let bestScore = -Infinity
        hands.forEach((h) => {
          const vis = nails.filter((n) => n.key.startsWith(h.handedness)).reduce((a, n) => a + n.alpha, 0)
          const sc = vis + h.score
          if (sc > bestScore) {
            bestScore = sc
            best = h
          }
        })
        const data = engine.photoImageData(900)
        const side = nails.find((n) => n.key.startsWith(best.handedness))?.side
        const autoWhite = white ? null : findAutoWhite(data.img)
        const s = analyzeSkin(data.img, best.landmarks, { white, autoWhite, dorsal: side })
        const hs = analyzeHandShape(best, nails.filter((n) => n.key.startsWith(best.handedness)))
        if (cancelled) return
        if (!s.ok) setErr(s.reason)
        setSkin(s.ok ? s : null)
        setHand(hs)
        if (s.ok) setUndertone((u) => u || s.undertone)
      } catch (e) {
        console.warn(e)
        if (!cancelled) setErr('analysis_failed')
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, engine, white])

  // Human-in-the-loop: a tapped Monk orb overrides the camera reading (depth + reference color for nude matching)
  const effSkin = useMemo(() => {
    if (!skin) return null
    if (!monkOverride) return skin
    return { ...skin, monk: monkOverride, depth: monkToDepth(monkOverride), lab: monkLab(monkOverride), corrected: true }
  }, [skin, monkOverride])
  const ctx = useMemo(() => ({ skin: effSkin, depth: effSkin?.depth, undertone: undertone || skin?.undertone, occasion, persona, preferInStock: true, limit: 12 }), [effSkin, skin, undertone, occasion, persona])
  const recs = useMemo(() => (skin ? recommendShades(catalog, ctx) : []), [catalog, ctx, skin])
  const finishes = useMemo(() => recommendFinishes(ctx), [ctx])

  useEffect(() => {
    if (skin || hand) onResult?.({ skin: effSkin, hand, occasion, persona, undertone: undertone || skin?.undertone, monkOverride })
  }, [effSkin, skin, hand, occasion, persona, undertone, monkOverride, onResult])

  const reasonText = (r) => {
    const p = r.p || {}
    const params = {}
    if (p.depth) params.depth = pick(DEPTH_BY_KEY[p.depth])
    if (p.undertone) params.undertone = pick(UNDERTONE_BY_KEY[p.undertone])
    if (p.occasion) params.occasion = pick(OCCASIONS.find((o) => o.key === p.occasion))
    if (p.persona) params.persona = pick(PERSONAS.find((o) => o.key === p.persona))
    return t(r.k, params)
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('ai_match')} wide>
      {busy && (
        <div className="flex flex-col items-center gap-3 py-12 text-ink-500">
          <Spinner size={30} />
          <p className="font-semibold">{t('analyzing_hand')}</p>
        </div>
      )}
      {!busy && err && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl bg-warn/10 p-4 text-[14px] text-ink-700">
          <AlertTriangle className="mt-0.5 shrink-0 text-warn" size={20} />
          <span>{t('err_' + err)}</span>
        </div>
      )}
      {!busy && skin && (
        <div className="flex flex-col gap-5">
          {/* --- Skin result */}
          <section className="card p-4">
            <div className="flex items-center gap-4">
              <span className="h-16 w-16 shrink-0 rounded-full border-4 border-white shadow-soft" style={{ background: monkOverride ? MONK_SCALE[monkOverride - 1].hex : skin.hex }} />
              <div className="min-w-0 flex-1">
                <p className="eyebrow flex items-center gap-2">
                  {t('your_skin')}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] tracking-normal ${skin.calibrated || monkOverride ? 'bg-ok/10 text-ok' : 'bg-warn/15 text-warn'}`}>
                    {monkOverride ? t('badge_confirmed') : skin.calibrated ? t('badge_calibrated') : t('badge_preview')}
                  </span>
                </p>
                <p className="font-display text-[26px] font-semibold leading-tight">
                  {pick(DEPTH_BY_KEY[effSkin.depth])} · {pick(UNDERTONE_BY_KEY[undertone || skin.undertone])}
                </p>
                <p className="text-[13px] text-ink-500">
                  {t('monk_level', { n: effSkin.monk })} · ITA {skin.ita}° · {t('confidence')} {monkOverride ? 100 : Math.round(skin.confidence * 100)}%
                </p>
              </div>
            </div>
            <p className="mt-4 text-[12px] font-semibold text-ink-500">{t('tap_closest_orb')}</p>
            <div className="mt-1.5 flex gap-1" role="radiogroup" aria-label={t('monk_scale')}>
              {MONK_SCALE.map((m) => {
                const sel = m.level === effSkin.monk
                const near = !monkOverride && skin.nearestOrbs?.includes(m.level)
                return (
                  <button
                    key={m.level}
                    role="radio"
                    aria-checked={sel}
                    aria-label={'MST ' + m.level}
                    onClick={() => setMonkOverride(m.level === skin.monk && !monkOverride ? null : m.level)}
                    className="flex h-11 flex-1 items-center justify-center"
                  >
                    <span className={`block h-8 w-full rounded-full transition ${sel ? 'scale-110 ring-2 ring-ink ring-offset-2' : near ? 'ring-1 ring-ink/30 ring-offset-1' : ''}`} style={{ background: m.hex }} />
                  </button>
                )
              })}
            </div>
            {(skin.warnings.length > 0 || !skin.calibrated) && (
              <div className="mt-4 flex flex-col gap-2">
                {skin.warnings.map((w) => (
                  <p key={w} className="flex items-start gap-2 text-[13px] text-warn">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    {t('warn_' + w)}
                  </p>
                ))}
                {!skin.calibrated && (
                  <button onClick={onCalibrate} className="btn-ghost min-h-[44px] self-start text-[14px]">
                    <Pipette size={16} />
                    {t('calibrate_for_accuracy')}
                  </button>
                )}
              </div>
            )}
          </section>

          {/* --- Confirm undertone (photo + human = best accuracy) */}
          <section>
            <p className="label">{t('confirm_undertone')}</p>
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {UNDERTONES.map((u) => (
                <button key={u.key} onClick={() => setUndertone(u.key)} className={`chip ${(undertone || skin.undertone) === u.key ? 'chip-on' : 'chip-off'}`}>
                  {pick(u)}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[12px] text-ink-500">{pick(UNDERTONE_BY_KEY[undertone || skin.undertone].hint)}</p>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="label">{t('occasion')}</p>
              <div className="flex flex-wrap gap-2">
                {OCCASIONS.map((o) => (
                  <button key={o.key} onClick={() => setOccasion(o.key)} className={`chip ${occasion === o.key ? 'chip-on' : 'chip-off'}`}>
                    {pick(o)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="label">{t('style')}</p>
              <div className="flex flex-wrap gap-2">
                {PERSONAS.map((o) => (
                  <button key={o.key} onClick={() => setPersona(persona === o.key ? null : o.key)} className={`chip ${persona === o.key ? 'chip-on' : 'chip-off'}`}>
                    {pick(o)}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* --- Recommendations */}
          <section>
            <div className="mb-2 flex items-end justify-between gap-2">
              <h3 className="font-display text-[24px] font-semibold">{t('best_for_you')}</h3>
              {recs.length >= 2 && (
                <button onClick={() => onCompare(recs.slice(0, 4).map((r) => r.polish))} className="btn-ghost min-h-[40px] px-4 text-[13px]">
                  <Wand2 size={15} />
                  {t('compare_top4')}
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {recs.map((r, i) => (
                <button key={r.polish.id} onClick={() => onApplyShade(r.polish)} className="card flex items-center gap-3 p-3 text-start transition active:scale-[0.99]">
                  <span className="w-5 shrink-0 text-center text-[13px] font-bold text-ink-400">{i + 1}</span>
                  <NailSwatch hex={r.polish.hex} hex2={r.polish.hex2} finish={r.polish.finish} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold">{pick(r.polish)}</span>
                    <span className="block truncate text-[12px] text-ink-500">{r.reasons.map(reasonText).join(' · ') || pick(FINISH_BY_KEY[r.polish.finish])}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-[12px] font-bold text-white">{t('try')}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-ink-500">
              {t('finishes_suggested')}: {finishes.map((f) => pick(FINISH_BY_KEY[f])).join(' · ')}
            </p>
          </section>
        </div>
      )}

      {!busy && hand && (
        <section className="mt-5">
          <h3 className="font-display text-[24px] font-semibold">{t('shape_for_hand')}</h3>
          <p className="mb-2 text-[13px] text-ink-500">{hand.reasons.map((r) => t(r)).join(' ')}</p>
          <div className="flex flex-wrap gap-2">
            {hand.shapes.map((s) => (
              <button key={s} onClick={() => onApplyShape(s, hand.length)} className="chip chip-off min-h-[56px] pe-5">
                <ShapeIcon shape={s} length={0.45} size={30} />
                {pick(SHAPE_BY_KEY[s])}
              </button>
            ))}
          </div>
        </section>
      )}

      <p className="mt-6 flex items-start gap-2 text-[12px] text-ink-400">
        <ShieldCheck size={15} className="mt-0.5 shrink-0" />
        {t('privacy_on_device')}
      </p>
      <p className="mt-1 flex items-start gap-2 text-[12px] text-ink-400">
        <Sparkles size={15} className="mt-0.5 shrink-0" />
        {t('ai_disclaimer')}
      </p>
    </Sheet>
  )
}
