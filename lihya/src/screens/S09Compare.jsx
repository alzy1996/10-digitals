// S09 Compare (PRD 8.1 step 7, 8.4): the saved looks (up to 3) side by side on his own
// photo, each with its name and a one-line summary. The customer taps his favorite (big
// tap targets). "This is my look" approves it: the Cut Card is built on this phone and
// the consultation is approved (src/screens/studio/approve.js). The AI Final Look is
// offered only when the owner turned it on and the device is online.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ScreenFrame from '../components/ScreenFrame.jsx';
import Button from '../components/Button.jsx';
import BottomAction from '../components/BottomAction.jsx';
import Icon from '../components/Icon.jsx';
import Skeleton from '../components/Skeleton.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useSnackbar } from '../components/Snackbar.jsx';
import { cx } from '../components/kit.js';
import { useT } from '../lib/i18n/useT.js';
import { lookSummary } from '../lib/look.js';
import { useSession } from '../hooks/useSession.js';
import { useLive } from '../hooks/useLive.js';
import { useOnline } from '../hooks/useOnline.js';
import { useShop } from '../state/ShopContext.jsx';
import { watchStyles } from '../services/styles.js';
import { finalLookAvailable, renderStudio } from '../ai/index.js';
import CropCanvas from './studio/CropCanvas.jsx';
import { approveLook, findStyle } from './studio/approve.js';
import { useClientGrowth } from './studio/useClientGrowth.js';
import { CROP_ASPECT, beardBelowPx, faceCrop, renderScale, scaleRect } from './studio/frame.js';

const RENDER_MAX = 900;

function releaseCanvas(c) {
  if (!c) return;
  try {
    c.width = 0;
    c.height = 0;
  } catch {
    // already released
  }
}

/**
 * Sharper pictures than the saved thumbnails: each look rendered on the front photo
 * (Photo Studio), one at a time. { [lookId]: canvas }; freed when the screen closes.
 */
function useLookRenders(front, profile, looks) {
  const [renders, setRenders] = useState({});
  const doneRef = useRef(new Map());

  useEffect(() => {
    if (!front) return undefined;
    let alive = true;
    (async () => {
      for (const look of looks) {
        if (!alive) return;
        const key = `${look.id}`;
        const prev = doneRef.current.get(key);
        if (prev && prev.params === look.params && prev.front === front && prev.profile === profile) continue;
        try {
          const canvas = await renderStudio({ shot: front, params: look.params, profile, maxSize: RENDER_MAX });
          if (!alive) {
            releaseCanvas(canvas);
            return;
          }
          if (prev) releaseCanvas(prev.canvas);
          doneRef.current.set(key, { canvas, params: look.params, front, profile });
          setRenders((m) => ({ ...m, [key]: canvas }));
        } catch (err) {
          console.warn('compare: look render failed, the thumbnail stays', err);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [front, profile, looks]);

  // Looks removed meanwhile, and everything on unmount: free the pixels.
  useEffect(() => {
    const ids = new Set(looks.map((l) => l.id));
    for (const [id, entry] of doneRef.current) {
      if (!ids.has(id)) {
        releaseCanvas(entry.canvas);
        doneRef.current.delete(id);
      }
    }
  }, [looks]);
  useEffect(() => {
    const done = doneRef.current;
    return () => {
      for (const entry of done.values()) releaseCanvas(entry.canvas);
      done.clear();
    };
  }, []);

  return renders;
}

export default function S09Compare() {
  const { t, lang, pick } = useT();
  const navigate = useNavigate();
  const online = useOnline();
  const { show } = useSnackbar();
  const shop = useShop();
  const { shopId, settings } = shop;
  const session = useSession();
  const { looks, favoriteLookId, setFavorite, setActiveParams, shots, effectiveProfile, client, path, hydrated } = session;
  const front = shots ? shots.front : null;
  const [approving, setApproving] = useState(false);

  const stylesLive = useLive((cb, onError) => watchStyles(shopId, cb, { includeHidden: true }, onError), [shopId]);
  const styles = stylesLive.data;
  const learned = useClientGrowth(shopId, client && client.id ? client.id : null);
  const renders = useLookRenders(front, effectiveProfile, looks);
  // One crop for every look (so they compare 1:1), deep enough for the longest chin.
  const crop = useMemo(() => {
    if (!front) return null;
    const chin = Math.max(0, ...looks.map((l) => Number(l.params && l.params.zones && l.params.zones.C) || 0));
    const mmPerPx = effectiveProfile && effectiveProfile.scale ? effectiveProfile.scale.mmPerPx : null;
    return faceCrop(front, CROP_ASPECT, { belowPx: beardBelowPx(chin, mmPerPx) });
  }, [front, looks, effectiveProfile]);

  const targetId = favoriteLookId || (looks.length === 1 ? looks[0].id : null);
  const target = looks.find((l) => l.id === targetId) || null;
  // The AI preview needs the internet and the owner's switch (re-read when the connection changes).
  const aiAvailable = online && finalLookAvailable(settings);

  const edit = (look) => {
    setActiveParams(look.params);
    navigate(path('studio'));
  };

  const approve = () => {
    if (!target || approving) return;
    setApproving(true);
    const res = approveLook({ session, shop, settings, styles, lookId: target.id, growthMmPerDay: learned });
    if (!res.ok) {
      setApproving(false);
      show({ message: t('studio.approve.failed') });
      return;
    }
    navigate(path('cut-card'));
  };

  const openAi = () => {
    if (!target) {
      show({ message: t('studio.compare.pickFirst') });
      return;
    }
    setFavorite(target.id);
    setActiveParams(target.params);
    navigate(path('ai-consent'));
  };

  const title = t('studio.compare.title');

  if (!looks.length) {
    return (
      <ScreenFrame title={title} back={path('studio')}>
        {!hydrated ? (
          <div role="status" aria-busy="true" className="grid grid-cols-2 gap-3">
            <span className="sr-only">{t('common.loading')}</span>
            <Skeleton rounded="card" className="aspect-[4/5] w-full" />
            <Skeleton rounded="card" className="aspect-[4/5] w-full" />
          </div>
        ) : (
          <EmptyState
            icon="compare"
            title={t('studio.compare.empty.title')}
            message={t('studio.compare.empty.body')}
            action={
              <Button variant="primary" icon="arrow-left" onClick={() => navigate(path('studio'))} className="mt-2">
                {t('studio.compare.empty.action')}
              </Button>
            }
          />
        )}
      </ScreenFrame>
    );
  }

  const footer = (
    <BottomAction>
      {aiAvailable ? (
        <Button variant="secondary" icon="flash" onClick={openAi} full disabled={!target}>
          {t('studio.compare.ai')}
        </Button>
      ) : null}
      <Button variant="primary" icon="check" onClick={approve} disabled={!target} loading={approving}>
        {t('studio.approve')}
      </Button>
    </BottomAction>
  );

  return (
    <ScreenFrame title={title} back={path('studio')} footer={footer} wide>
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-4">
        <p className="text-lg text-text">{t('studio.compare.lead')}</p>

        <ul
          className={cx(
            'gutter -mx-[var(--gutter)] flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            'md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0',
          )}
        >
          {looks.map((look, i) => {
            const n = i + 1;
            const style = findStyle(styles, look.params && look.params.styleId);
            const name = style ? pick(style.name) : t('studio.compare.look', { n });
            const summary = lookSummary(look.params, lang, style);
            const fav = look.id === targetId;
            const canvas = renders[look.id];
            let media;
            if (canvas && crop) {
              media = <CropCanvas source={canvas} rect={scaleRect(crop, renderScale(front, canvas))} />;
            } else if (look.thumb) {
              media = <img src={look.thumb} alt="" draggable={false} className="h-full w-full object-cover" />;
            } else if (front) {
              media = <Skeleton rounded="none" className="h-full w-full" />;
            } else {
              media = (
                <span className="flex h-full w-full items-center justify-center text-text-2">
                  <Icon name="beard" size={40} />
                </span>
              );
            }
            return (
              <li key={look.id} className="flex w-[calc(50%-6px)] shrink-0 snap-start flex-col gap-2 md:w-auto">
                <button
                  type="button"
                  onClick={() => setFavorite(look.id)}
                  aria-pressed={fav}
                  aria-label={`${t('studio.compare.look', { n })}: ${name}`}
                  className={cx(
                    'press flex w-full flex-col overflow-hidden rounded-card border-2 bg-surface text-start',
                    fav ? 'border-brass' : 'border-line',
                  )}
                >
                  <span className="relative block aspect-[4/5] w-full bg-surface-2">
                    {media}
                    <span className="num absolute start-2 top-2 flex h-8 min-w-8 items-center justify-center rounded-full border border-line bg-bg/85 px-2 text-sm font-semibold text-text">
                      {n}
                    </span>
                    {fav ? (
                      <span className="absolute inset-x-2 bottom-2 flex items-center justify-center gap-1.5 rounded-full bg-brass px-3 py-1.5 text-sm font-semibold text-on-brass">
                        <Icon name="check" size={18} />
                        {t('studio.compare.favorite')}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex min-h-[88px] flex-col gap-1 p-3">
                    <span className="line-clamp-2 font-semibold leading-snug text-text">{name}</span>
                    <span className="num line-clamp-3 text-xs leading-snug text-text-2">{summary}</span>
                  </span>
                </button>
                <Button variant="ghost" size="sm" icon="edit" onClick={() => edit(look)} full>
                  {t('common.edit')}
                </Button>
              </li>
            );
          })}
        </ul>

        {looks.length > 2 ? (
          <p className="flex items-center justify-center gap-1.5 text-xs text-text-2 md:hidden">
            <Icon name="hand" size={16} />
            {t('studio.compare.swipe')}
          </p>
        ) : null}

        {!target ? (
          <p role="status" className="flex items-center gap-2 text-sm text-text-2">
            <Icon name="info" size={18} className="shrink-0" />
            {t('studio.compare.pickFirst')}
          </p>
        ) : null}
      </div>
    </ScreenFrame>
  );
}
