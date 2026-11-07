import type { Metadata } from 'next';
import { listQuery, pageListParams, Prefetch } from '@/features/auth/api/prefetch';
import { requireUser } from '@/features/auth/api/session';
import { ProductQuestionsPage } from '@/features/product-questions/components/product-questions-page';
import { productQuestionsResource } from '@/features/product-questions/resource';

export const metadata: Metadata = { title: 'Product questions' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser({ permission: 'product-questions:read' });
  const params = pageListParams(await searchParams, productQuestionsResource);
  return (
    <Prefetch queries={[listQuery(productQuestionsResource, params)]}>
      <ProductQuestionsPage />
    </Prefetch>
  );
}
