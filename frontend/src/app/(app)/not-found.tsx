import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { appConfig } from '@/infrastructure/config/app.config';
import { Button } from '@/shared/ui/button';
import { ErrorState } from '@/shared/ui/feedback';

/** A record or screen inside the staff portal that does not exist (shown within the portal). */
export default async function AppNotFound() {
  const t = await getTranslations();
  return (
    <ErrorState
      className="rounded-surface border border-border bg-surface"
      title={t('errors.notFoundTitle')}
      description={t('errors.notFoundDescription')}
      action={
        <Button asChild>
          <Link href={appConfig.app.homePath}>{t('common.goHome')}</Link>
        </Button>
      }
    />
  );
}
