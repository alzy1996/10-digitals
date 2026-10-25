import Chip from '../../components/Chip.jsx';
import Icon from '../../components/Icon.jsx';
import { useT } from '../../lib/i18n/useT.js';
import { addDaysToKey, dayKey, formatMuscat, toDate } from '../../lib/time.js';
import { formatPercent } from '../../lib/format.js';

/** "Last visit today / yesterday / 24 Oct 2026" on the Muscat calendar. */
export function lastVisitText(at, lang, t) {
  if (!at) return t('entry.home.noVisit');
  const d = toDate(at);
  if (Number.isNaN(d.getTime())) return t('entry.home.noVisit');
  const key = dayKey(d);
  const today = dayKey(new Date());
  let date;
  if (key === today) date = t('entry.home.today');
  else if (key === addDaysToKey(today, -1)) date = t('entry.home.yesterday');
  else date = formatMuscat(d, lang, { dateStyle: 'medium' });
  return t('entry.home.lastVisit', { date });
}

function monogram(name) {
  const first = Array.from(String(name || '').trim())[0];
  return first ? first.toUpperCase() : '';
}

/**
 * One client as a big tappable row (72 px): monogram, name, last visit (Muscat) and the
 * coarse labels saved with consent (face shape, age band, grow-ability). Demo clients
 * carry a Demo badge.
 */
export default function ClientRow({ client, onPick, disabled }) {
  const { t, lang } = useT();
  const p = client.profile || {};
  const chips = [];
  if (client.demo) chips.push({ key: 'demo', label: t('common.demo'), tone: 'info' });
  if (p.faceShape) chips.push({ key: 'face', label: t(`face.${p.faceShape}`) });
  // Number ranges keep their reading order inside Arabic text.
  if (p.ageBand) chips.push({ key: 'age', label: `\u2066${t(`age.${p.ageBand}`)}\u2069` });
  if (Number.isFinite(p.growability)) {
    chips.push({ key: 'grow', label: `${t('ui.growability')} ${formatPercent(p.growability, lang)}` });
  }
  const name = client.displayName || t('common.walkIn');

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(client)}
      className="press flex min-h-[72px] w-full items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 text-start active:bg-surface-2 disabled:opacity-40"
    >
      <span
        aria-hidden="true"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 font-display text-xl leading-none text-text-2"
      >
        {monogram(name)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-base font-medium text-text">
          <bdi>{name}</bdi>
        </span>
        <span className="num text-sm text-text-2">{lastVisitText(client.lastVisitAt, lang, t)}</span>
        {chips.length ? (
          <span className="mt-1 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <Chip key={c.key} size="sm" tone={c.tone || 'default'}>
                {c.label}
              </Chip>
            ))}
          </span>
        ) : null}
      </span>
      <Icon name="chevron-right" size={20} className="shrink-0 text-text-2" />
    </button>
  );
}
