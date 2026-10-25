import { pickLang, useT } from '../../lib/i18n/useT.js';
import Skeleton from '../../components/Skeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';

/**
 * Top styles of the period (approved looks): rank, the name in the screen language with
 * the other language under it, a brass bar and the count.
 */
export default function TopStyles({ items, loading = false, emptyTitle, emptyMessage }) {
  const { t, lang } = useT();
  const other = lang === 'ar' ? 'en' : 'ar';

  if (loading) {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-3">
        <span className="sr-only">{t('common.loading')}</span>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  if (!items.length) {
    return <EmptyState icon="beard" title={emptyTitle} message={emptyMessage} className="py-6" />;
  }

  const max = Math.max(1, ...items.map((s) => s.count));
  return (
    <ol className="flex flex-col gap-3">
      {items.map((s, i) => {
        const name = pickLang(lang, s.name);
        const otherName = pickLang(other, s.name);
        return (
          <li key={s.styleId} className="flex items-center gap-3">
            <span aria-hidden="true" className="num display w-6 shrink-0 text-center text-lg text-text-2">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-medium text-text">
                  <bdi>{name}</bdi>
                  {otherName && otherName !== name ? (
                    <span lang={other} className="ms-2 text-xs font-normal text-text-2">
                      <bdi>{otherName}</bdi>
                    </span>
                  ) : null}
                </span>
                <span className="num shrink-0 text-sm text-text">{t('owner.dash.styles.count', { n: s.count })}</span>
              </div>
              <div aria-hidden="true" className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-brass" style={{ width: `${Math.max(6, (s.count / max) * 100)}%` }} />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
