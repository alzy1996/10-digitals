import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Button from '../components/Button.jsx';
import Chip, { ChipRow, Tag } from '../components/Chip.jsx';
import Slider from '../components/Slider.jsx';
import SwatchChip from '../components/SwatchChip.jsx';
import Icon from '../components/Icon.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useSession } from '../hooks/useSession.jsx';
import { applyOverride, topTwo, SHAPES, MST_HEX } from '../ai/hair/index.js';
import levels from '../data/levels.json';
import { formatCm } from '../lib/format.js';
import { AGE_BANDS, TEXTURES, DENSITIES, LENGTH_BANDS, UNDERTONES, EYE_COLORS } from '../services/schema.js';

function Stepper({ label, value, onChange, min, max, step = 1, format = (v) => v, swatch }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="label">{label}</span>
      <div className="flex items-center gap-2">
        {swatch ? <SwatchChip color={swatch} size={36} label={String(value)} /> : null}
        <button type="button" className="press grid min-h-tap min-w-tap place-items-center rounded-full border border-line" aria-label="−" onClick={() => onChange(Math.max(min, value - step))}>
          <Icon name="minus" />
        </button>
        <span className="num min-w-[64px] text-center text-lg font-semibold">{format(value)}</span>
        <button type="button" className="press grid min-h-tap min-w-tap place-items-center rounded-full border border-line" aria-label="+" onClick={() => onChange(Math.min(max, value + step))}>
          <Icon name="plus" />
        </button>
      </div>
    </div>
  );
}

export default function S05Profile() {
  const { t, lang } = useT();
  const session = useSession();
  const navigate = useNavigate();
  const p = session.profile;
  if (!p) return null;
  const set = (path, value) => session.patch({ profile: applyOverride(session.profile, path, value) });
  const two = topTwo(p.faceShape.scores);
  const levelSwatch = (lv) => levels.find((l) => l.level === lv)?.swatch;

  return (
    <main className="screen mx-auto max-w-[720px]">
      <TopBar title={t('profile.title')} step={t('flow.step', { n: 2, total: 7 })} />
      <p className="mb-5 text-sm text-ink2">{t('profile.lead')}</p>

      <section className="card mb-5 p-5">
        <h2 className="mb-1 text-lg">{t('profile.face')}</h2>
        <p className="mb-3 text-sm text-ink2">
          {two.map(([k, v]) => `${t(`shape.${k}`)} ${Math.round(v * 100)}%`).join(' · ')}
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          {SHAPES.map((k) => (
            <Chip key={k} selected={p.faceShape.top === k} onClick={() => set('faceShape.top', k)}>
              {t(`shape.${k}`)}
            </Chip>
          ))}
        </div>
        <div className="label mb-2">{t('profile.skin')}</div>
        <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label={t('profile.skin')}>
          {MST_HEX.map((hex, i) => (
            <button
              key={hex}
              type="button"
              role="radio"
              aria-checked={p.skin.mst === i + 1}
              aria-label={`MST ${i + 1}`}
              onClick={() => set('skin.mst', i + 1)}
              className={`press grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 ${p.skin.mst === i + 1 ? 'border-plum' : 'border-transparent'}`}
            >
              <span className="num grid h-10 w-10 place-items-center rounded-full text-xs font-semibold" style={{ background: hex, color: i < 5 ? '#1D1A1C' : '#F2ECE6' }}>
                {i + 1}
              </span>
            </button>
          ))}
        </div>
        <ChipRow label={t('profile.undertone')} value={p.skin.undertone} onChange={(v) => set('skin.undertone', v)} options={UNDERTONES.map((u) => ({ value: u, label: t(`undertone.${u}`) }))} />
        <ChipRow label={t('profile.eyes')} value={p.eyes.color} onChange={(v) => set('eyes.color', v)} options={EYE_COLORS.map((u) => ({ value: u, label: t(`eyes.${u}`) }))} />
        <ChipRow
          label={t('profile.age')}
          value={p.ageBand?.band || null}
          onChange={(v) => set('ageBand', { band: v, source: 'stylist', confidence: 1 })}
          options={AGE_BANDS.map((b) => ({ value: b, label: b }))}
        />
      </section>

      <section className="card mb-6 p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg">{t('profile.hair')}</h2>
          {p.hair.flags?.map((f) => (
            <Tag key={f} tone="warn">{t(`flag.${f}`)}</Tag>
          ))}
        </div>
        <Stepper label={t('profile.roots')} value={p.hair.rootLevel} min={1} max={12} onChange={(v) => set('hair.rootLevel', v)} swatch={levelSwatch(p.hair.rootLevel)} />
        <Stepper label={t('profile.mid')} value={p.hair.midLevel} min={1} max={12} onChange={(v) => set('hair.midLevel', v)} swatch={levelSwatch(p.hair.midLevel)} />
        <Stepper label={t('profile.ends')} value={p.hair.endsLevel} min={1} max={12} onChange={(v) => set('hair.endsLevel', v)} swatch={levelSwatch(p.hair.endsLevel)} />
        <div className="my-3 h-px bg-line" />
        <Slider label={t('profile.grey')} value={p.hair.greyPct} min={0} max={100} step={5} onChange={(v) => set('hair.greyPct', v)} format={(v) => `${v}%`} />
        <ChipRow label={t('profile.texture')} value={p.hair.texture} onChange={(v) => set('hair.texture', v)} options={TEXTURES.map((x) => ({ value: x, label: t(`texture.${x}`) }))} />
        <ChipRow label={t('profile.density')} value={p.hair.density} onChange={(v) => set('hair.density', v)} options={DENSITIES.map((x) => ({ value: x, label: t(`density.${x}`) }))} />
        <Stepper
          label={`${t('profile.length')} ${p.scale.mmPerPx ? '≈' : ''}`}
          value={p.hair.lengthCm ?? 30}
          min={2}
          max={120}
          step={0.5}
          onChange={(v) => set('hair.lengthCm', v)}
          format={(v) => formatCm(v, lang)}
        />
        <ChipRow label={t('profile.lengthBand')} value={p.hair.lengthBand} onChange={(v) => set('hair.lengthBand', v)} wrap={false} options={LENGTH_BANDS.map((x) => ({ value: x, label: t(`band.${x}`) }))} />
        {p.hair.regrowthCm ? <p className="text-sm text-ink2">{t('profile.regrowth', { cm: formatCm(p.hair.regrowthCm, lang) })}</p> : null}
        <p className="mt-2 text-xs text-ink2">
          {p.calibration.whiteCard ? t('profile.calibratedCard') : t('profile.calibratedAuto')} · {t('profile.scaleNote')}
        </p>
      </section>

      <Button icon="check" onClick={() => navigate('/history')}>
        {t('profile.looksRight')}
      </Button>
    </main>
  );
}
