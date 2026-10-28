import Icon from './Icon.jsx';
import Skeleton from './Skeleton.jsx';
import { formatPercent } from '../lib/format.js';
import { pickLang } from '../lib/i18n.js';
import { LIMITS } from '../lib/config.js';
import { clamp, cx, useOptionalT } from './kit.js';

// Reason and warning tags wrap onto a second line instead of being cut with an ellipsis
// (a phone card is narrow and the customer must be able to read why a style is shown).
// The 14 px radius keeps a one-line tag a pill and gives a two-line tag soft corners.
const TAG = 'inline-flex max-w-full items-start gap-1 whitespace-normal break-words rounded-[14px] border px-2.5 py-1 text-xs font-medium leading-snug';
const TAG_TONES = {
  default: 'border-line bg-surface2 text-ink',
  warn: 'border-warn bg-surface2 text-warn',
};

function Tag({ tone = 'default', icon, children }) {
  return (
    <span className={cx(TAG, TAG_TONES[tone] || TAG_TONES.default)}>
      {icon ? <Icon name={icon} size={14} className="mt-px shrink-0" /> : null}
      <span className="min-w-0">{children}</span>
    </span>
  );
}

/**
 * Style card (PRD 9.6): 4:5 photo-on-face thumbnail (skeleton while it renders), the style name
 * in both languages (current language first), Grow-ability % with a bar, up to 3 reason chips
 * and the warning chips. Selected = brass border.
 * `reasonLabels` / `warningLabels`: texts already translated by the caller; when missing, the
 * component translates ranked.reasons / ranked.warnings ({ key, vars }) itself.
 * `omitReasonIds`: reason ids the caller already shows elsewhere on the card (the trim
 * interval badge on the photo, for the 'low_maint' reason), so nothing is said twice.
 */
export default function StyleCard({
  ranked,
  thumb,
  selected = false,
  onClick,
  reasonLabels,
  warningLabels,
  omitReasonIds,
  disabled = false,
  className,
}) {
  const { t, lang } = useOptionalT();
  const style = (ranked && ranked.style) || {};
  const other = lang === 'ar' ? 'en' : 'ar';
  const primary = pickLang(lang, style.name) || style.id || '';
  const secondary = pickLang(other, style.name);
  const g =
    ranked && ranked.growability != null && !ranked.growUnknown && Number.isFinite(Number(ranked.growability))
      ? clamp(Math.round(Number(ranked.growability)), 0, 100)
      : null;
  const omit = new Set(Array.isArray(omitReasonIds) ? omitReasonIds : []);
  const reasons = (reasonLabels || ((ranked && ranked.reasons) || []).filter((r) => !omit.has(r.id)).map((r) => t(r.key, r.vars)))
    .filter(Boolean)
    .slice(0, LIMITS.maxReasonChips);
  const warnings = (warningLabels || ((ranked && ranked.warnings) || []).map((w) => t(w.key, w.vars))).filter(Boolean);
  const interactive = typeof onClick === 'function';
  const Comp = interactive ? 'button' : 'div';

  return (
    <Comp
      type={interactive ? 'button' : undefined}
      onClick={interactive ? onClick : undefined}
      disabled={interactive ? disabled : undefined}
      aria-pressed={interactive ? Boolean(selected) : undefined}
      className={cx(
        'flex w-full min-w-0 flex-col overflow-hidden rounded-card border bg-surface text-start',
        interactive && 'press disabled:opacity-40',
        selected ? 'border-plum outline outline-1 outline-plum' : 'border-line',
        className,
      )}
    >
      <div className="relative aspect-[4/5] w-full bg-surface2">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <Skeleton rounded="none" className="absolute inset-0" />
        )}
        {selected ? (
          <span className="absolute end-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-plum text-onplum">
            <Icon name="check" size={18} />
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate font-semibold leading-snug text-ink">{primary}</p>
          {secondary && secondary !== primary ? (
            <p lang={other} className="truncate text-xs leading-snug text-ink2">
              {secondary}
            </p>
          ) : null}
        </div>

        {g !== null ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-xs text-ink2">
              <span className="truncate">{t('beard.ui.growability')}</span>
              <span className={cx('num font-semibold', g < 40 ? 'text-warn' : 'text-ink')}>{formatPercent(g, lang)}</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-line" aria-hidden="true">
              <div className={cx('h-full rounded-full', g < 40 ? 'bg-warn' : 'bg-plum')} style={{ width: `${g}%` }} />
            </div>
          </div>
        ) : null}

        {reasons.length || warnings.length ? (
          <div className="flex flex-wrap gap-1.5">
            {reasons.map((text, i) => (
              <Tag key={`r${i}`}>{text}</Tag>
            ))}
            {warnings.map((text, i) => (
              <Tag key={`w${i}`} tone="warn" icon="warning">
                {text}
              </Tag>
            ))}
          </div>
        ) : null}
      </div>
    </Comp>
  );
}
