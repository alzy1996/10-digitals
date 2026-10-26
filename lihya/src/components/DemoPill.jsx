import { useContext, useState } from 'react';
import Button from './Button.jsx';
import Icon from './Icon.jsx';
import Sheet from './Sheet.jsx';
import { DemoContext, cx, useOptionalT } from './kit.js';

const LINES = Object.freeze([
  { icon: 'link', key: 'demo.sheet.links' },
  { icon: 'cloud', key: 'demo.sheet.ai' },
  { icon: 'lock', key: 'demo.sheet.photos' },
  { icon: 'refresh', key: 'demo.sheet.reset' },
]);

/**
 * Demo mode indicator for every top bar: a small brass-outlined "Demo" pill (44 px tap area)
 * that opens a short sheet: no login, everything stays in this browser, Look Codes and the
 * shop link open only here, AI preview is off, and a Reset demo button. Renders nothing
 * outside demo mode (no DemoContext value).
 */
export default function DemoPill({ className }) {
  const demo = useContext(DemoContext);
  const { t } = useOptionalT();
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  if (!demo) return null;

  const reset = () => {
    if (resetting) return;
    setResetting(true);
    Promise.resolve(demo.reset()).catch((err) => {
      console.warn('Reset demo did not finish', err);
      setResetting(false);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={t('demo.pill.label')}
        data-demo-pill=""
        className={cx('press inline-flex min-h-tap min-w-tap shrink-0 items-center justify-center rounded-ctl px-1', className)}
      >
        <span className="inline-flex min-h-7 items-center rounded-full border border-brass/70 px-2.5 text-xs font-semibold leading-none text-brass">
          {t('demo.pill')}
        </span>
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('demo.sheet.title')}
        footer={
          <Button variant="secondary" icon="refresh" full loading={resetting} onClick={reset} data-demo-reset="">
            {t('demo.reset')}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-base text-text">{t('demo.sheet.lead')}</p>
          <hr className="rule-brass w-16" />
          <ul className="flex flex-col gap-3">
            {LINES.map((l) => (
              <li key={l.key} className="flex items-start gap-3 text-sm text-text-2">
                <Icon name={l.icon} size={20} className="mt-0.5 shrink-0 text-brass" />
                <span className="min-w-0 flex-1">{t(l.key)}</span>
              </li>
            ))}
          </ul>
        </div>
      </Sheet>
    </>
  );
}
