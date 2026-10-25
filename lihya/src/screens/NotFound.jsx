import { Link } from 'react-router-dom';
import { useT } from '../lib/i18n/useT.js';
import Icon from '../components/Icon.jsx';
import LangToggle from '../components/LangToggle.jsx';

export default function NotFound() {
  const { t } = useT();
  return (
    <main className="min-h-dvh bg-bg text-text gutter pt-safe pb-safe flex flex-col">
      <div className="flex justify-end py-2">
        <LangToggle />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
        <Icon name="warning" size={40} className="text-brass" />
        <p className="text-lg">{t('error.notFound')}</p>
        <Link
          to="/"
          className="press inline-flex min-h-btn-secondary items-center justify-center rounded-ctl border border-line px-6 text-text"
        >
          {t('error.goHome')}
        </Link>
      </div>
    </main>
  );
}
