import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { DEFAULTS } from '../config/app.js';

const Ctx = createContext({ show: () => {} });

export function SnackbarProvider({ children }) {
  const [item, setItem] = useState(null);
  const timer = useRef(null);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setItem(null);
  }, []);

  const show = useCallback(
    ({ message, actionLabel, onAction, tone = 'neutral', duration = DEFAULTS.undoMs }) => {
      clearTimeout(timer.current);
      setItem({ message, actionLabel, onAction, tone, id: Date.now() });
      timer.current = setTimeout(() => setItem(null), duration);
    },
    [],
  );

  const value = useMemo(() => ({ show, hide }), [show, hide]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-[var(--gutter)] pb-[calc(16px+env(safe-area-inset-bottom))]">
        {item ? (
          <div
            key={item.id}
            className={`pointer-events-auto flex min-h-[56px] w-full max-w-[560px] items-center gap-3 rounded-control px-4 shadow-sheet ${
              item.tone === 'risk' ? 'bg-risk text-white' : 'bg-ink text-bg'
            }`}
            style={{ animation: 'sheet-in var(--t-sheet) var(--ease)' }}
          >
            <span className="flex-1 text-[15px]">{item.message}</span>
            {item.actionLabel ? (
              <button
                type="button"
                className="press flex min-h-tap items-center gap-1 rounded-control px-3 font-semibold underline-offset-4"
                onClick={() => {
                  item.onAction?.();
                  hide();
                }}
              >
                <Icon name="undo" size={20} />
                {item.actionLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Ctx.Provider>
  );
}

export function useSnackbar() {
  return useContext(Ctx);
}
