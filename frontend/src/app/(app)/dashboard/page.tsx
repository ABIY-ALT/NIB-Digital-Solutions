import type { Metadata } from 'next';
import { Prefetch } from '@/features/auth/api/prefetch';
import { loadDashboard } from '@/features/dashboard/api/dashboard.routes';
import { DashboardView } from '@/features/dashboard/components/dashboard-view';
import { dashboardQueryKey } from '@/features/dashboard/types';
import { getCatalog } from '@/features/marketplace/api/catalog.server';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  // Product names for the latest leads and top products (slugs → names).
  const { products } = await getCatalog();
  return (
    <Prefetch queries={[{ queryKey: dashboardQueryKey, queryFn: loadDashboard }]}>
      <DashboardView productNames={Object.fromEntries(products.map((p) => [p.slug, p.name]))} />
    </Prefetch>
  );
}
