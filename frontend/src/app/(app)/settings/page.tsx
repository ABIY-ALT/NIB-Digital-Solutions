import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireUser } from '@/features/auth/api/session';
import { SettingsPage } from '@/features/settings/components/settings-page';
import { PageSkeleton } from '@/shared/ui/feedback';

export const metadata: Metadata = { title: 'Settings' };

export default async function Page() {
  await requireUser({ permission: 'settings:read' });
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SettingsPage />
    </Suspense>
  );
}
