import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../../../components/TopBar.jsx';
import { APP } from '../lib/config.js';
import { FooterContext, cx } from './kit.js';

/**
 * Standard beard screen on the Care & Us top bar (back, title, actions, offline state, language
 * toggle), a scrollable body with the side gutter and a bottom-anchored footer with safe-area
 * padding for the one primary action. Phone first: a single 640 px column; `wide` allows 1280 px.
 * back: true = history back, a string = navigate to that path, a function = call it, false = none.
 * The footer's height is published as --footer-h so overlays can sit above it.
 */
export default function ScreenFrame({
  title,
  back,
  onBack,
  actions,
  children,
  footer,
  wide = false,
  padded = true,
  topBar = true,
  className,
  bodyClassName,
}) {
  const navigate = useNavigate();
  const footerRef = useRef(null);
  const hasFooter = footer !== undefined && footer !== null && footer !== false;

  useEffect(() => {
    const root = document.documentElement;
    const el = footerRef.current;
    if (!hasFooter || !el) {
      root.style.removeProperty('--footer-h');
      return undefined;
    }
    const update = () => root.style.setProperty('--footer-h', `${el.offsetHeight}px`);
    update();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    if (ro) ro.observe(el);
    return () => {
      if (ro) ro.disconnect();
      root.style.removeProperty('--footer-h');
    };
  }, [hasFooter]);

  useEffect(() => {
    if (typeof title === 'string' && title) document.title = `${title} · ${APP.name}`;
  }, [title]);

  const hasBack = Boolean(back || onBack);
  const goBack = () => {
    if (typeof onBack === 'function') onBack();
    else if (typeof back === 'function') back();
    else if (typeof back === 'string') navigate(back);
    else navigate(-1);
  };

  const column = wide ? 'max-w-screen-xl' : 'max-w-[640px]';

  return (
    <div className={cx('flex h-[100dvh] flex-col bg-bg text-ink', className)}>
      {topBar ? (
        <div className="shrink-0 px-[var(--gutter)] [&>header]:mb-0">
          <TopBar title={typeof title === 'string' ? title : undefined} back={hasBack} onBack={goBack} right={actions} />
        </div>
      ) : null}
      <main className={cx('relative min-h-0 flex-1 overflow-y-auto overscroll-contain', bodyClassName)}>
        <div className={cx('mx-auto w-full', column, padded && 'px-[var(--gutter)] py-4')}>{children}</div>
      </main>
      {hasFooter ? (
        <div ref={footerRef} className="shrink-0 border-t border-line bg-bg">
          <div className={cx('mx-auto w-full px-[var(--gutter)] pb-[calc(16px+env(safe-area-inset-bottom))] pt-3', column)}>
            <FooterContext.Provider value={true}>{footer}</FooterContext.Provider>
          </div>
        </div>
      ) : null}
    </div>
  );
}
