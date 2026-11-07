import type { Metadata } from 'next';
import { ApprovalsPage } from '@/features/approvals/components/approvals-page';
import { requireFeature } from '@/infrastructure/config/feature-flags';
import { requireUser } from '@/features/auth/api/session';

export const metadata: Metadata = { title: 'Approvals' };

/** Maker–checker workspace: every signed-in user sees their own requests; checkers see their inbox. */
export default async function Page() {
  requireFeature('approvals');
  await requireUser();
  return <ApprovalsPage />;
}
