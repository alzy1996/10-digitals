// "At a glance" block of the Cut Card screen (PRD 9.2: Cut Card numbers 32 to 48 px,
// tabular): the target length and guard per zone, big enough to read from the chair
// with the clippers in hand, then the cheek line and neckline heights.

import { useT } from '../../lib/i18n/useT.js';
import { getLineOption } from '../../lib/look.js';
import { cx } from '../../components/kit.js';
import { groupRows, guardLabel, itemLabel, mmNumber, neckWords } from './cardText.js';

function BigMm({ mm, size = 'lg' }) {
  const { t } = useT();
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className={cx('num font-display font-semibold leading-none text-text', size === 'lg' ? 'text-[44px]' : 'text-[34px]')}>
        {mmNumber(mm)}
      </span>
      <span className="text-base text-text-2">{t('common.mm')}</span>
    </span>
  );
}

export default function CutGlance({ card, className }) {
  const { t, lang, pick } = useT();
  const items = groupRows(card && card.rows);
  const kept = items.filter((i) => !i.shaved);
  const shaved = items.filter((i) => i.shaved);
  const cheek = (card && card.cheekLine) || {};
  const cheekOpt = getLineOption('cheek', cheek.type);
  const neck = neckWords(t, card && card.neckline);
  const sep = lang === 'ar' ? '، ' : ', ';

  return (
    <section aria-labelledby="glance-title" className={cx('rounded-card border border-line bg-surface p-4', className)}>
      <h2 id="glance-title" className="text-lg">
        {t('approve.card.glance')}
      </h2>
      <p className="text-sm text-text-2">{t('approve.card.glanceHint')}</p>

      {kept.length ? (
        <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-ctl border border-line bg-line sm:grid-cols-3">
          {kept.map((i) => (
            <div key={i.id} className="flex min-w-0 flex-col gap-1 bg-surface px-3 py-3">
              <dt className="min-w-0 text-sm leading-snug text-text-2">
                <span className="me-1.5 inline-block h-2 w-2 rounded-full bg-keep align-middle" aria-hidden="true" />
                {itemLabel(t, i)}
                {i.pair ? <span className="block text-xs">{t('approve.group.both')}</span> : null}
              </dt>
              <dd>
                <BigMm mm={i.mm} />
              </dd>
              <dd className="text-base font-semibold text-brass">
                <bdi>{guardLabel(lang, t, i.guard)}</bdi>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {shaved.length ? (
        <p className="mt-3 flex items-start gap-2 text-base text-text">
          <span className="mt-2 inline-block h-2 w-2 shrink-0 rounded-full bg-cut" aria-hidden="true" />
          <span>{t('approve.card.shaveZones', { zones: shaved.map((i) => itemLabel(t, i)).join(sep) })}</span>
        </p>
      ) : null}

      <hr className="rule-brass my-4" />

      <dl className="grid grid-cols-2 gap-4">
        <div className="min-w-0">
          <dt className="text-sm text-text-2">{t('report.cut.cheekLine')}</dt>
          <dd className="mt-1">
            {Number.isFinite(cheek.mmAboveJaw) ? <BigMm mm={cheek.mmAboveJaw} size="md" /> : <span className="text-text">—</span>}
          </dd>
          <dd className="text-sm leading-snug text-text-2">
            {cheekOpt ? `${pick(cheekOpt.name)}${sep}` : ''}
            {t('approve.card.aboveJaw')}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-sm text-text-2">{t('report.cut.neckline')}</dt>
          <dd className="mt-1">
            {neck.mm !== null ? <BigMm mm={neck.mm} size="md" /> : <span className="text-lg font-semibold text-text">{neck.words}</span>}
          </dd>
          {neck.mm !== null ? (
            <dd className="text-sm leading-snug text-text-2">
              {neck.words}
              {sep}
              {t('approve.card.aboveApple')}
            </dd>
          ) : null}
        </div>
      </dl>
    </section>
  );
}
