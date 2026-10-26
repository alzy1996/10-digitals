import { useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useT } from '../lib/i18n/useT.js';
import { useOnline } from '../hooks/useOnline.js';
import { APP } from '../config/app.js';

/** Every screen gets this bar: back, title, language toggle, offline / sync state. */
export default function TopBar({ title, back = true, onBack, right, step, pending }) {
  const { t, toggle, lang } = useT();
  const navigate = useNavigate();
  const online = useOnline();
  return (
    <header className="no-print sticky top-0 z-30 -mx-[var(--gutter)] mb-4 flex min-h-[64px] items-center gap-2 border-b border-line bg-bg px-[var(--gutter)] pt-[env(safe-area-inset-top)] backdrop-blur-0">
      {back ? (
        <button
          type="button"
          onClick={onBack || (() => navigate(-1))}
          className="press grid min-h-tap min-w-tap place-items-center rounded-full active:bg-surface2"
          aria-label={t('common.back')}
        >
          <Icon name="back" className="rtl:-scale-x-100" />
        </button>
      ) : (
        <span className="px-1 font-display text-lg font-semibold tracking-tight">
          {lang === 'ar' ? APP.nameAr : APP.name}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {step ? <div className="eyebrow">{step}</div> : null}
        {title ? <h1 className="truncate text-[20px] leading-tight">{title}</h1> : null}
      </div>
      {!online ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-warn px-2 py-1 text-xs text-warn">
          <Icon name="cloud" size={16} />
          {t('common.offline')}
        </span>
      ) : pending ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-1 text-xs text-ink2">
          <Icon name="refresh" size={16} />
          {t('common.willSync')}
        </span>
      ) : null}
      {right}
      <button
        type="button"
        onClick={toggle}
        className="press flex min-h-tap min-w-tap items-center justify-center gap-1 rounded-full border border-line px-3 text-sm font-semibold"
        aria-label={t('common.language')}
      >
        <Icon name="globe" size={20} />
        <span lang={lang === 'ar' ? 'en' : 'ar'}>{lang === 'ar' ? 'EN' : 'عربي'}</span>
      </button>
    </header>
  );
}
