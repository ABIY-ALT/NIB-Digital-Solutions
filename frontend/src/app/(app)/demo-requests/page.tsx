import type { Metadata } from 'next';
import { listQuery, pageListParams, Prefetch } from '@/features/auth/api/prefetch';
import { requireUser } from '@/features/auth/api/session';
import { DemoRequestsPage } from '@/features/demo-requests/components/demo-requests-page';
import { demoRequestsResource } from '@/features/demo-requests/resource';

export const metadata: Metadata = { title: 'Demo requests' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser({ permission: 'demo-requests:read' });
  const params = pageListParams(await searchParams, demoRequestsResource);
  return (
    <Prefetch queries={[listQuery(demoRequestsResource, params)]}>
      <DemoRequestsPage />
    </Prefetch>
  );
}
