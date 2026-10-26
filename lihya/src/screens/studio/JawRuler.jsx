// The barber's ruler in the Studio (PRD 9.5): while a length is changing, a thin brass
// ruler with mm ticks (every 5 mm, longer every 10 mm, at this face's real scale) is
// laid along the jaw on the photo, just outside the beard so it never covers what is
// being edited. The zones the moving slider changes are drawn bolder, with the length
// beside them. Image coordinates of the un-mirrored photo, the same in both languages.

import { clamp } from '../../components/kit.js';
import { useT } from '../../lib/i18n/useT.js';
import { formatMm } from '../../lib/format.js';
import { rulerPath, rulerZones, ticksAlong, toStage } from './lineHandles.js';

const TICK_MM = 5;
const TICK = 5;
const TICK_MAJOR = 9;
/** Label distance from the ruler, outward (CSS px). */
const LABEL_GAP = 16;

const pathOf = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');

/**
 * @param {object} p
 * @param {object} p.guides renderStudio.lineGuides of the shown (front) shot
 * @param {{ x, y, w, h }} p.crop face crop on screen (shot pixels)
 * @param {{ width, height }} p.box stage box (CSS pixels)
 * @param {object} p.zones the look's zone lengths (mm), as shown
 * @param {string|null} p.zone what the slider changes ('all', 'C', 'J', 'J_L', 'B', 'fade', ...)
 * @param {number} p.mm the length being set
 * @param {string} p.label the slider's label
 */
export default function JawRuler({ guides, crop, box, zones, zone, mm, label }) {
  const { lang } = useT();
  const path = rulerPath(guides, zones);
  if (!path || path.pts.length < 2) return null;
  const pts = path.pts.map((p) => toStage(p, crop, box));
  const pxPerMm = box.width / crop.w / guides.mmPerPx;
  const jaw = guides.jaw.pts;
  // Ticks point away from the face (from the middle of the line between the ears).
  const center = toStage([(jaw[0][0] + jaw[jaw.length - 1][0]) / 2, (jaw[0][1] + jaw[jaw.length - 1][1]) / 2], crop, box);
  const ticks = ticksAlong(pts, TICK_MM * pxPerMm, { majorEvery: 2, away: center });

  const hl = new Set(rulerZones(zone));
  const runs = [];
  let run = null;
  for (let k = 0; k < pts.length; k++) {
    if (hl.has(path.zones[k])) {
      if (!run) {
        run = k > 0 ? [pts[k - 1], pts[k]] : [pts[k]];
        runs.push(run);
      } else run.push(pts[k]);
    } else if (run) {
      run.push(pts[k]);
      run = null;
    }
  }
  const hlPts = runs.flat();
  const anchorAt = hlPts.length ? hlPts[Math.floor(hlPts.length / 2)] : pts[clamp(guides.jaw.chin - 1, 0, pts.length - 1)];
  const dx = anchorAt[0] - center[0];
  const dy = anchorAt[1] - center[1];
  const dl = Math.hypot(dx, dy) || 1;
  const labelAt = [
    clamp(anchorAt[0] + (dx / dl) * LABEL_GAP, 80, Math.max(80, box.width - 80)),
    clamp(anchorAt[1] + (dy / dl) * LABEL_GAP, 14, Math.max(14, box.height - 14)),
  ];
  const d = pathOf(pts);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-card">
      <svg className="absolute inset-0" width={box.width} height={box.height} viewBox={`0 0 ${box.width} ${box.height}`}>
        <path d={d} fill="none" stroke="rgb(var(--bg-rgb) / 0.5)" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        <path d={d} fill="none" stroke="var(--brass)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        {ticks.map((tk, i) => {
          const l = tk.major ? TICK_MAJOR : TICK;
          return (
            <line
              key={i}
              x1={tk.p[0]}
              y1={tk.p[1]}
              x2={tk.p[0] + tk.n[0] * l}
              y2={tk.p[1] + tk.n[1] * l}
              stroke="var(--brass)"
              strokeWidth={tk.major ? 1.5 : 1}
              strokeLinecap="round"
            />
          );
        })}
        {runs.map((r, i) => (
          <path key={`h${i}`} d={pathOf(r)} fill="none" stroke="var(--brass)" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </svg>
      <span
        className="num absolute max-w-[160px] truncate whitespace-nowrap rounded-full border border-brass bg-bg/90 px-2.5 py-1 text-xs font-semibold text-brass"
        style={{ left: labelAt[0], top: labelAt[1], transform: 'translate(-50%, -50%)' }}
      >
        {label ? `${label}: ` : ''}
        {formatMm(mm, lang)}
      </span>
    </div>
  );
}
