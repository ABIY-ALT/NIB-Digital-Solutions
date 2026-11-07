'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportClientError } from '@/shared/errors/report-error';

/**
 * Catches render errors in a subtree (widgets, panels) so one failure does not
 * blank the page. Route-level errors are handled by app/error.tsx.
 */
export class ErrorBoundary extends Component<
  {
    fallback: (error: Error, reset: () => void) => ReactNode;
    children: ReactNode;
    onError?: (error: Error, info: ErrorInfo) => void;
  },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError(error, {
      kind: 'boundary',
      componentStack: info.componentStack ?? undefined,
    });
    this.props.onError?.(error, info);
  }

  reset = () => this.setState({ error: null });

  override render() {
    return this.state.error
      ? this.props.fallback(this.state.error, this.reset)
      : this.props.children;
  }
}
