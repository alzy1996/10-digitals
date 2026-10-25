import { Component } from 'react';
import ErrorState from '../components/ErrorState.jsx';
import { translate } from '../lib/i18n/useT.js';

function currentLang() {
  return typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'ar';
}

// A screen that throws must never leave a blank page in the chair: show a calm message
// with a reload. Work already written is safe (writes are queued on the phone).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('LIHYA screen error', error, info && info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const lang = currentLang();
    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg text-text gutter">
        <ErrorState
          title={translate(lang, 'common.crashTitle')}
          message={translate(lang, 'common.error')}
          retryLabel={translate(lang, 'common.reload')}
          onRetry={() => window.location.reload()}
        />
      </main>
    );
  }
}
