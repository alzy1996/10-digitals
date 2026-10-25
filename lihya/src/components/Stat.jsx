import Icon from './Icon.jsx';
import Skeleton from './Skeleton.jsx';
import { cx } from './kit.js';

const TONES = { default: 'text-text', brass: 'text-brass', keep: 'text-keep', cut: 'text-cut', warn: 'text-warn', info: 'text-info' };

/**
 * KPI tile for the owner dashboard: label, big tabular value (display face), optional
 * sub line (for example "of 20" or "vs yesterday"). `loading` shows a skeleton value.
 */
export default function Stat({ label, value, sub, icon, tone = 'default', loading = false, className }) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-2 rounded-card border border-line bg-surface p-4', className)}>
      <div className="flex min-w-0 items-center gap-2 text-sm text-text-2">
        {icon ? <Icon name={icon} size={18} /> : null}
        <span className="truncate">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-9 w-24" />
      ) : (
        <div className={cx('display num truncate text-2xl font-semibold leading-none', TONES[tone] || TONES.default)}>
          <bdi>{value}</bdi>
        </div>
      )}
      {sub ? <div className="truncate text-xs text-text-2">{sub}</div> : null}
    </div>
  );
}
