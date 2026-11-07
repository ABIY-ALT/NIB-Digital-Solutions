import type { Metadata } from 'next';
import { listQuery, pageListParams, Prefetch } from '@/features/auth/api/prefetch';
import { requireUser } from '@/features/auth/api/session';
import { ProductIdeasPage } from '@/features/product-ideas/components/product-ideas-page';
import { productIdeasResource } from '@/features/product-ideas/resource';

export const metadata: Metadata = { title: 'Product ideas' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser({ permission: 'product-ideas:read' });
  const params = pageListParams(await searchParams, productIdeasResource);
  return (
    <Prefetch queries={[listQuery(productIdeasResource, params)]}>
      <ProductIdeasPage />
    </Prefetch>
  );
}
