import { useId } from 'react';
import { mmToGuard, DEFAULT_GUARD_CHART } from '../lib/guards.js';
import { formatMm } from '../lib/format.js';
import { pickLang } from '../lib/i18n/useT.js';
import { cx, useOptionalT } from './kit.js';
import { zoneDiagramModel, zoneTone, ZD_ZONES } from './zoneDiagramGeometry.js';

/** Theme colors (CSS variables) for screens. */
export const ZONE_DIAGRAM_SCREEN_PALETTE = Object.freeze({
  keep: 'var(--keep)',
  cut: 'var(--cut)',
  brass: 'var(--brass)',
  text: 'var(--text)',
  text2: 'var(--text-2)',
});

/**
 * Fixed hex colors (the light tokens) for print and for rasterizing (html2canvas draws an inline
 * SVG as an image, where CSS variables do not resolve): pass palette={ZONE_DIAGRAM_PRINT_PALETTE}.
 */
export const ZONE_DIAGRAM_PRINT_PALETTE = Object.freeze({
  keep: '#2E7D53',
  cut: '#A8331F',
  brass: '#7E622A',
  text: '#16171A',
  text2: '#5E5A53',
});

/** Short guard text for a label: "#2", "No guard", "Shave", "Scissor". */
function guardText(guard, lang, t) {
  if (!guard) return '';
  if (guard.kind === 'shave') return t('ui.zd.shave');
  if (guard.kind === 'scissor') return t('ui.zd.scissor');
  return pickLang(lang, guard.label) || '';
}

function readInputs(params, cutCard) {
  const mm = {};
  const guards = {};
  let cheek = {};
  let neckline = {};
  if (cutCard && Array.isArray(cutCard.rows)) {
    for (const row of cutCard.rows) {
      if (!row || !ZD_ZONES.includes(row.zone)) continue;
      mm[row.zone] = row.mm;
      if (row.guard) guards[row.zone] = row.guard;
    }
  } else if (params && params.zones) {
    for (const z of ZD_ZONES) if (params.zones[z] !== undefined) mm[z] = params.zones[z];
  }
  const lines = (params && params.lines) || {};
  if (cutCard && cutCard.cheekLine) {
    cheek = { type: cutCard.cheekLine.type, mmAboveJaw: cutCard.cheekLine.mmAboveJaw };
  } else {
    cheek = { type: lines.cheek, offset: lines.cheekOffset };
  }
  if (cutCard && cutCard.neckline) {
    neckline = { type: cutCard.neckline.type, mmAboveAdamsApple: cutCard.neckline.mmAboveAdamsApple };
  } else {
    neckline = { type: lines.neckline, offset: lines.necklineOffset };
  }
  return { mm, guards, cheek, neckline };
}

/**
 * Zone Diagram (PRD 9.5): pure SVG line drawing of a man's face, front or profile, with each
 * zone tinted keep (target mm > 0) or remove (0), brass edge lines for the cheek line and the
 * neckline, and labels with mm and the guard. Left and right are the customer's: in the front
 * view his left is on the viewer's right. Works outside the app providers (Cut Card PDF):
 * pass `lang` and, for rasterizing, `palette={ZONE_DIAGRAM_PRINT_PALETTE}`.
 *
 * Data: `cutCard` (rows, cheekLine, neckline from buildCutCard) or `params` (LookParams).
 * `side` ('L' | 'R') picks which cheek the profile shows (default the customer's left).
 */
export default function ZoneDiagram({
  params,
  cutCard,
  view = 'front',
  side = 'L',
  size,
  lang,
  guardChart = DEFAULT_GUARD_CHART,
  showLabels = true,
  palette = ZONE_DIAGRAM_SCREEN_PALETTE,
  title,
  className,
}) {
  const { t, lang: L } = useOptionalT(lang);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const { mm, guards, cheek, neckline } = readInputs(params, cutCard);
  const model = zoneDiagramModel({
    view: view === 'profile' ? 'profile' : 'front',
    side,
    cheek,
    neckline,
    labelZones: ZD_ZONES.filter((z) => zoneTone(mm[z]) !== 'none'),
  });
  const pal = { ...ZONE_DIAGRAM_SCREEN_PALETTE, ...palette };
  const rtl = L === 'ar';
  const fill = { keep: pal.keep, cut: pal.cut };

  const guardFor = (z) => guards[z] || mmToGuard(mm[z], guardChart);
  const labelLines = (z) => [formatMm(mm[z], L), guardText(guardFor(z), L, t)];

  const viewName = view === 'profile' ? t('ui.zd.profile') : t('ui.zd.front');
  const heading = title || `${t('ui.zd.title')}, ${viewName}`;
  const desc = ZD_ZONES.filter((z) => model.shapes[z] && zoneTone(mm[z]) !== 'none')
    .map((z) => `${t(`zone.${z}`)}: ${labelLines(z).filter(Boolean).join(', ')}`)
    .join('; ');

  const width = size || undefined;
  const height = size ? Math.round((size * model.height) / model.width) : undefined;

  // Physical text placement: an Arabic run needs direction rtl, which swaps the meaning of
  // text-anchor start/end, so pick the anchor that puts the text where the column needs it.
  const anchorFor = (column) => {
    const towardLeft = column === 'left'; // left column text ends at the column edge
    if (towardLeft) return rtl ? 'start' : 'end';
    return rtl ? 'end' : 'start';
  };
  const textDir = rtl ? 'rtl' : 'ltr';

  const sideText = (key) => (key === 'L' ? t('ui.zd.left') : t('ui.zd.right'));
  const profileSideText = side === 'R' ? t('ui.zd.sideR') : t('ui.zd.sideL');

  return (
    <svg
      viewBox={`0 0 ${model.width} ${model.height}`}
      width={width}
      height={height}
      role="img"
      aria-labelledby={`${uid}-t ${uid}-d`}
      className={cx(size ? undefined : 'h-auto w-full', className)}
      fontFamily="'IBM Plex Sans Arabic', system-ui, sans-serif"
      direction="ltr"
    >
      <title id={`${uid}-t`}>{heading}</title>
      <desc id={`${uid}-d`}>{desc}</desc>

      <g transform={model.mirrored ? `matrix(-1 0 0 1 ${model.width} 0)` : undefined}>
        {model.below ? <path d={model.below} fill={pal.cut} fillOpacity={0.14} stroke="none" /> : null}
        {ZD_ZONES.map((z) => {
          const d = model.shapes[z];
          if (!d) return null;
          const tone = zoneTone(mm[z]);
          return (
            <path
              key={z}
              d={d}
              fill={tone === 'none' ? 'none' : fill[tone]}
              fillOpacity={0.25}
              stroke={pal.text2}
              strokeOpacity={0.4}
              strokeWidth={0.75}
              strokeLinejoin="round"
            />
          );
        })}
        <g fill="none" stroke={pal.text2} strokeLinecap="round" strokeLinejoin="round">
          {model.faint.map((d, i) => (
            <path key={`f${i}`} d={d} strokeWidth={1.25} strokeOpacity={0.45} />
          ))}
          {model.strokes.map((d, i) => (
            <path key={`s${i}`} d={d} strokeWidth={1.5} />
          ))}
        </g>
        <g fill="none" stroke={pal.brass} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          {model.edges.map((e) => (
            <path key={e.id} d={e.d} />
          ))}
        </g>
      </g>

      {showLabels ? (
        <g>
          {model.labels.map((l) => {
            const [line1, line2] = labelLines(l.zone);
            const left = l.column === 'left';
            const lx = left ? l.x + 3 : l.x - 3;
            return (
              <g key={l.zone}>
                <line x1={lx} y1={l.y - 4} x2={l.ax} y2={l.ay} stroke={pal.text2} strokeWidth={0.75} strokeOpacity={0.85} />
                <circle cx={l.ax} cy={l.ay} r={1.9} fill={pal.text} />
                <text
                  x={l.x}
                  y={l.y - 6}
                  textAnchor={anchorFor(l.column)}
                  direction={textDir}
                  fontSize={12.5}
                  fontWeight={600}
                  fill={pal.text}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {line1}
                </text>
                {line2 ? (
                  <text x={l.x} y={l.y + 8} textAnchor={anchorFor(l.column)} direction={textDir} fontSize={11} fill={pal.text2}>
                    {/* First-strong isolate: a shop guard label such as "#2 Andis" keeps its own order in Arabic. */}
                    {rtl ? `\u2068${line2}\u2069` : line2}
                  </text>
                ) : null}
              </g>
            );
          })}

          {view === 'profile' ? (
            <text
              x={model.sides[0].x}
              y={model.sides[0].y}
              textAnchor={model.sides[0].align === 'left' ? (rtl ? 'end' : 'start') : rtl ? 'start' : 'end'}
              direction={textDir}
              fontSize={12.5}
              fontWeight={600}
              fill={pal.brass}
            >
              {profileSideText}
            </text>
          ) : (
            model.sides.map((s) => (
              <text
                key={s.key}
                x={s.x}
                y={s.y}
                textAnchor={s.align === 'left' ? (rtl ? 'end' : 'start') : rtl ? 'start' : 'end'}
                direction={textDir}
                fontSize={12.5}
                fontWeight={600}
                fill={pal.brass}
              >
                {sideText(s.key)}
              </text>
            ))
          )}

          {(() => {
            const right = model.legend.align === 'right';
            const sx = right ? model.width - 20 : 8;
            const tx = right ? model.width - 26 : 26;
            const anchor = right ? (rtl ? 'start' : 'end') : rtl ? 'end' : 'start';
            return (
              <g fontSize={11} fill={pal.text2}>
                <rect x={sx} y={331} width={12} height={9} rx={2} fill={pal.keep} fillOpacity={0.45} />
                <text x={tx} y={339.5} textAnchor={anchor} direction={textDir}>
                  {t('ui.zd.keep')}
                </text>
                <rect x={sx} y={346} width={12} height={9} rx={2} fill={pal.cut} fillOpacity={0.45} />
                <text x={tx} y={354.5} textAnchor={anchor} direction={textDir}>
                  {t('ui.zd.remove')}
                </text>
              </g>
            );
          })()}
        </g>
      ) : null}
    </svg>
  );
}
