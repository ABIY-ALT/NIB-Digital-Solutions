import type { Metadata } from 'next';
import { listQuery, pageListParams, Prefetch } from '@/features/auth/api/prefetch';
import { requireUser } from '@/features/auth/api/session';
import { DigitalProductsPage } from '@/features/digital-products/components/digital-products-page';
import { digitalProductsResource } from '@/features/digital-products/resource';

export const metadata: Metadata = { title: 'Digital products' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser({ permission: 'digital-products:read' });
  const params = pageListParams(await searchParams, digitalProductsResource);
  return (
    <Prefetch queries={[listQuery(digitalProductsResource, params)]}>
      <DigitalProductsPage />
    </Prefetch>
  );
}
