'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Button } from '@/shared/ui/button';
import { reportClientError } from '@/shared/errors/report-error';
import { ErrorState } from '@/shared/ui/feedback';

/** Route-level error boundary for the authenticated area (unexpected crashes). */
export default function AppError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  const t = useTranslations();
  useEffect(() => {
    reportClientError(error, { kind: 'route', digest: error.digest });
  }, [error]);
  return (
    <ErrorState
      className="rounded-surface border border-border bg-surface"
      title={t('errors.title')}
      description={t('errors.description')}
      correlationId={error.digest}
      referenceLabel={t('common.reference')}
      action={<Button onClick={reset}>{t('common.retry')}</Button>}
    />
  );
}
