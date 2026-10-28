// Saved looks in the Studio (max 3): the "Save look" tile with the count first (always in
// view), then small thumbnails to open a look again, a remove button each (the screen
// offers Undo). bleed: a full-width side scroller on phones; wrapped in the side panel.

import Icon from '../ui/Icon.jsx';
import IconButton from '../ui/IconButton.jsx';
import { Spinner } from '../ui/Button.jsx';
import { cx } from '../ui/kit.js';
import { useT } from '../lib/i18n.js';
import { LIMITS } from '../lib/config.js';

export default function SavedLooks({ looks, activeId, onOpen, onRemove, onSave, saving, bleed = true, className }) {
  const { t } = useT();
  const full = looks.length >= LIMITS.maxLooks;
  return (
    <section className={cx('flex flex-col gap-2', className)} aria-label={t('beard.studio.looks.title')}>
      <ul
        className={cx(
          'flex gap-2 py-0.5',
          bleed ? 'px-[var(--gutter)] -mx-[var(--gutter)] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' : 'flex-wrap',
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
              full ? 'border-line text-ink2' : 'border-plum text-ink active:bg-surface2',
            )}
          >
            {saving ? <Spinner size={20} /> : <Icon name={full ? 'check' : 'plus'} size={22} className={full ? '' : 'text-plum'} />}
            <span className="flex flex-col leading-tight">
              <span className="font-semibold">{t('beard.studio.looks.save')}</span>
              <span className="num text-xs text-ink2">
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
                active ? 'border-plum' : 'border-line',
              )}
            >
              <button
                type="button"
                onClick={() => onOpen(look)}
                aria-label={active ? t('beard.studio.looks.active', { n }) : t('beard.studio.looks.open', { n })}
                aria-pressed={active}
                className="press flex h-14 items-center gap-2 rounded-control pe-1 active:bg-surface2"
              >
                <span className="relative block h-14 w-11 overflow-hidden rounded-control bg-surface2">
                  {look.thumb ? (
                    <img src={look.thumb} alt="" draggable={false} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-ink2">
                      <Icon name="beard" size={22} />
                    </span>
                  )}
                </span>
                <span className={cx('num text-sm font-semibold', active ? 'text-plum' : 'text-ink')}>{n}</span>
              </button>
              <IconButton icon="close" label={t('beard.studio.looks.remove', { n })} tone="muted" onClick={() => onRemove(look, n)} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
