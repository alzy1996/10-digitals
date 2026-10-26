// Grey Journey planner (PRD 3.8): full coverage vs blending vs silver transition,
// each with its own 8-week grow-out simulation on her photo.
import { useMemo } from 'react';
import { useT } from '../lib/i18n/useT.js';
import { renderThumb } from '../hooks/useThumbs.js';
import { lookDrawParams, lowMaintenanceScore, effectiveRootL } from '../ai/index.js';
import { Tag } from './Chip.jsx';

function nearest(shades, tones, level) {
  const pool = shades.filter((s) => tones.includes(s.tone));
  return pool.sort((a, b) => Math.abs(a.level - level) - Math.abs(b.level - level) || a.id.localeCompare(b.id))[0] || null;
}

export function greyPlans(catalog, profile) {
  const root = profile.hair.rootLevel;
  const cover = nearest(catalog.shades, ['natural', 'mocha'], root);
  const blend = nearest(catalog.shades, ['beige', 'natural', 'ash'], Math.min(10, root + 2));
  const silver = catalog.shades.find((s) => s.id === 'silver') || nearest(catalog.shades, ['ash', 'pearl'], 11);
  return [
    cover && { key: 'cover', shadeId: cover.id, technique: 'global', finish: 'satin' },
    blend && { key: 'blend', shadeId: blend.id, technique: 'babylights', finish: 'satin', techniqueParams: { start: 0, density: 0.55, softness: 0.7, level: 0 } },
    silver && { key: 'silver', shadeId: silver.id, technique: 'babylights', finish: 'pearl', techniqueParams: { start: 0, density: 0.75, softness: 0.6, level: 0 } },
  ].filter(Boolean);
}

export default function GreyJourney({ data, catalog, profile, ctx, swatchesById, scannedLevels, onChoose }) {
  const { t, name } = useT();
  const plans = useMemo(() => greyPlans(catalog, profile), [catalog, profile]);
  const cards = useMemo(() => {
    if (!data) return [];
    return plans.map((p) => {
      const look = { ...p, lightPreset: 'daylight', regrowthWeeks: 8 };
      const params = lookDrawParams({ look, catalog, profile, renderData: data.renderData, aux: data.aux, swatchesById, scannedLevels, ctx });
      const tech = catalog.techniques.find((x) => x.id === p.technique);
      const naturalL = effectiveRootL(data.renderData.zones.rootL, profile.hair.greyPct);
      const colorL = tech?.mask === 'babylights' ? (data.renderData.zones.rootL + params.target[0]) / 2 : params.target[0];
      let img;
      try {
        img = renderThumb(data, params, 300);
      } catch {
        img = null;
      }
      return { ...p, img, score: lowMaintenanceScore({ mask: tech?.mask, naturalL, colorL }), shade: catalog.shades.find((s) => s.id === p.shadeId) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.version, plans]);

  return (
    <section>
      <p className="mb-3 text-sm text-ink2">{t('grey.lead', { pct: profile.hair.greyPct })}</p>
      <div className="grid grid-cols-1 gap-3">
        {cards.map((c) => (
          <button key={c.key} type="button" onClick={() => onChoose(c)} className="press card flex gap-3 overflow-hidden p-2 text-start">
            {c.img ? <img src={c.img} alt="" className="aspect-[4/5] w-24 shrink-0 rounded-control object-cover" /> : <div className="aspect-[4/5] w-24 shrink-0 rounded-control bg-surface2" />}
            <span className="flex-1 py-1">
              <span className="block font-display text-lg leading-tight">{t(`grey.${c.key}`)}</span>
              <span className="mt-0.5 block text-xs text-ink2">{name(c.shade?.name)}</span>
              <span className="mt-1 block text-sm">{t(`grey.${c.key}Body`)}</span>
              <span className="mt-2 inline-block">
                <Tag tone={c.score >= 70 ? 'ok' : c.score >= 45 ? 'warn' : 'risk'}>{t('grey.at8', { score: c.score })}</Tag>
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
