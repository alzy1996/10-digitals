import Icon from './Icon.jsx';
import { useT } from '../lib/i18n/useT.js';
import { cx } from './kit.js';

/** Language switch on every screen: shows the other language's name and toggles to it. */
export default function LangToggle({ className }) {
  const { t, lang, toggleLang } = useT();
  const other = lang === 'ar' ? 'en' : 'ar';
  return (
    <button
      type="button"
      onClick={toggleLang}
      title={t('lang.toggleLabel')}
      className={cx(
        'press inline-flex min-h-tap min-w-tap shrink-0 items-center justify-center gap-1.5 rounded-ctl px-2.5 text-sm font-medium text-text-2 active:bg-surface-2',
        className,
      )}
    >
      <Icon name="globe" size={20} className="hidden sm:inline-block" />
      <span lang={other}>{t('lang.toggle')}</span>
      <span className="sr-only">{t('lang.toggleLabel')}</span>
    </button>
  );
}
