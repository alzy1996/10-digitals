import Icon from '../../components/Icon.jsx';
import { cx } from '../../components/kit.js';
import { useT } from '../../lib/i18n/useT.js';
import { APP } from '../../config/app.js';

/**
 * The LIHYA / لحية lockup like a shop sign: the logo mark inside a double brass ring,
 * the name in the UI language large and the other script small in brass.
 * size 'lg' (splash, centered) or 'sm' (one row, for screens with content under it).
 */
export default function BrandMark({ size = 'lg', heading: Heading = 'h1', className }) {
  const { lang } = useT();
  const main = lang === 'ar' ? { text: APP.nameAr, lang: 'ar' } : { text: APP.name, lang: 'en' };
  const other = lang === 'ar' ? { text: APP.name, lang: 'en' } : { text: APP.nameAr, lang: 'ar' };

  if (size === 'sm') {
    return (
      <div className={cx('flex items-center gap-3', className)}>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-brass/50">
          <Icon name="logo" size={28} className="text-brass" />
        </span>
        <Heading className="flex items-baseline gap-2.5">
          <span lang={main.lang} className="font-display text-2xl leading-none text-text">
            {main.text}
          </span>
          <span
            lang={other.lang}
            className={cx('font-display text-base leading-none text-brass', other.lang === 'en' && 'uppercase tracking-[0.2em]')}
          >
            {other.text}
          </span>
        </Heading>
      </div>
    );
  }

  return (
    <div className={cx('flex flex-col items-center text-center', className)}>
      <span className="flex h-[124px] w-[124px] items-center justify-center rounded-full border border-brass/35">
        <span className="flex h-[104px] w-[104px] items-center justify-center rounded-full border border-brass/80">
          <Icon name="logo" size={56} className="text-brass" />
        </span>
      </span>
      <Heading className="mt-6 flex flex-col items-center gap-3">
        <span lang={main.lang} className="font-display text-[56px] leading-none text-text">
          {main.text}
        </span>
        <span
          lang={other.lang}
          className={cx('font-display leading-none text-brass', other.lang === 'en' ? 'text-lg uppercase tracking-[0.35em]' : 'text-2xl')}
        >
          {other.text}
        </span>
      </Heading>
    </div>
  );
}
