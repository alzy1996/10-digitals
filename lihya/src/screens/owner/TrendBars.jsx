import { useT } from '../../lib/i18n/useT.js';
import { cx } from '../../components/kit.js';
import { shortDay, weekdayName } from './util.js';

const CHART_H = 132;

/**
 * 7-day mini trend drawn with plain divs: one column per Muscat day, the full bar is
 * consultations (outlined), the brass part is approvals. Today is marked. Screen readers
 * get one sentence per day instead of the drawing.
 */
export default function TrendBars({ days, today, loading = false }) {
  const { t, lang } = useT();
  const max = Math.max(1, ...days.map((d) => d.consultations || 0));
  const total = days.reduce((s, d) => s + (d.consultations || 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <ul className="sr-only">
        {days.map((d) => (
          <li key={d.key}>
            {t('owner.dash.trend.day', { day: shortDay(d.key, lang), n: d.consultations || 0, a: d.approvals || 0 })}
          </li>
        ))}
      </ul>
      <div className="relative">
        {!loading && total === 0 ? (
          <p className="absolute inset-x-0 top-1/3 z-10 px-4 text-center text-sm text-text-2">{t('owner.dash.trend.empty')}</p>
        ) : null}
        <div aria-hidden="true" className="flex items-end gap-1.5" style={{ height: CHART_H + 44 }}>
          {days.map((d) => {
            const c = d.consultations || 0;
            const a = Math.min(c, d.approvals || 0);
            const h = loading ? 0 : Math.round((c / max) * CHART_H);
            const ah = c ? Math.round((a / c) * h) : 0;
            const isToday = d.key === today;
            return (
              <div key={d.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <span className={cx('num text-xs', c ? 'text-text' : 'text-text-2')}>{loading ? '' : c}</span>
                <div className="relative flex w-full max-w-[44px] items-end" style={{ height: CHART_H }}>
                  <div
                    className={cx(
                      'relative w-full overflow-hidden rounded-t-[6px] border transition-[height] duration-[var(--dur-sheet)] ease-out',
                      c ? 'border-line bg-surface-2' : 'border-transparent bg-transparent',
                    )}
                    style={{ height: Math.max(c ? 4 : 0, h) }}
                  >
                    <div className="absolute inset-x-0 bottom-0 bg-brass" style={{ height: ah }} />
                  </div>
                  {!c && !loading ? <div className="absolute inset-x-0 bottom-0 h-px bg-line" /> : null}
                </div>
                <span
                  className={cx(
                    'w-full truncate text-center text-xs',
                    isToday ? 'font-semibold text-brass' : 'text-text-2',
                  )}
                >
                  {isToday ? t('owner.dash.trend.today') : weekdayName(d.key, lang)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-2">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-3 rounded-sm border border-line bg-surface-2" />
          {t('owner.dash.trend.legendAll')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-3 rounded-sm bg-brass" />
          {t('owner.dash.trend.legendApproved')}
        </span>
        <span className="ms-auto num">{t('owner.dash.trend.total', { n: total })}</span>
      </div>
    </div>
  );
}
