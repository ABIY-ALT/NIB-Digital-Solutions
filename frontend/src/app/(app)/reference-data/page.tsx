import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireUser } from '@/features/auth/api/session';
import { ReferenceDataPage } from '@/features/reference-data/components/reference-data-page';
import { PageSkeleton } from '@/shared/ui/feedback';

export const metadata: Metadata = { title: 'Reference data' };

export default async function Page() {
  await requireUser({ permission: 'reference-data:read' });
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReferenceDataPage />
    </Suspense>
  );
}
