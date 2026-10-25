import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import IconButton from './IconButton.jsx';
import { cx, useOptionalT } from './kit.js';

const CLOSE_DISTANCE = 96; // px dragged down that closes the sheet
const CLOSE_VELOCITY = 0.6; // px per ms flick that closes it
const EXIT_MS = 260;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const SNAP = {
  auto: 'max-h-[85dvh]',
  half: 'h-[50dvh]',
  full: 'h-[92dvh]',
};

/**
 * Bottom sheet (PRD 9.6): 16 px top radius, drag handle, one control group per sheet state.
 * Escape closes, swipe down on the handle or title closes, focus is trapped while open and
 * returns to the opener on close. snap: 'auto' (content height, max 85 %) | 'half' | 'full'.
 * modal={false} drops the backdrop and the focus trap so the canvas behind stays visible and
 * usable (Studio controls).
 */
export default function Sheet({ open, onClose, title, children, snap = 'auto', modal = true, footer, className }) {
  const { t } = useOptionalT();
  const titleId = useId();
  const panelRef = useRef(null);
  const restoreRef = useRef(null);
  const dragRef = useRef(null);
  const [mounted, setMounted] = useState(Boolean(open));
  const [shown, setShown] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);

  const close = useCallback(() => {
    if (onClose) onClose();
  }, [onClose]);

  // Mount, animate in, animate out, unmount.
  useEffect(() => {
    if (open) {
      setMounted(true);
      setDragY(0);
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setShown(false);
    const timer = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // Focus in, focus back out.
  useEffect(() => {
    if (!open || !mounted) return undefined;
    restoreRef.current = document.activeElement;
    const panel = panelRef.current;
    if (modal && panel) {
      const first = panel.querySelector('[data-autofocus]') || panel;
      first.focus({ preventScroll: true });
    }
    return () => {
      const el = restoreRef.current;
      if (modal && el && typeof el.focus === 'function' && document.contains(el)) el.focus({ preventScroll: true });
    };
  }, [open, mounted, modal]);

  // Page behind does not scroll while a modal sheet is open.
  useEffect(() => {
    if (!open || !modal) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, modal]);

  // Escape closes (modal or not).
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  const onKeyDown = (e) => {
    if (!modal || e.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = Array.from(panel.querySelectorAll(FOCUSABLE)).filter((el) => el.tabIndex >= 0 && el.offsetParent !== null);
    if (items.length === 0) {
      e.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const onDragStart = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('button')) return;
    dragRef.current = { id: e.pointerId, y0: e.clientY, t0: performance.now(), dy: 0 };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // best effort
    }
    setDragging(true);
  };
  const onDragMove = (e) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    d.dy = Math.max(0, e.clientY - d.y0);
    setDragY(d.dy);
  };
  const onDragEnd = (e) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    const elapsed = Math.max(1, performance.now() - d.t0);
    if (d.dy > CLOSE_DISTANCE || d.dy / elapsed > CLOSE_VELOCITY) close();
    else setDragY(0);
  };

  if (!mounted || typeof document === 'undefined') return null;

  const panelStyle = {
    transform: shown ? `translateY(${dragY}px)` : 'translateY(100%)',
    transition: dragging ? 'none' : 'transform var(--dur-sheet) var(--ease-out)',
  };

  return createPortal(
    <div className={cx('fixed inset-0 z-40 flex flex-col justify-end', !modal && 'pointer-events-none')}>
      {modal ? (
        <div
          aria-hidden="true"
          onClick={close}
          className="absolute inset-0 bg-bg/70 transition-opacity duration-[var(--dur-sheet)] ease-out"
          style={{ opacity: shown ? 1 : 0 }}
        />
      ) : null}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={modal ? true : undefined}
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : t('ui.sheet.label')}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cx(
          'pointer-events-auto relative mx-auto flex w-full max-w-[640px] flex-col rounded-t-card border border-b-0 border-line bg-surface outline-none',
          SNAP[snap] || SNAP.auto,
          className,
        )}
        style={panelStyle}
      >
        <div
          className="shrink-0 cursor-grab touch-none select-none active:cursor-grabbing"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <div className="flex justify-center pb-1 pt-2.5">
            <span aria-hidden="true" className="h-1 w-10 rounded-full bg-line" />
          </div>
          <div className="gutter flex min-h-[48px] items-center gap-2 pb-1">
            {title ? (
              <h2 id={titleId} className="min-w-0 flex-1 truncate text-xl">
                {title}
              </h2>
            ) : (
              <div className="flex-1" />
            )}
            <IconButton icon="close" label={t('common.close')} tone="muted" onClick={close} className="-me-2" />
          </div>
        </div>
        <div className="gutter min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">{children}</div>
        {footer ? (
          <div className="gutter pb-safe shrink-0 border-t border-line pt-3">{footer}</div>
        ) : (
          <div className="shrink-0" style={{ paddingBottom: 'var(--safe-bottom)' }} />
        )}
      </div>
    </div>,
    document.body,
  );
}
