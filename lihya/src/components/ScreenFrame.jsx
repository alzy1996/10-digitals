import { useContext, useEffect, useRef } from 'react';
import TopBar from './TopBar.jsx';
import { APP } from '../config/app.js';
import { FooterContext, ShellContext, cx } from './kit.js';

/**
 * Standard screen: top bar (back, title, actions, sync badge, language toggle), a scrollable
 * body with the side gutter, and a bottom-anchored footer with safe-area padding for the one
 * primary action (PRD 8.5). Phone first: the body is a single 640 px column; `wide` lets owner
 * screens use up to 1280 px. Inside OwnerShell it fills the content column and shows the
 * owner tabs under the top bar on phones.
 * The footer's height is published as the CSS variable --footer-h so the snackbar sits above it.
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
  const shell = useContext(ShellContext);
  const footerRef = useRef(null);
  const hasFooter = footer !== undefined && footer !== null && footer !== false;
  const setFramed = shell ? shell.setFramed : null;

  useEffect(() => {
    if (!setFramed) return undefined;
    setFramed(true);
    return () => setFramed(false);
  }, [setFramed]);

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

  const column = wide ? 'max-w-screen-xl' : 'max-w-[640px]';

  return (
    <div className={cx('flex flex-col bg-bg text-text', shell ? 'min-h-0 flex-1' : 'h-[100dvh]', className)}>
      {topBar ? <TopBar title={title} back={back} onBack={onBack} actions={actions} /> : null}
      {shell && shell.nav ? <div className="shrink-0 lg:hidden">{shell.nav}</div> : null}
      <main className={cx('min-h-0 flex-1 overflow-y-auto overscroll-contain', bodyClassName)}>
        <div className={cx('mx-auto w-full', column, padded && 'gutter py-4')}>{children}</div>
      </main>
      {hasFooter ? (
        <div ref={footerRef} className="shrink-0 border-t border-line bg-bg">
          <div className={cx('gutter pb-safe mx-auto w-full pt-3', column)}>
            <FooterContext.Provider value={true}>{footer}</FooterContext.Provider>
          </div>
        </div>
      ) : null}
    </div>
  );
}
