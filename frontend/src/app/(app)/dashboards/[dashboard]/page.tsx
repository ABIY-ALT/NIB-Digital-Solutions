import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Prefetch } from '@/features/auth/api/prefetch';
import { requireUser } from '@/features/auth/api/session';
import {
  availableDashboardIds,
  dashboardQuery,
  openableDashboard,
} from '@/features/dashboards/api/dashboards.routes';
import { DashboardPage } from '@/features/dashboards/components/dashboard-page';
import { parseRange } from '@/features/dashboards/lib/range';
import { findDashboard } from '@/features/dashboards/registry';

interface Props {
  params: Promise<{ dashboard: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const definition = findDashboard((await params).dashboard);
  if (!definition) return { title: 'Dashboards' };
  const t = await getTranslations('dashboards.catalogue');
  return { title: t(`${definition.id}.title`) };
}

/**
 * /dashboards/{id}?range=30d — any catalogue dashboard. Unknown, switched-off
 * (feature flag) and forbidden dashboards are 404, like a page that does not exist.
 * Access: signed in (layout), plus the dashboard's own `requires` from the registry.
 */
export default async function Page({ params, searchParams }: Readonly<Props>) {
  const user = await requireUser();
  const definition = openableDashboard((await params).dashboard, user);
  if (!definition) notFound();
  const range = parseRange((await searchParams).range, definition);
  return (
    <Prefetch queries={[dashboardQuery(definition.id, range)]}>
      <DashboardPage
        id={definition.id}
        initialRange={range}
        available={availableDashboardIds(user)}
      />
    </Prefetch>
  );
}
