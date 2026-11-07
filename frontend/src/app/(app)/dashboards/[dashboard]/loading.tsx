'use client';

import { useParams } from 'next/navigation';
import { DashboardPageSkeleton } from '@/features/dashboards/components/dashboard-skeleton';
import { findDashboard } from '@/features/dashboards/registry';

/** Shown while the server prepares /dashboards/{id}: that dashboard's own layout, not a generic one. */
export default function Loading() {
  const { dashboard } = useParams<{ dashboard: string }>();
  return <DashboardPageSkeleton id={findDashboard(dashboard)?.id} />;
}
