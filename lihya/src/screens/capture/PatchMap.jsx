import { useId } from 'react';
import { zoneDiagramModel, ZD_ZONES } from '../../components/zoneDiagramGeometry.js';
import { formatPercent } from '../../lib/format.js';
import { useT } from '../../lib/i18n/useT.js';
import { cx } from '../../components/kit.js';

// The beard area of the 300 x 360 front drawing (forehead cropped off).
const VIEW = { x: 30, y: 96, w: 240, h: 250 };

// Label points for the density numbers, spread so neighbours do not touch. Front view:
// the customer's left (…_L) is on the viewer's right, like the Zone Diagram.
const LABEL_AT = Object.freeze({
  B_R: [74, 158],
  B_L: [226, 158],
  K_R: [100, 196],
  K_L: [200, 196],
  M: [150, 210],
  J_R: [78, 238],
  J_L: [222, 238],
  S: [150, 244],
  C: [150, 274],
  N: [150, 314],
});

const DENSITY_STEPS = Object.freeze([
  { key: 'none', density: 0 },
  { key: 'patchy', density: 30 },
  { key: 'medium', density: 60 },
  { key: 'dense', density: 85 },
]);

/** Fill opacity of the brass tint for a density 0..100. */
export function densityOpacity(density) {
  const d = Math.max(0, Math.min(100, Number(density) || 0));
  return 0.06 + (0.74 * d) / 100;
}

/**
 * Mini patch map (PRD 3.3, 8.1 step 3): the front face drawing with each beard zone
 * tinted brass by its density, the density % on the zone, and uncertain zones
 * (confidence under `confirmBelow`, not yet confirmed) outlined with a dashed warn line.
 */
export default function PatchMap({ zones, unsure = [], className }) {
  const { t, lang } = useT();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const model = zoneDiagramModel({ view: 'front', labelZones: [] });
  const unsureSet = new Set(unsure);
  const z = zones || {};
  const desc = ZD_ZONES.filter((k) => z[k])
    .map((k) => `${t(`zone.${k}`)}: ${formatPercent(z[k].density, lang)}`)
    .join('; ');

  return (
    <figure className={cx('flex flex-col items-center gap-2', className)}>
      <svg
        viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
        role="img"
        aria-labelledby={`${uid}-t ${uid}-d`}
        className="h-auto w-full max-w-[260px]"
        direction="ltr"
      >
        <title id={`${uid}-t`}>{t('capture.profile.map')}</title>
        <desc id={`${uid}-d`}>{desc}</desc>
        {ZD_ZONES.map((k) => {
          const d = model.shapes[k];
          if (!d) return null;
          const info = z[k];
          const doubt = unsureSet.has(k);
          return (
            <path
              key={k}
              d={d}
              fill="var(--brass)"
              fillOpacity={info ? densityOpacity(info.density) : 0}
              stroke={doubt ? 'var(--warn)' : 'var(--text-2)'}
              strokeOpacity={doubt ? 1 : 0.45}
              strokeWidth={doubt ? 1.5 : 0.75}
              strokeDasharray={doubt ? '4 3' : undefined}
              strokeLinejoin="round"
            />
          );
        })}
        <g fill="none" stroke="var(--text-2)" strokeLinecap="round" strokeLinejoin="round">
          {model.faint.map((d, i) => (
            <path key={`f${i}`} d={d} strokeWidth={1.25} strokeOpacity={0.4} />
          ))}
          {model.strokes.map((d, i) => (
            <path key={`s${i}`} d={d} strokeWidth={1.5} strokeOpacity={0.9} />
          ))}
        </g>
        <g fontFamily="'Barlow Condensed', 'IBM Plex Sans Arabic', sans-serif" fontWeight={600} textAnchor="middle">
          {ZD_ZONES.map((k) => {
            const info = z[k];
            const at = LABEL_AT[k];
            if (!info || !at || !Number.isFinite(Number(info.density))) return null;
            return (
              <text
                key={k}
                x={at[0]}
                y={at[1]}
                fontSize={13}
                fill={unsureSet.has(k) ? 'var(--warn)' : 'var(--text)'}
                stroke="var(--bg)"
                strokeWidth={3}
                strokeLinejoin="round"
                paintOrder="stroke"
                dominantBaseline="middle"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatPercent(info.density, lang)}
              </text>
            );
          })}
        </g>
      </svg>
      <figcaption className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-text-2">
        <span className="flex items-center gap-1.5">
          <span className="me-0.5">{t('capture.profile.mapLegend')}</span>
          {DENSITY_STEPS.map((s) => (
            <span key={s.key} className="flex items-center gap-1">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 rounded-[3px] border border-line"
                style={{ background: `rgb(var(--brass-rgb) / ${densityOpacity(s.density)})` }}
              />
              <span>{t(`ai.zone.${s.key}`)}</span>
            </span>
          ))}
        </span>
        {unsure.length ? (
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-3 w-4 rounded-[3px] border border-dashed border-warn" />
            <span>{t('capture.profile.mapUnsure')}</span>
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
