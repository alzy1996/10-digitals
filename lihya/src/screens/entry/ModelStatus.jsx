import { useCallback, useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { useT } from '../../lib/i18n/useT.js';
import { useOnline } from '../../hooks/useOnline.js';

/**
 * Warm up the on-device camera models in the background (barber home). Loads the
 * AI facade lazily, then the face landmarker + segmenter; on an unmetered link
 * (Wi-Fi) also the optional age model. Never blocks the screen.
 * Returns { phase: 'checking'|'loading'|'ready'|'error'|'offline', pct, retry }.
 */
export function useModelWarmup() {
  const online = useOnline();
  const [state, setState] = useState({ phase: 'checking', pct: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    const put = (next) => {
      if (alive) setState(next);
    };
    // The AI module itself can take a moment the first time: say so if it does.
    if (attempt > 0) put({ phase: 'loading', pct: null });
    const slow = setTimeout(() => {
      if (alive) setState((s) => (s.phase === 'checking' ? { phase: 'loading', pct: null } : s));
    }, 600);
    (async () => {
      let ai;
      try {
        ai = await import('../../ai/index.js');
      } catch (err) {
        console.warn('Barber home: the AI module did not load', err);
        put({ phase: navigator.onLine === false ? 'offline' : 'error', pct: null });
        return;
      }
      if (!alive) return;
      const now = ai.modelStatus();
      if (now.landmarker !== 'ready' || now.segmenter === 'idle' || now.segmenter === 'loading') {
        put({ phase: 'loading', pct: null });
        try {
          await ai.loadModels({
            segmenter: true,
            onProgress: ({ fraction }) => {
              const pct = Number.isFinite(fraction) ? Math.round(fraction * 100) : 0;
              if (pct > 0 && pct < 100) put({ phase: 'loading', pct });
            },
          });
        } catch (err) {
          console.warn('Barber home: camera models did not load', err);
          put({ phase: navigator.onLine === false ? 'offline' : 'error', pct: null });
          return;
        }
      }
      put({ phase: 'ready', pct: 100 });
      if (!alive) return;
      try {
        if (ai.canLoadAgeModel()) ai.loadAgeModel().catch(() => {});
      } catch (err) {
        console.warn('Barber home: age model warm-up skipped', err);
      }
    })();
    return () => {
      alive = false;
      clearTimeout(slow);
    };
  }, [attempt]);

  // Back online after an offline failure: try again by itself.
  useEffect(() => {
    if (online && state.phase === 'offline') setAttempt((n) => n + 1);
  }, [online, state.phase]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}

/** One quiet line under the main actions; hidden once the models are ready. */
export default function ModelStatus({ phase, pct, onRetry }) {
  const { t } = useT();
  const visible = phase === 'loading' || phase === 'error' || phase === 'offline';
  return (
    <div role="status" aria-live="polite" className={visible ? 'min-h-[24px]' : 'sr-only'}>
      {phase === 'loading' ? (
        <div className="flex items-center gap-3 text-xs text-text-2">
          <span className="relative h-1 w-16 shrink-0 overflow-hidden rounded-full bg-line" aria-hidden="true">
            <span
              className={pct === null ? 'absolute inset-y-0 start-0 w-1/3 animate-pulse bg-brass/70 motion-reduce:animate-none' : 'absolute inset-y-0 start-0 bg-brass'}
              style={pct === null ? undefined : { width: `${Math.max(4, pct)}%` }}
            />
          </span>
          <span className="num">
            {pct === null ? t('entry.home.models.preparing') : t('entry.home.models.progress', { pct })}
          </span>
        </div>
      ) : null}
      {phase === 'error' || phase === 'offline' ? (
        <div className="flex items-center gap-2 text-xs text-text-2">
          <Icon name={phase === 'offline' ? 'wifi-off' : 'warning'} size={16} className="text-warn" />
          <span className="min-w-0 flex-1">{t(phase === 'offline' ? 'entry.home.models.offline' : 'entry.home.models.error')}</span>
          {phase === 'error' ? (
            <button
              type="button"
              onClick={onRetry}
              className="press -my-2 inline-flex min-h-tap shrink-0 items-center gap-1.5 rounded-ctl px-3 text-sm font-medium text-brass active:bg-brass/10"
            >
              <Icon name="refresh" size={16} />
              {t('ai.model.retry')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
