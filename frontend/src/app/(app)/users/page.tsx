import type { Metadata } from 'next';
import { listQuery, pageListParams, Prefetch } from '@/features/auth/api/prefetch';
import { requireUser } from '@/features/auth/api/session';
import { UsersPage } from '@/features/users/components/users-page';
import { usersResource } from '@/features/users/resource';

export const metadata: Metadata = { title: 'Users' };

export default async function Page({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  await requireUser({ permission: 'users:read' });
  const params = pageListParams(await searchParams, usersResource);
  return (
    <Prefetch queries={[listQuery(usersResource, params)]}>
      <UsersPage />
    </Prefetch>
  );
}
