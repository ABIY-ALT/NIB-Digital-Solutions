import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { BlankLayout } from '@/shared/layouts/layouts';
import { Button } from '@/shared/ui/button';
import { ErrorState } from '@/shared/ui/feedback';

export const metadata: Metadata = { title: 'Access denied' };

export default async function ForbiddenPage() {
  const t = await getTranslations();
  return (
    <BlankLayout>
      <ErrorState
        variant="forbidden"
        title={t('errors.forbiddenTitle')}
        description={t('errors.forbiddenDescription')}
        action={
          <Button asChild>
            <Link href="/dashboard">{t('common.goHome')}</Link>
          </Button>
        }
      />
    </BlankLayout>
  );
}
