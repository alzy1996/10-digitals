import { useT } from '../lib/i18n/useT.js';
import { Tag } from './Chip.jsx';

export default function LookCard({ src, title, subtitle, reasons = [], score, onClick, selected, badge }) {
  const { name } = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press card group block w-full overflow-hidden text-start ${selected ? 'outline outline-2 outline-plum' : ''}`}
    >
      <div className="relative aspect-[4/5] w-full bg-surface2">
        {src ? <img src={src} alt="" className="h-full w-full object-cover" draggable={false} /> : null}
        {badge ? <span className="absolute top-3 rounded-full bg-surface px-3 py-1 text-xs font-semibold text-ink ltr:left-3 rtl:right-3">{badge}</span> : null}
        {score !== undefined ? (
          <span className="num absolute bottom-3 rounded-full bg-plum px-3 py-1 text-xs font-semibold text-onplum ltr:right-3 rtl:left-3">{Math.round(score)}</span>
        ) : null}
      </div>
      <div className="p-4">
        <div className="font-display text-lg leading-tight">{typeof title === 'string' ? title : name(title)}</div>
        {subtitle ? <div className="mt-0.5 text-sm text-ink2">{subtitle}</div> : null}
        {reasons.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {reasons.slice(0, 3).map((r) => (
              <Tag key={r.key}>{name(r.text)}</Tag>
            ))}
          </div>
        ) : null}
      </div>
    </button>
  );
}
