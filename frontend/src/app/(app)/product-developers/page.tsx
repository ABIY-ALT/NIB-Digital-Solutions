import type { Metadata } from 'next';
import { listQuery, pageListParams, Prefetch } from '@/features/auth/api/prefetch';
import { requireUser } from '@/features/auth/api/session';
import { ProductDevelopersPage } from '@/features/product-developers/components/product-developers-page';
import { productDevelopersResource } from '@/features/product-developers/resource';

export const metadata: Metadata = { title: 'Product developers' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser({ permission: 'product-developers:read' });
  const params = pageListParams(await searchParams, productDevelopersResource);
  return (
    <Prefetch queries={[listQuery(productDevelopersResource, params)]}>
      <ProductDevelopersPage />
    </Prefetch>
  );
}
