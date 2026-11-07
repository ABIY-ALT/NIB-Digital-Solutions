import type { Metadata } from 'next';
import { AuditLogPage } from '@/features/audit/components/audit-log-page';
import { auditResource } from '@/features/audit/resource';
import { listQuery, pageListParams, Prefetch } from '@/features/auth/api/prefetch';
import { requireUser } from '@/features/auth/api/session';
import { requireFeature } from '@/infrastructure/config/feature-flags';

export const metadata: Metadata = { title: 'Audit log' };

export default async function Page({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  requireFeature('auditLog');
  await requireUser({ permission: 'audit:read' });
  const params = pageListParams(await searchParams, auditResource);
  return (
    <Prefetch queries={[listQuery(auditResource, params)]}>
      <AuditLogPage />
    </Prefetch>
  );
}
