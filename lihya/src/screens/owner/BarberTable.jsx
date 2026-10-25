import { useT } from '../../lib/i18n/useT.js';
import EmptyState from '../../components/EmptyState.jsx';
import Skeleton from '../../components/Skeleton.jsx';
import { formatDecision, isNum, oneDecimal } from './util.js';

function Dash({ label }) {
  return (
    <>
      <span aria-hidden="true">–</span>
      <span className="sr-only">{label}</span>
    </>
  );
}

/**
 * Per-barber numbers for the period: consultations, approvals, average decision time and
 * average rating. A table from tablet width up, stacked rows on phones.
 */
export default function BarberTable({ rows, loading = false, caption }) {
  const { t } = useT();
  const none = t('owner.none');

  if (loading) {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-2">
        <span className="sr-only">{t('common.loading')}</span>
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return <EmptyState icon="users" title={t('owner.dash.barbers.emptyTitle')} message={t('owner.dash.barbers.empty')} className="py-6" />;
  }

  const decision = (r) => (isNum(r.avgDecisionSeconds) ? formatDecision(r.avgDecisionSeconds, t) : <Dash label={none} />);
  const rating = (r) => (isNum(r.avgRating) ? oneDecimal(r.avgRating) : <Dash label={none} />);

  return (
    <>
      <table className="hidden w-full border-collapse text-start md:table">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-line text-sm text-text-2">
            <th scope="col" className="py-2 pe-3 text-start font-medium">
              {t('report.daily.col.barber')}
            </th>
            <th scope="col" className="px-3 py-2 text-end font-medium">
              {t('report.daily.col.consultations')}
            </th>
            <th scope="col" className="px-3 py-2 text-end font-medium">
              {t('report.daily.col.approvals')}
            </th>
            <th scope="col" className="px-3 py-2 text-end font-medium">
              {t('report.daily.col.decision')}
            </th>
            <th scope="col" className="ps-3 py-2 text-end font-medium">
              {t('report.daily.col.rating')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.uid || 'unknown'} className="border-b border-line/60 last:border-b-0">
              <th scope="row" className="max-w-[16rem] truncate py-3 pe-3 text-start font-medium text-text">
                <bdi>{r.name || t('owner.unknownBarber')}</bdi>
              </th>
              <td className="num px-3 py-3 text-end">{r.consultations}</td>
              <td className="num px-3 py-3 text-end">{r.approvals}</td>
              <td className="num px-3 py-3 text-end">{decision(r)}</td>
              <td className="num ps-3 py-3 text-end">{rating(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="flex flex-col divide-y divide-line md:hidden">
        {rows.map((r) => (
          <li key={r.uid || 'unknown'} className="py-3 first:pt-0 last:pb-0">
            <p className="truncate font-medium text-text">
              <bdi>{r.name || t('owner.unknownBarber')}</bdi>
            </p>
            <dl className="mt-2 grid grid-cols-[1fr_1fr_1.6fr_1fr] gap-2 text-center">
              <div className="min-w-0">
                <dt className="truncate text-xs text-text-2">{t('owner.dash.barbers.short.consultations')}</dt>
                <dd className="num text-base font-semibold">{r.consultations}</dd>
              </div>
              <div className="min-w-0">
                <dt className="truncate text-xs text-text-2">{t('owner.dash.barbers.short.approvals')}</dt>
                <dd className="num text-base font-semibold">{r.approvals}</dd>
              </div>
              <div className="min-w-0">
                <dt className="truncate text-xs text-text-2">{t('owner.dash.barbers.short.decision')}</dt>
                <dd className="num whitespace-nowrap text-base font-semibold">{decision(r)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="truncate text-xs text-text-2">{t('owner.dash.barbers.short.rating')}</dt>
                <dd className="num text-base font-semibold">{rating(r)}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
