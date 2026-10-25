// S10 AI consent (PRD 7.5 step 1, 8.1 step 8): before the only cloud feature, the
// customer reads where his photo goes and chooses "Allow once" or "Keep on phone only".
// Both answers are logged (who and when, never a photo). The consent is asked every
// time: nothing here is remembered, and "Allow once" starts exactly one render.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ScreenFrame from '../components/ScreenFrame.jsx';
import Button from '../components/Button.jsx';
import BottomAction from '../components/BottomAction.jsx';
import Icon from '../components/Icon.jsx';
import Skeleton from '../components/Skeleton.jsx';
import { useSnackbar } from '../components/Snackbar.jsx';
import { translate, useT } from '../lib/i18n/useT.js';
import { useSession } from '../hooks/useSession.js';
import { useOnline } from '../hooks/useOnline.js';
import { useShop } from '../state/ShopContext.jsx';
import { logConsent } from '../services/consents.js';
import { finalLookAvailable } from '../ai/index.js';
import { UNAVAILABLE_KEYS, unavailableReason } from './approve/aiMessages.js';
import { startFinalLook } from './approve/finalLookJob.js';
import { useStyle } from './approve/hooks.js';

const REASON_ICON = Object.freeze({
  disabled: 'lock',
  offline: 'wifi-off',
  notConfigured: 'cloud',
  noLook: 'beard',
  noPhoto: 'camera',
});

/** The look the AI preview is made of: the favorite, the only saved look, or the Studio's current one. */
function chosenLook({ looks, favoriteLookId, activeParams }) {
  const list = Array.isArray(looks) ? looks : [];
  const fav = favoriteLookId ? list.find((l) => l.id === favoriteLookId) : null;
  const look = fav || (list.length === 1 ? list[0] : null);
  if (look && look.params) return { lookId: look.id, params: look.params, thumb: look.thumb || null };
  if (activeParams) return { lookId: null, params: activeParams, thumb: null };
  return null;
}

function Fact({ icon, children }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-brass">
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0 pt-1 text-text">{children}</span>
    </li>
  );
}

export default function S10AiConsent() {
  const { t, lang, pick } = useT();
  const navigate = useNavigate();
  const { show } = useSnackbar();
  const online = useOnline();
  const { shopId, settings } = useShop();
  const session = useSession();
  const { path, looks, favoriteLookId, activeParams, shots, client, effectiveProfile, profile, consultationId, startedAt, trackObjectUrl, hydrated } = session;
  const [answered, setAnswered] = useState(false);

  const chosen = useMemo(() => chosenLook({ looks, favoriteLookId, activeParams }), [looks, favoriteLookId, activeParams]);
  const style = useStyle(shopId, chosen && chosen.params ? chosen.params.styleId : null);
  const front = shots ? shots.front : null;
  const hasPhoto = Boolean(front && front.canvas && front.canvas.width && Array.isArray(front.landmarks));
  const available = finalLookAvailable(settings);
  const reason = unavailableReason({ settings, online, available, hasLook: Boolean(chosen), hasPhoto });

  const compareFirst = Array.isArray(looks) && looks.length > 1;
  const backTo = compareFirst ? path('compare') : path('studio');
  const backLabel = compareFirst ? t('approve.backToCompare') : t('approve.backToStudio');
  const other = lang === 'ar' ? 'en' : 'ar';
  const clientId = client && client.id && !client.walkIn ? client.id : null;

  const answer = (granted) => {
    if (answered) return;
    try {
      logConsent(shopId, { type: 'ai_render', clientId, granted });
    } catch (err) {
      console.error('AI consent could not be logged', err);
      if (granted) {
        // No logged consent, no upload.
        show({ message: t('common.error') });
        return;
      }
    }
    setAnswered(true);
    if (!granted) {
      navigate(backTo, { replace: true });
      return;
    }
    const id = startFinalLook({
      shopId,
      shot: front,
      params: chosen.params,
      profile: effectiveProfile || profile,
      lookId: chosen.lookId,
      consultationId,
      startedAt,
      trackUrl: trackObjectUrl,
    });
    navigate(path('ai-result'), { replace: true, state: { finalLook: id } });
  };

  if (!hydrated) {
    return (
      <ScreenFrame title={t('approve.consent.title')} back={backTo}>
        <div role="status" aria-busy="true" className="flex flex-col gap-4">
          <span className="sr-only">{t('common.loading')}</span>
          <Skeleton rounded="card" className="h-28 w-full" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-20 w-full" />
        </div>
      </ScreenFrame>
    );
  }

  if (reason) {
    return (
      <ScreenFrame
        title={t('approve.consent.title')}
        back={backTo}
        footer={
          <BottomAction>
            <Button variant="primary" icon="arrow-left" onClick={() => navigate(backTo, { replace: true })}>
              {backLabel}
            </Button>
            {reason === 'noPhoto' ? (
              <Button variant="secondary" icon="camera" full onClick={() => navigate(path('capture'))}>
                {t('approve.ai.retakePhoto')}
              </Button>
            ) : null}
          </BottomAction>
        }
      >
        <section role="status" className="flex flex-col items-center gap-4 px-2 py-10 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-line text-text-2">
            <Icon name={REASON_ICON[reason] || 'info'} size={30} />
          </span>
          <h2 className="text-xl">{t('approve.consent.unavailable')}</h2>
          <p className="max-w-sm text-text-2">{t(UNAVAILABLE_KEYS[reason])}</p>
        </section>
      </ScreenFrame>
    );
  }

  const styleName = style ? pick(style.name) : '';

  return (
    <ScreenFrame
      title={t('approve.consent.title')}
      back={backTo}
      footer={
        <BottomAction>
          <Button variant="primary" icon="cloud" onClick={() => answer(true)} disabled={answered}>
            {t('approve.consent.allow')}
          </Button>
          <Button variant="secondary" icon="lock" full onClick={() => answer(false)} disabled={answered}>
            {t('approve.consent.keep')}
          </Button>
        </BottomAction>
      }
    >
      <div className="flex items-center gap-4 rounded-card border border-line bg-surface p-3">
        <div className="flex h-[88px] w-[70px] shrink-0 items-center justify-center overflow-hidden rounded-ctl border border-line bg-surface-2 text-text-2">
          {chosen.thumb ? (
            <img src={chosen.thumb} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            <Icon name="beard" size={32} />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm text-text-2">{t('approve.consent.look')}</p>
          {styleName ? <p className="display truncate text-xl text-text">{styleName}</p> : null}
        </div>
      </div>

      <h2 className="mt-6 text-xl leading-snug">{t('approve.consent.heading')}</h2>

      <div className="mt-4 rounded-card border border-brass/60 bg-surface p-4">
        <p className="text-lg leading-relaxed text-text">{t('approve.consent.body')}</p>
        <hr className="rule-brass my-3" />
        <p lang={other} dir={other === 'ar' ? 'rtl' : 'ltr'} className="text-start text-base leading-relaxed text-text-2">
          {translate(other, 'approve.consent.body')}
        </p>
      </div>

      <ul className="mt-5 flex flex-col gap-3 text-sm">
        <Fact icon="cloud">{t('approve.consent.factOnce')}</Fact>
        <Fact icon="lock">{t('approve.consent.factNotStored')}</Fact>
        <Fact icon="eye">{t('approve.consent.factLabel')}</Fact>
      </ul>

      <p className="mt-5 pb-2 text-sm text-text-2">{t('approve.consent.everyTime')}</p>
    </ScreenFrame>
  );
}
