import type { Metadata } from 'next';
import { listQuery, pageListParams, Prefetch } from '@/features/auth/api/prefetch';
import { requireUser } from '@/features/auth/api/session';
import { RolesPage } from '@/features/roles/components/roles-page';
import { rolesResource } from '@/features/roles/resource';

export const metadata: Metadata = { title: 'Roles & permissions' };

export default async function Page({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  await requireUser({ permission: 'roles:read' });
  const params = pageListParams(await searchParams, rolesResource);
  return (
    <Prefetch queries={[listQuery(rolesResource, params)]}>
      <RolesPage />
    </Prefetch>
  );
}
