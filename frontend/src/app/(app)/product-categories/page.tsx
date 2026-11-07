import type { Metadata } from 'next';
import { listQuery, pageListParams, Prefetch } from '@/features/auth/api/prefetch';
import { requireUser } from '@/features/auth/api/session';
import { ProductCategoriesPage } from '@/features/product-categories/components/product-categories-page';
import { productCategoriesResource } from '@/features/product-categories/resource';

export const metadata: Metadata = { title: 'Product categories' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser({ permission: 'product-categories:read' });
  const params = pageListParams(await searchParams, productCategoriesResource);
  return (
    <Prefetch queries={[listQuery(productCategoriesResource, params)]}>
      <ProductCategoriesPage />
    </Prefetch>
  );
}
