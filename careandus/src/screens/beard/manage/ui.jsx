// Small building blocks shared by the catalog, products and staff screens.
// Token colors and logical utilities only, so everything mirrors in Arabic.

import { useEffect, useId, useState } from 'react';
import Icon from '../ui/Icon.jsx';
import { cx } from '../ui/kit.js';

/** Card with a heading, an optional line under it, header actions and a brass hairline (PRD 9.5). */
export function Card({ title, description, icon, actions, children, className, bodyClassName, level = 2, id, headingRef, as = 'section' }) {
  const autoId = useId();
  const headingId = `mc${autoId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const H = level === 3 ? 'h3' : 'h2';
  const Box = as;
  return (
    <Box id={id} aria-labelledby={headingId} className={cx('flex min-w-0 scroll-mt-4 flex-col rounded-card border border-line bg-surface', className)}>
      <div className="flex items-start gap-3 px-4 pb-3 pt-4">
        {icon ? (
          <span aria-hidden="true" className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-plum text-plum">
            <Icon name={icon} size={20} />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <H id={headingId} ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="text-lg leading-snug outline-none sm:text-xl">
            {title}
          </H>
          {description ? <p className="mt-1 text-sm text-ink2">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </div>
      <hr className="rule-clay mx-4" />
      <div className={cx('flex flex-col gap-4 p-4', bodyClassName)}>{children}</div>
    </Box>
  );
}

const NOTE_TONES = {
  info: { box: 'border-clay bg-surface2', ink: 'text-clay', icon: 'info' },
  warn: { box: 'border-warn bg-surface2', ink: 'text-warn', icon: 'warning' },
  keep: { box: 'border-ok bg-surface2', ink: 'text-ok', icon: 'check' },
  cut: { box: 'border-risk bg-surface2', ink: 'text-risk', icon: 'warning' },
  plain: { box: 'border-line bg-surface2', ink: 'text-ink2', icon: 'info' },
};

/** Bordered note with an icon. */
export function Note({ tone = 'info', icon, title, children, className, role }) {
  const look = NOTE_TONES[tone] || NOTE_TONES.info;
  return (
    <div role={role} className={cx('flex items-start gap-3 rounded-control border p-3', look.box, className)}>
      <Icon name={icon || look.icon} size={20} className={cx('mt-0.5 shrink-0', look.ink)} />
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-ink">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}

/** Polite live region for short announcements (reorders, saves) that have no snackbar. */
export function LiveRegion({ message }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}

/** True while the media query matches (for example the desktop layout at 1024 px). */
export function useMediaQuery(query) {
  const get = () => {
    try {
      return typeof window !== 'undefined' && window.matchMedia(query).matches;
    } catch {
      return false;
    }
  };
  const [match, setMatch] = useState(get);
  useEffect(() => {
    let mql;
    try {
      mql = window.matchMedia(query);
    } catch {
      return undefined;
    }
    const on = () => setMatch(mql.matches);
    on();
    if (mql.addEventListener) mql.addEventListener('change', on);
    else mql.addListener(on);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', on);
      else mql.removeListener(on);
    };
  }, [query]);
  return match;
}

/** Card-shaped shimmer rows with the step name read out (PRD 8.5). */
export function ListSkeleton({ label, rows = 4, className, rowClassName = 'h-40' }) {
  return (
    <div role="status" aria-busy="true" className={cx('flex flex-col gap-3', className)}>
      <p className="flex items-center gap-2 text-sm text-ink2">
        <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-plum motion-reduce:animate-none" />
        {label}
      </p>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden="true" className={cx('rounded-card border border-line bg-surface2', rowClassName)} style={{ animation: 'pulse-soft 1.2s infinite' }} />
      ))}
    </div>
  );
}
