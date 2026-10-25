import { useFooterContext, cx } from './kit.js';

/**
 * Bottom-anchored action area (PRD 8.5: one primary action, bottom-anchored).
 * Inside ScreenFrame's `footer` it only stacks its children (the frame already pads for the
 * safe area); used anywhere else it sticks to the bottom with its own hairline and safe-area padding.
 */
export default function BottomAction({ children, className }) {
  const inFooter = useFooterContext();
  if (inFooter) return <div className={cx('flex flex-col gap-3', className)}>{children}</div>;
  return (
    <div className={cx('gutter pb-safe sticky bottom-0 z-10 border-t border-line bg-bg pt-3', className)}>
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3">{children}</div>
    </div>
  );
}
