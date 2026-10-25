import Skeleton from './Skeleton.jsx';
import { useOptionalT } from './kit.js';

/**
 * Full-screen skeleton shown while a screen's code loads (Suspense fallback) or while a
 * screen waits for its first data. No router or data dependencies.
 */
export default function ScreenFallback({ label }) {
  const { t } = useOptionalT();
  return (
    <div role="status" aria-busy="true" className="flex h-[100dvh] flex-col bg-bg">
      <span className="sr-only">{label || t('common.loading')}</span>
      <div className="pt-safe shrink-0 border-b border-line">
        <div className="gutter flex h-14 items-center gap-3">
          <Skeleton className="h-6 w-40" />
          <div className="flex-1" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>
      <div className="gutter mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-4 overflow-hidden py-4">
        <Skeleton rounded="card" className="aspect-[4/3] w-full" />
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton rounded="card" className="aspect-[4/5] w-full" />
          <Skeleton rounded="card" className="aspect-[4/5] w-full" />
        </div>
      </div>
      <div className="gutter pb-safe shrink-0 border-t border-line pt-3">
        <div className="mx-auto w-full max-w-[640px]">
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    </div>
  );
}
