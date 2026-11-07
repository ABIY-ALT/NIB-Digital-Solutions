import type { Metadata } from 'next';
import { requireUser } from '@/features/auth/api/session';
import { availableDashboardIds } from '@/features/dashboards/api/dashboards.routes';
import { DashboardsHub } from '@/features/dashboards/components/dashboards-hub';

export const metadata: Metadata = { title: 'Dashboards' };

export default async function Page() {
  const user = await requireUser();
  return <DashboardsHub available={availableDashboardIds(user)} />;
}
