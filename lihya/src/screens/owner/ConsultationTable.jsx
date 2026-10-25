import { pickLang, useT } from '../../lib/i18n/useT.js';
import { staffNameOf, styleNameOf, isApproved } from '../../reports/summary.js';
import Chip from '../../components/Chip.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import RatingDots from '../../components/RatingDots.jsx';
import Skeleton from '../../components/Skeleton.jsx';
import { clockTime, formatDecision, isNum, shortDay } from './util.js';

export const PREVIEW_MAX = 200;

const STATUS_TONE = { draft: 'default', approved: 'info', done: 'keep', cancelled: 'cut' };

function Dash({ label }) {
  return (
    <>
      <span aria-hidden="true">–</span>
      <span className="sr-only">{label}</span>
    </>
  );
}

/** Row values shared by the table, the phone list and the printed report. */
export function rowView(c, { staff, styles, lang, t }) {
  const decision = isApproved(c) && isNum(c.decisionSeconds) ? formatDecision(c.decisionSeconds, t) : '';
  return {
    id: c.id,
    day: c.dayKey ? shortDay(c.dayKey, lang) : '',
    time: c.startedAt ? clockTime(c.startedAt, lang) : '',
    barber: staffNameOf(c.barberUid, staff) || t('owner.unknownBarber'),
    style: c.styleId ? pickLang(lang, styleNameOf(c.styleId, styles)) : t('owner.rep.table.noStyle'),
    status: c.status || 'draft',
    statusLabel: t(`report.status.${c.status || 'draft'}`),
    decision,
    rating: isNum(c.rating) ? Number(c.rating) : null,
    demo: c.demo === true,
  };
}

/**
 * Preview of the selected range, newest first: date, barber, style, status, decision time,
 * rating. A table from tablet width up, a list on phones; at most PREVIEW_MAX rows.
 */
export default function ConsultationTable({ consultations, staff, styles, loading = false }) {
  const { t, lang } = useT();
  const none = t('owner.none');

  if (loading) {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-2">
        <span className="sr-only">{t('common.loading')}</span>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!consultations.length) {
    return <EmptyState icon="list" title={t('owner.rep.table.emptyTitle')} message={t('owner.rep.table.empty')} className="py-8" />;
  }

  const newest = [...consultations].reverse();
  const rows = newest.slice(0, PREVIEW_MAX).map((c) => rowView(c, { staff, styles, lang, t }));

  return (
    <div className="flex flex-col gap-3">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-start text-sm">
          <caption className="sr-only">{t('owner.rep.table.caption')}</caption>
          <thead>
            <tr className="border-b border-line text-text-2">
              <th scope="col" className="py-2 pe-3 text-start font-medium">
                {t('report.csv.col.date')}
              </th>
              <th scope="col" className="px-3 py-2 text-start font-medium">
                {t('report.csv.col.barber')}
              </th>
              <th scope="col" className="px-3 py-2 text-start font-medium">
                {t('report.csv.col.style')}
              </th>
              <th scope="col" className="px-3 py-2 text-start font-medium">
                {t('report.csv.col.status')}
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-2 text-end font-medium">
                {t('owner.rep.table.decisionShort')}
              </th>
              <th scope="col" className="ps-3 py-2 text-end font-medium">
                {t('report.csv.col.rating')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line/60 last:border-b-0 [&>td]:align-top">
                <td className="num whitespace-nowrap py-2.5 pe-3 text-text-2">
                  <span className="text-text">{r.day}</span> <bdi>{r.time}</bdi>
                </td>
                <td className="max-w-[10rem] truncate px-3 py-2.5">
                  <bdi>{r.barber}</bdi>
                </td>
                <td className="max-w-[14rem] px-3 py-2.5">
                  <span className="flex flex-col items-start gap-1">
                    <span className="max-w-full truncate">
                      <bdi>{r.style}</bdi>
                    </span>
                    {r.demo ? (
                      <Chip size="sm" tone="info">
                        {t('common.demo')}
                      </Chip>
                    ) : null}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <Chip size="sm" tone={STATUS_TONE[r.status] || 'default'}>
                    {r.statusLabel}
                  </Chip>
                </td>
                <td className="num whitespace-nowrap px-3 py-2.5 text-end">{r.decision || <Dash label={none} />}</td>
                <td className="num ps-3 py-2.5 text-end">{r.rating === null ? <Dash label={none} /> : r.rating}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col divide-y divide-line md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-col gap-1.5 py-3 first:pt-0">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-medium text-text">
                <bdi>{r.style}</bdi>
              </span>
              {r.demo ? (
                <Chip size="sm" tone="info">
                  {t('common.demo')}
                </Chip>
              ) : null}
              <Chip size="sm" tone={STATUS_TONE[r.status] || 'default'}>
                {r.statusLabel}
              </Chip>
            </div>
            <div className="num flex flex-wrap items-center gap-x-2 text-sm text-text-2">
              <span>
                {r.day} <bdi>{r.time}</bdi>
              </span>
              <span aria-hidden="true">·</span>
              <span className="min-w-0 truncate">
                <bdi>{r.barber}</bdi>
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="num text-text">
                {t('owner.rep.table.decisionShort')}: {r.decision || <Dash label={none} />}
              </span>
              {r.rating !== null ? <RatingDots value={r.rating} readOnly className="ms-auto" /> : null}
            </div>
          </li>
        ))}
      </ul>

      {consultations.length > PREVIEW_MAX ? (
        <p className="text-sm text-text-2">{t('owner.rep.table.more', { shown: PREVIEW_MAX, total: consultations.length })}</p>
      ) : null}
    </div>
  );
}
