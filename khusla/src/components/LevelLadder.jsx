import levels from '../data/levels.json';
import { useT } from '../lib/i18n/useT.js';

/**
 * Slim vertical 1–12 scale filled with the level swatches, three plum markers: Now, Session 1, Final.
 * `swatches` may override the colors with the salon's scanned levels.
 */
export default function LevelLadder({ now, session1, final, swatches, height = 360, width = 40, compact = false }) {
  const { t } = useT();
  const colors = levels.map((l) => swatches?.[l.level] || l.swatch);
  const step = height / 12;
  const y = (lv) => height - (lv - 0.5) * step;
  const markers = [];
  if (now?.root) markers.push({ key: 'now-root', lv: now.root, label: `${t('ladder.now')} ${t('ladder.roots')}` });
  if (now?.ends && now.ends !== now.root) markers.push({ key: 'now-ends', lv: now.ends, label: `${t('ladder.now')} ${t('ladder.ends')}` });
  if (session1) markers.push({ key: 's1', lv: session1, label: t('ladder.session1') });
  if (final) markers.push({ key: 'final', lv: final, label: t('ladder.final'), strong: true });

  // spread labels that would overlap
  const placed = [];
  for (const m of [...markers].sort((a, b) => a.lv - b.lv)) {
    let ly = y(m.lv);
    for (const p of placed) if (Math.abs(p - ly) < 18) ly = p - 18;
    placed.push(ly);
    m.ly = ly;
  }

  return (
    <div className="relative select-none" style={{ height, width: compact ? width + 8 : width + 96 }} aria-label={t('ladder.title')}>
      <svg width={width} height={height} className="absolute top-0 ltr:left-0 rtl:right-0" role="img" aria-hidden>
        {colors.map((c, i) => (
          <rect key={i} x="6" y={height - (i + 1) * step} width={width - 12} height={step + 0.5} fill={c} />
        ))}
        <rect x="6" y="0" width={width - 12} height={height} fill="none" stroke="var(--line)" rx="6" />
        {levels.map((l) => (
          <text key={l.level} x={width / 2} y={y(l.level) + 4} textAnchor="middle" fontSize="10" fill={l.level >= 7 ? '#1D1A1C' : '#F2ECE6'} className="num">
            {l.level}
          </text>
        ))}
        {markers.map((m) => (
          <g key={m.key}>
            <path d={`M0 ${y(m.lv) - 6} L7 ${y(m.lv)} L0 ${y(m.lv) + 6} Z`} fill="var(--plum)" transform={`translate(${width - 7} 0)`} />
            <circle cx={width - 4} cy={y(m.lv)} r={m.strong ? 4 : 3} fill="var(--plum)" />
          </g>
        ))}
      </svg>
      {!compact
        ? markers.map((m) => (
            <span
              key={m.key}
              className={`absolute whitespace-nowrap text-[13px] ${m.strong ? 'font-semibold text-plum' : 'text-ink2'} ltr:left-[48px] rtl:right-[48px]`}
              style={{ top: m.ly - 10 }}
            >
              {m.label} <span className="num">{m.lv}</span>
            </span>
          ))
        : null}
    </div>
  );
}
