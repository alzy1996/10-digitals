import { Component } from 'react';
import ErrorState from '../components/ErrorState.jsx';
import { translate } from '../lib/i18n/useT.js';

function currentLang() {
  return typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'ar';
}

// A screen that throws must never leave a blank page in the chair: show a calm message
// with a reload. Work already written is safe (writes are queued on the phone).
// `resetKey` (the route path in App.jsx) clears the error when it changes, so Back or any
// navigation leaves the broken screen without a reload. The boundary is not remounted, so the
// shop and session providers under it keep their state.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  // Runs on every render, also right after getDerivedStateFromError: an error thrown while the
  // new route renders is kept, because the key has already been recorded for that route.
  static getDerivedStateFromProps(props, state) {
    if (props.resetKey === state.resetKey) return null;
    return { error: null, resetKey: props.resetKey };
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
