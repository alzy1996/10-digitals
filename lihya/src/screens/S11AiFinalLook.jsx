// S11 AI Final Look (PRD 7.5 steps 2-5, 8.1 steps 8-9): the photo-real preview the
// customer allowed one moment ago, beside the design drawn on this phone. The result
// is always labelled "AI preview" (in both languages) and never shown as a real photo;
// it is not kept: its object URL is revoked when this screen is left (and by a session
// wipe). Reachable only from the consent screen's "Allow once" in this session.

import { useEffect, useSyncExternalStore } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import ScreenFrame from '../components/ScreenFrame.jsx';
import Button from '../components/Button.jsx';
import BottomAction from '../components/BottomAction.jsx';
import Icon from '../components/Icon.jsx';
import Skeleton from '../components/Skeleton.jsx';
import { useSnackbar } from '../components/Snackbar.jsx';
import { cx } from '../components/kit.js';
import { translate, useT } from '../lib/i18n/useT.js';
import { useSession } from '../hooks/useSession.js';
import { useOnline } from '../hooks/useOnline.js';
import { useShop } from '../state/ShopContext.jsx';
import { finalLookErrorInfo } from './approve/aiMessages.js';
import {
  aiPreviewUsedFor,
  cancelFinalLook,
  currentFinalLook,
  holdFinalLook,
  retryFinalLook,
  subscribeFinalLook,
} from './approve/finalLookJob.js';
import { approveLook, findStyle } from './studio/approve.js';
import { useClientRecord, useShopStyles } from './approve/hooks.js';

/** Mirror Mode (tablet): each panel is as wide as the squares that fit above the footer. */
const PANEL = 'md:mx-auto md:w-full md:max-w-[max(280px,calc(100dvh-360px))]';

const ERROR_ICON = Object.freeze({ cap: 'clock', offline: 'wifi-off', disabled: 'lock', noFace: 'face', failed: 'warning' });

function Frame({ children, className }) {
  return (
    <div className={cx('relative aspect-square w-full overflow-hidden rounded-card border border-line bg-surface-2', className)}>
      {children}
    </div>
  );
}

function Working({ label, step }) {
  const { t } = useT();
  return (
    <>
      <Skeleton rounded="none" className="absolute inset-0" />
      <div role="status" aria-live="polite" className="absolute inset-x-3 bottom-3 rounded-ctl border border-line bg-bg px-4 py-3">
        <p className="flex items-center gap-2 font-medium text-text">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-brass motion-safe:animate-pulse" />
          {label}
        </p>
        <p className="num mt-0.5 text-sm text-text-2">{t('approve.ai.stepOf', { n: step })}</p>
      </div>
    </>
  );
}

/** "AI preview" in the screen language with the other language under it: the image is never a photo. */
function AiBadge() {
  const { t, lang } = useT();
  const other = lang === 'ar' ? 'en' : 'ar';
  return (
    <div className="absolute start-3 top-3 max-w-[85%] rounded-ctl border border-brass bg-bg px-3 py-1.5 leading-tight">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-brass">
        <Icon name="cloud" size={16} />
        {t('render.aiPreview')}
      </p>
      <p lang={other} dir={other === 'ar' ? 'rtl' : 'ltr'} className="text-start text-xs text-text-2">
        {translate(other, 'render.aiPreview')}
      </p>
    </div>
  );
}

function PanelTitle({ icon, title, sub }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 className="flex items-center gap-2 text-lg">
        <Icon name={icon} size={20} className="text-brass" />
        {title}
      </h2>
      {sub ? <span className="text-sm text-text-2">{sub}</span> : null}
    </div>
  );
}

export default function S11AiFinalLook() {
  const { t, pick } = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const { show } = useSnackbar();
  const online = useOnline();
  const session = useSession();
  const { shopId, settings } = useShop();
  const { path, setAiResult } = session;
  const job = useSyncExternalStore(subscribeFinalLook, currentFinalLook, currentFinalLook);
  const styles = useShopStyles(shopId);
  const record = useClientRecord(shopId, session.client);

  const wanted = location.state && location.state.finalLook;
  const valid = Boolean(job && wanted && job.id === wanted && job.shopId === shopId);
  const style = valid && job.params ? findStyle(styles, job.params.styleId) : null;

  // Hold the job while this screen is shown; leaving it revokes both images.
  useEffect(() => {
    const letGo = holdFinalLook();
    return () => letGo(() => setAiResult(null));
  }, [setAiResult]);

  // While it is on screen the result also sits in the session, so a session wipe revokes it.
  const result = valid && job.status === 'done' ? job.result : null;
  useEffect(() => {
    if (result) setAiResult(result);
  }, [result, setAiResult]);

  if (!valid) return <Navigate to={path('compare')} replace />;

  const status = job.status;
  const info = status === 'error' ? finalLookErrorInfo(job.error, job.retries) : null;
  const studioUrl = job.studio ? job.studio.url : null;

  const backToStudio = () => {
    cancelFinalLook(job.id);
    navigate(path('studio'), { replace: true });
  };

  const cancel = () => {
    cancelFinalLook(job.id);
    show({ message: t('approve.ai.cancelled') });
  };

  const retry = () => {
    if (!retryFinalLook(job.id)) show({ message: t('common.error') });
  };

  const approve = () => {
    const res = approveLook({
      session,
      shop: { shopId },
      settings,
      styles,
      lookId: job.lookId,
      growthMmPerDay: record ? record.growthMmPerDay : null,
      aiPreviewUsed: status === 'done' || aiPreviewUsedFor(shopId, session.startedAt),
    });
    if (!res.ok) {
      show({ message: t('approve.ai.noLook') });
      navigate(path('studio'), { replace: true });
      return;
    }
    if (status === 'working') cancelFinalLook(job.id);
    navigate(path('cut-card'), { replace: true });
  };

  /* ---- the AI panel */
  let aiBody;
  if (status === 'done' && job.result) {
    aiBody = (
      <Frame className="border-brass/70">
        <img
          src={job.result.url}
          alt={`${t('render.aiPreview')}. ${t('approve.ai.notReal')}`}
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
        <AiBadge />
      </Frame>
    );
  } else if (status === 'working') {
    aiBody = (
      <Frame>
        {job.step === 'ai' ? (
          <Working label={t('approve.ai.stepAi')} step={2} />
        ) : (
          <Skeleton rounded="none" className="absolute inset-0" />
        )}
        <AiBadge />
      </Frame>
    );
  } else if (status === 'cancelled') {
    aiBody = (
      <Frame className="flex items-center justify-center">
        <div role="status" className="flex max-w-xs flex-col items-center gap-3 px-6 text-center">
          <Icon name="close" size={28} className="text-text-2" />
          <p className="text-text-2">{t('approve.ai.cancelled')}</p>
        </div>
      </Frame>
    );
  } else {
    const canRetry = info && info.retry && !(info.code === 'offline' && !online);
    aiBody = (
      <Frame className="flex items-center justify-center">
        <div role="alert" className="flex max-w-sm flex-col items-center gap-3 px-5 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-warn/50 text-warn">
            <Icon name={ERROR_ICON[info ? info.code : 'failed'] || 'warning'} size={24} />
          </span>
          <p className="text-text">{info ? t(info.key) : t('render.error.failed')}</p>
          {canRetry ? (
            <Button variant="secondary" icon="refresh" onClick={retry}>
              {t('common.retry')}
            </Button>
          ) : null}
        </div>
      </Frame>
    );
  }

  /* ---- the design panel */
  let designBody;
  if (studioUrl) {
    designBody = (
      <Frame>
        <img src={studioUrl} alt={t('approve.ai.design')} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      </Frame>
    );
  } else if (status === 'working') {
    designBody = (
      <Frame>
        <Working label={t('approve.ai.stepDesign')} step={1} />
      </Frame>
    );
  } else {
    designBody = (
      <Frame className="flex items-center justify-center">
        <p role="alert" className="max-w-xs px-6 text-center text-text-2">
          {job.designFailed ? t('approve.ai.designError') : t('approve.ai.cancelled')}
        </p>
      </Frame>
    );
  }

  const styleName = style ? pick(style.name) : '';

  return (
    <ScreenFrame
      title={t('render.aiPreview')}
      onBack={backToStudio}
      wide
      footer={
        <BottomAction className="mx-auto w-full max-w-[640px]">
          <Button variant="primary" icon="check" onClick={approve}>
            {t('approve.ai.approve')}
          </Button>
          <Button variant="secondary" icon="arrow-left" full onClick={backToStudio}>
            {t('approve.backToStudio')}
          </Button>
        </BottomAction>
      }
    >
      {styleName ? <p className="display mb-3 text-2xl text-text">{styleName}</p> : null}
      <div className="grid gap-6 md:grid-cols-2 md:gap-5">
        <section aria-labelledby="ai-title" className={PANEL}>
          <div id="ai-title">
            <PanelTitle icon="cloud" title={t('render.aiPreview')} sub={t('approve.ai.notReal')} />
          </div>
          {aiBody}
          {status === 'working' ? (
            <div className="mt-3">
              <Button variant="secondary" icon="close" onClick={cancel}>
                {t('common.cancel')}
              </Button>
            </div>
          ) : null}
          {status === 'done' ? (
            <div className="mt-3 flex flex-col gap-1 text-sm text-text-2">
              <p>{t('render.aiPreview.note')}</p>
              <p>{t('approve.ai.notKept')}</p>
            </div>
          ) : null}
        </section>
        <section aria-labelledby="design-title" className={PANEL}>
          <div id="design-title">
            <PanelTitle icon="beard" title={t('approve.ai.design')} />
          </div>
          {designBody}
          <p className="mt-3 text-sm text-text-2">{t('approve.ai.designNote')}</p>
        </section>
      </div>
    </ScreenFrame>
  );
}
