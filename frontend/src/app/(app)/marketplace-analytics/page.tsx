import type { Metadata } from 'next';
import { requireUser } from '@/features/auth/api/session';
import { getCatalog } from '@/features/marketplace/api/catalog.server';
import { MarketplaceAnalyticsView } from '@/features/marketplace-admin/components/marketplace-analytics';

export const metadata: Metadata = { title: 'Marketplace analytics' };

export default async function Page() {
  await requireUser({ permission: 'marketplace-analytics:read' });
  const { products } = await getCatalog();
  return (
    <MarketplaceAnalyticsView
      productNames={Object.fromEntries(products.map((p) => [p.slug, p.name]))}
    />
  );
}
