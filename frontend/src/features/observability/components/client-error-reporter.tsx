'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/shared/errors/report-error';

/** Reports uncaught errors and unhandled promise rejections (mounted once in Providers). */
export function ClientErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) =>
      reportClientError(e.error ?? e.message, { kind: 'unhandled' });
    const onRejection = (e: PromiseRejectionEvent) =>
      reportClientError(e.reason, { kind: 'rejection' });
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}
