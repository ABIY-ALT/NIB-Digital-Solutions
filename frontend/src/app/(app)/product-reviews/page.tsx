import type { Metadata } from 'next';
import { listQuery, pageListParams, Prefetch } from '@/features/auth/api/prefetch';
import { requireUser } from '@/features/auth/api/session';
import { ProductReviewsPage } from '@/features/product-reviews/components/product-reviews-page';
import { productReviewsResource } from '@/features/product-reviews/resource';

export const metadata: Metadata = { title: 'Product reviews' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser({ permission: 'product-reviews:read' });
  const params = pageListParams(await searchParams, productReviewsResource);
  return (
    <Prefetch queries={[listQuery(productReviewsResource, params)]}>
      <ProductReviewsPage />
    </Prefetch>
  );
}
