import { useEffect } from 'react';
import Icon from './Icon.jsx';

/**
 * Bottom sheet on phones. With `docked` it renders as a static side panel (tablet Mirror Mode).
 * Modal sheets close on scrim tap and on Escape.
 */
export default function Sheet({ open = true, onClose, title, children, docked = false, modal = false }) {
  useEffect(() => {
    if (!modal || !open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, open, onClose]);

  if (!open) return null;
  if (docked) {
    return (
      <aside className="card h-full overflow-y-auto p-5" aria-label={title}>
        {title ? <h2 className="mb-4 text-xl">{title}</h2> : null}
        {children}
      </aside>
    );
  }
  const body = (
    <section
      role={modal ? 'dialog' : 'region'}
      aria-modal={modal || undefined}
      aria-label={title}
      className="relative z-40 rounded-t-card border border-line bg-surface px-[var(--gutter)] pb-[calc(16px+env(safe-area-inset-bottom))] pt-2 shadow-sheet"
      style={{ animation: 'sheet-in var(--t-sheet) var(--ease)' }}
    >
      <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line" aria-hidden />
      {title || onClose ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title ? <h2 className="text-xl">{title}</h2> : <span />}
          {onClose ? (
            <button type="button" onClick={onClose} className="press grid min-h-tap min-w-tap place-items-center rounded-full" aria-label="Close">
              <Icon name="close" />
            </button>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
  if (!modal) return body;
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" style={{ animation: 'fade-in var(--t-sheet)' }}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-[var(--scrim)]" onClick={onClose} />
      <div className="relative mx-auto w-full max-w-[720px]">{body}</div>
    </div>
  );
}
