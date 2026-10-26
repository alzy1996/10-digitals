// Shared building blocks for the owner screens: section cards, a +/- stepper with
// press-and-hold repeat, notes and a usage meter. Token colors and logical utilities only.

import { useEffect, useId, useRef } from 'react';
import Icon from '../../components/Icon.jsx';
import { cx } from '../../components/kit.js';

/** Card section with an h2 (or h3) heading, optional description and header actions. */
export function Section({ title, description, icon, actions, children, className, level = 2, id, anchor, bodyClassName }) {
  const autoId = useId();
  const headingId = id || `sec${autoId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const H = level === 3 ? 'h3' : 'h2';
  return (
    <section
      id={anchor}
      aria-labelledby={headingId}
      className={cx('flex min-w-0 scroll-mt-4 flex-col rounded-card border border-line bg-surface', className)}
    >
      <div className="flex items-start gap-3 px-4 pb-3 pt-4">
        {icon ? (
          <span aria-hidden="true" className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-ctl border border-brass/50 text-brass">
            <Icon name={icon} size={20} />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <H id={headingId} className="text-lg leading-snug sm:text-xl">
            {title}
          </H>
          {description ? <p className="mt-1 text-sm text-text-2">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </div>
      <hr className="rule-brass mx-4" />
      <div className={cx('flex flex-col gap-4 p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

const NOTE_TONES = {
  info: { box: 'border-info/50 bg-info/10', ink: 'text-info', icon: 'info' },
  warn: { box: 'border-warn/50 bg-warn/10', ink: 'text-warn', icon: 'warning' },
  keep: { box: 'border-keep/50 bg-keep/10', ink: 'text-keep', icon: 'check' },
  cut: { box: 'border-cut/50 bg-cut/10', ink: 'text-cut', icon: 'warning' },
  plain: { box: 'border-line bg-surface-2', ink: 'text-text-2', icon: 'info' },
};

/** Bordered note with an icon; `action` sits at the end (a link or button). */
export function Note({ tone = 'info', icon, title, children, action, className, role, stack = false }) {
  const look = NOTE_TONES[tone] || NOTE_TONES.info;
  return (
    <div role={role} className={cx('flex flex-col gap-3 rounded-ctl border p-3', !stack && 'sm:flex-row sm:items-center', look.box, className)}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Icon name={icon || look.icon} size={20} className={cx('mt-0.5 shrink-0', look.ink)} />
        <div className="min-w-0 flex-1 text-sm leading-relaxed text-text">
          {title ? <p className="font-semibold">{title}</p> : null}
          {children}
        </div>
      </div>
      {action ? <div className={cx('shrink-0 ps-8', !stack && 'sm:ps-0')}>{action}</div> : null}
    </div>
  );
}

/** Horizontal usage meter (0..1), brass fill; turns warn from 80% and cut at 100%. */
export function Meter({ value, label, className }) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  const tone = v >= 1 ? 'bg-cut' : v >= 0.8 ? 'bg-warn' : 'bg-brass';
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className={cx('h-2 w-full overflow-hidden rounded-full bg-surface-2', className)}
    >
      <div className={cx('h-full rounded-full transition-[width] duration-[var(--dur-sheet)] ease-out', tone)} style={{ width: `${v * 100}%` }} />
    </div>
  );
}

const HOLD_DELAY_MS = 420;
const HOLD_EVERY_MS = 70;

function decimalsOf(step) {
  const s = String(step);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

function snap(v, min, max, step) {
  const d = Math.max(decimalsOf(step), 2);
  return Math.min(max, Math.max(min, Number(Number(v).toFixed(d))));
}

/** One stepper button: a tap moves one step, press-and-hold repeats (keyboard: Enter/Space). */
function StepButton({ icon, label, disabled, onStep }) {
  const timer = useRef(0);
  const interval = useRef(0);
  const stepRef = useRef(onStep);
  stepRef.current = onStep;

  const stop = () => {
    clearTimeout(timer.current);
    clearInterval(interval.current);
  };
  useEffect(() => stop, []);
  useEffect(() => {
    if (disabled) stop();
  }, [disabled]);

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onPointerDown={(e) => {
        if (e.button !== undefined && e.button !== 0) return;
        stepRef.current();
        stop();
        timer.current = setTimeout(() => {
          interval.current = setInterval(() => stepRef.current(), HOLD_EVERY_MS);
        }, HOLD_DELAY_MS);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        // Pointer taps already stepped on pointerdown; keyboard activation has detail 0.
        if (e.detail === 0) stepRef.current();
      }}
      className="press inline-flex h-11 w-11 shrink-0 touch-none items-center justify-center rounded-ctl border border-line text-text active:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon name={icon} size={22} />
    </button>
  );
}

/**
 * Number stepper: [-] value [+]. The value is a spinbutton (arrow keys, Home/End).
 * `format(value)` renders the value text; `size` 'md' (default) or 'sm' for table rows.
 */
export function Stepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  label,
  labelledBy,
  decLabel,
  incLabel,
  disabled = false,
  invalid = false,
  className,
  valueClassName,
}) {
  const v = Number(value);
  const set = (next) => {
    if (disabled || !onChange) return;
    const s = snap(next, min, max, step);
    if (s !== v) onChange(s);
  };
  const latest = useRef(v);
  latest.current = v;
  const dec = () => set(latest.current - step);
  const inc = () => set(latest.current + step);
  const text = format ? format(v) : String(v);

  const onKeyDown = (e) => {
    const map = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: step * 5, PageDown: -step * 5 };
    if (e.key === 'Home') set(min);
    else if (e.key === 'End') set(max);
    else if (map[e.key] !== undefined) {
      const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
      const delta = rtl && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') ? -map[e.key] : map[e.key];
      set(v + delta);
    } else return;
    e.preventDefault();
  };

  return (
    <div className={cx('inline-flex items-center gap-1.5', className)}>
      <StepButton icon="minus" label={decLabel} disabled={disabled || v <= min} onStep={dec} />
      <div
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        aria-valuenow={v}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={text}
        aria-invalid={invalid || undefined}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        className={cx(
          'num flex h-11 items-center justify-center whitespace-nowrap rounded-ctl border bg-surface-2 text-center font-semibold',
          invalid ? 'border-cut text-cut' : 'border-line text-text',
          valueClassName || 'min-w-[76px] px-2 text-base',
        )}
      >
        <bdi>{text}</bdi>
      </div>
      <StepButton icon="plus" label={incLabel} disabled={disabled || v >= max} onStep={inc} />
    </div>
  );
}

/** Label + description on the start side, a control on the end side (wraps on small phones). */
export function SettingRow({ label, labelId, description, children, className }) {
  return (
    <div className={cx('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="min-w-0 flex-1">
        <div id={labelId} className="text-base font-medium leading-snug text-text">
          {label}
        </div>
        {description ? <p className="mt-0.5 text-sm text-text-2">{description}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
