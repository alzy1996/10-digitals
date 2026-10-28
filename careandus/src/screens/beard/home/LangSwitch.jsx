import { cx } from '../ui/kit.js';
import { useT } from '../lib/i18n.js';

const LANGS = Object.freeze([
  { value: 'ar', label: 'العربية' },
  { value: 'en', label: 'English' },
]);

/**
 * Both languages side by side, each written in its own script, the current one in brass.
 * Customers arrive from an Instagram bio or a QR code in the shop and may not read the
 * default language, so the landing shows both names instead of a single toggle.
 */
export default function LangSwitch({ className }) {
  const { t, lang, setLang } = useT();
  return (
    <div role="group" aria-label={t('beard.home.lang.label')} className={cx('inline-flex shrink-0 rounded-full border border-line bg-surface p-1', className)}>
      {LANGS.map((o) => {
        const on = lang === o.value;
        return (
          <button
            key={o.value}
            type="button"
            lang={o.value}
            aria-pressed={on}
            onClick={() => setLang(o.value)}
            className={cx(
              'press min-h-tap min-w-[76px] rounded-full px-4 text-sm font-semibold',
              on ? 'bg-plum text-onplum' : 'text-ink2 active:bg-surface2',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
