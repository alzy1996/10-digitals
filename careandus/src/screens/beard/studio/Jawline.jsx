// Jawline engineering view (PRD 3.5, 6.2): how the beard changes the perceived face
// shape, as one line ("Face reads 8% longer") and an optional thin outline sketch of
// the face before (dashed) and with the beard (brass), drawn from jawlineDetail.

import { cx } from '../ui/kit.js';
import { useT } from '../lib/i18n.js';

/** One readable line from jawlineLabels(): "Face reads 8% longer · Jaw reads 6% softer". */
export function JawlineLine({ labels, className }) {
  const { t } = useT();
  const text = (labels || []).map((l) => t(l.key, l.vars)).join(' · ');
  return <p className={cx('num min-w-0 text-sm font-medium text-ink', className)}>{text}</p>;
}

/** Half-outline path of a face from its widths (mm), mirrored into a full outline. */
function facePath({ forehead, cheek, jaw, length }, scale, cx0, top) {
  const L = length * scale;
  const F = (forehead / 2) * scale;
  const C = (cheek / 2) * scale;
  const J = (jaw / 2) * scale;
  const chinW = J * 0.32;
  const side = (s) => {
    const x = (v) => cx0 + s * v;
    return [
      `Q ${x(F * 0.9)} ${top} ${x(F)} ${top + L * 0.18}`,
      `Q ${x(C)} ${top + L * 0.28} ${x(C)} ${top + L * 0.46}`,
      `Q ${x(C)} ${top + L * 0.66} ${x(J)} ${top + L * 0.8}`,
      `Q ${x(chinW * 1.6)} ${top + L} ${x(0)} ${top + L}`,
    ];
  };
  const right = side(1);
  // The left half is drawn bottom-up, mirroring each curve.
  const x = (v) => cx0 - v;
  const left = [
    `Q ${x(chinW * 1.6)} ${top + L} ${x(J)} ${top + L * 0.8}`,
    `Q ${x(C)} ${top + L * 0.66} ${x(C)} ${top + L * 0.46}`,
    `Q ${x(C)} ${top + L * 0.28} ${x(F)} ${top + L * 0.18}`,
    `Q ${x(F * 0.9)} ${top} ${cx0} ${top}`,
  ];
  return `M ${cx0} ${top} ${right.join(' ')} ${left.join(' ')} Z`;
}

/** Small before (dashed) / after (brass) outline sketch, for the thin overlay on the Studio canvas. */
export function JawlineSketch({ detail, size = 120, className }) {
  const { t } = useT();
  if (!detail || !detail.before || !detail.after) return null;
  const b = detail.before;
  const a = detail.after;
  const W = size;
  const H = Math.round(size * 1.25);
  const pad = 8;
  const maxW = Math.max(b.cheekMm, a.cheekMm, b.jawMm, a.jawMm, b.foreheadMm, a.foreheadMm);
  const maxL = Math.max(b.lengthMm, a.lengthMm);
  const scale = Math.min((W - pad * 2) / maxW, (H - pad * 2) / maxL);
  const top = pad;
  const cx0 = W / 2;
  const before = facePath({ forehead: b.foreheadMm, cheek: b.cheekMm, jaw: b.jawMm, length: b.lengthMm }, scale, cx0, top);
  const after = facePath({ forehead: a.foreheadMm, cheek: a.cheekMm, jaw: a.jawMm, length: a.lengthMm }, scale, cx0, top);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('beard.studio.jaw.sketch')} className={cx('block', className)}>
      <path d={before} fill="none" stroke="var(--text-2)" strokeWidth={1.25} strokeDasharray="3 3" />
      <path d={after} fill="none" stroke="var(--plum)" strokeWidth={1.5} />
    </svg>
  );
}
