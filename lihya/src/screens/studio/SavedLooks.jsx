// Saved looks in the Studio (max 3): the "Save look" tile with the count first (always in
// view), then small thumbnails to open a look again, a remove button each (the screen
// offers Undo). bleed: a full-width side scroller on phones; wrapped in the side panel.

import Icon from '../../components/Icon.jsx';
import IconButton from '../../components/IconButton.jsx';
import { Spinner } from '../../components/Button.jsx';
import { cx } from '../../components/kit.js';
import { useT } from '../../lib/i18n/useT.js';
import { LIMITS } from '../../config/app.js';

export default function SavedLooks({ looks, activeId, onOpen, onRemove, onSave, saving, bleed = true, className }) {
  const { t } = useT();
  const full = looks.length >= LIMITS.maxLooks;
  return (
    <section className={cx('flex flex-col gap-2', className)} aria-label={t('studio.looks.title')}>
      <ul
        className={cx(
          'flex gap-2 py-0.5',
          bleed ? 'gutter -mx-[var(--gutter)] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' : 'flex-wrap',
        )}
      >
        <li className="shrink-0">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            aria-busy={saving || undefined}
            className={cx(
              'press flex h-16 min-w-[132px] items-center gap-2 rounded-card border px-4 text-start disabled:opacity-60',
              full ? 'border-line text-text-2' : 'border-brass text-text active:bg-surface-2',
            )}
          >
            {saving ? <Spinner size={20} /> : <Icon name={full ? 'check' : 'plus'} size={22} className={full ? '' : 'text-brass'} />}
            <span className="flex flex-col leading-tight">
              <span className="font-semibold">{t('studio.looks.save')}</span>
              <span className="num text-xs text-text-2">
                {looks.length}/{LIMITS.maxLooks}
              </span>
            </span>
          </button>
        </li>
        {looks.map((look, i) => {
          const n = i + 1;
          const active = look.id === activeId;
          return (
            <li
              key={look.id}
              className={cx(
                'flex h-16 shrink-0 items-center gap-1 rounded-card border bg-surface ps-1',
                active ? 'border-brass' : 'border-line',
              )}
            >
              <button
                type="button"
                onClick={() => onOpen(look)}
                aria-label={active ? t('studio.looks.active', { n }) : t('studio.looks.open', { n })}
                aria-pressed={active}
                className="press flex h-14 items-center gap-2 rounded-ctl pe-1 active:bg-surface-2"
              >
                <span className="relative block h-14 w-11 overflow-hidden rounded-ctl bg-surface-2">
                  {look.thumb ? (
                    <img src={look.thumb} alt="" draggable={false} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-text-2">
                      <Icon name="beard" size={22} />
                    </span>
                  )}
                </span>
                <span className={cx('num text-sm font-semibold', active ? 'text-brass' : 'text-text')}>{n}</span>
              </button>
              <IconButton icon="close" label={t('studio.looks.remove', { n })} tone="muted" onClick={() => onRemove(look, n)} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
