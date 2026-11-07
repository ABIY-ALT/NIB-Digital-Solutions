import type { Metadata } from 'next';
import { listQuery, pageListParams, Prefetch } from '@/features/auth/api/prefetch';
import { requireUser } from '@/features/auth/api/session';
import { ProductInquiriesPage } from '@/features/product-inquiries/components/product-inquiries-page';
import { productInquiriesResource } from '@/features/product-inquiries/resource';

export const metadata: Metadata = { title: 'Product inquiries' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser({ permission: 'product-inquiries:read' });
  const params = pageListParams(await searchParams, productInquiriesResource);
  return (
    <Prefetch queries={[listQuery(productInquiriesResource, params)]}>
      <ProductInquiriesPage />
    </Prefetch>
  );
}
