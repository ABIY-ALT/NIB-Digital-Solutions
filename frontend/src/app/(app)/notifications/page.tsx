import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireUser } from '@/features/auth/api/session';
import { NotificationCenter } from '@/features/notifications/components/notification-center';
import { PageSkeleton } from '@/shared/ui/feedback';

export const metadata: Metadata = { title: 'Notifications' };

export default async function Page() {
  await requireUser();
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NotificationCenter />
    </Suspense>
  );
}
