import { useNavigate } from 'react-router-dom';
import IconButton from './IconButton.jsx';
import LangToggle from './LangToggle.jsx';
import SyncBadge from './SyncBadge.jsx';
import { cx, useOptionalT } from './kit.js';

/**
 * Top bar: back button (when `back` is set), title (the screen's h1), optional actions,
 * the pending-sync badge and the language toggle (PRD: a language toggle on every screen).
 * back: true = history back, a string = navigate to that path, a function = call it.
 * `overlay` makes it transparent for full-screen camera screens.
 */
export default function TopBar({ title, back, onBack, actions, showSync = true, showLang = true, overlay = false, className }) {
  const { t } = useOptionalT();
  const navigate = useNavigate();
  const hasBack = Boolean(back || onBack);

  const goBack = () => {
    if (typeof onBack === 'function') onBack();
    else if (typeof back === 'function') back();
    else if (typeof back === 'string') navigate(back);
    else navigate(-1);
  };

  return (
    <header
      className={cx(
        'pt-safe z-20 shrink-0',
        overlay ? 'bg-transparent text-text' : 'border-b border-line bg-bg',
        className,
      )}
    >
      <div className="gutter flex h-14 w-full items-center gap-1">
        {hasBack ? <IconButton icon="arrow-left" label={t('common.back')} onClick={goBack} className="-ms-2" /> : null}
        <h1 className={cx('min-w-0 flex-1 truncate text-lg sm:text-xl', hasBack ? 'ms-1' : '')}>{title}</h1>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
        {showSync ? <SyncBadge /> : null}
        {showLang ? <LangToggle className="-me-2" /> : null}
      </div>
    </header>
  );
}
