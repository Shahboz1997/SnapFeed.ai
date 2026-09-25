import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Root error boundary — Ads traffic must never land on a blank white screen.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.assign('/');
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-white px-6 text-center">
          <h1 className="font-display text-xl font-bold text-zinc-900">Something went wrong</h1>
          <p className="max-w-sm text-sm text-zinc-500">
            Please reload the page. If this keeps happening, try again in a moment.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
