import type { Metadata } from 'next';
import { requireUser } from '@/features/auth/api/session';
import { ProductEditor } from '@/features/marketplace-admin/components/product-editor';

export const metadata: Metadata = { title: 'Digital product' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === 'new';
  await requireUser({ permission: isNew ? 'digital-products:create' : 'digital-products:read' });
  return <ProductEditor id={isNew ? null : id} />;
}
