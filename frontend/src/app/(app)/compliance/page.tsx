import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireUser } from '@/features/auth/api/session';
import { CompliancePage } from '@/features/compliance/components/compliance-page';
import { PageSkeleton } from '@/shared/ui/feedback';

export const metadata: Metadata = { title: 'Security & compliance' };

export default async function Page() {
  await requireUser({ permission: 'compliance:read' });
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CompliancePage />
    </Suspense>
  );
}
