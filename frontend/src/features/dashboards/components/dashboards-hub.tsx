'use client';

import { ArrowRight, LayoutGrid } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { NavIcon } from '@/shared/layouts/navigation';
import { EmptyState } from '@/shared/ui/feedback';
import { PageHeader } from '@/shared/ui/page-header';
import { DASHBOARD_CATEGORIES, findDashboard } from '../registry';
import type { DashboardId } from '../types';

/** /dashboards — the catalogue this user may open, grouped by category. */
export function DashboardsHub({ available }: Readonly<{ available: readonly DashboardId[] }>) {
  const t = useTranslations('dashboards');
  const groups = DASHBOARD_CATEGORIES.map((category) => ({
    category,
    items: available.filter((id) => findDashboard(id)?.category === category),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <PageHeader title={t('hub.title')} description={t('hub.description')} icon={<LayoutGrid />} />
      {groups.length === 0 ? (
        <EmptyState icon={<LayoutGrid />} title={t('hub.empty')} />
      ) : (
        <div className="space-y-7">
          {groups.map((group) => (
            <section key={group.category} aria-labelledby={`dashboards-${group.category}`}>
              <h2
                id={`dashboards-${group.category}`}
                className="mb-3 text-sm font-semibold text-muted-foreground"
              >
                {t(`hub.categories.${group.category}`)}
              </h2>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {group.items.map((id) => (
                  <li key={id}>
                    <Link
                      href={`/dashboards/${id}`}
                      className="group flex h-full flex-col gap-3 rounded-surface border border-border bg-surface p-4 shadow-card transition-shadow outline-none hover:shadow-raised focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex size-10 items-center justify-center rounded-control bg-primary-soft text-primary-text">
                        <NavIcon name={findDashboard(id)?.icon} className="size-5" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold">
                          {t(`catalogue.${id}.title`)}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {t(`catalogue.${id}.description`)}
                        </span>
                      </span>
                      <span className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-primary-text">
                        {t('hub.open')}
                        <ArrowRight
                          className="size-3.5 transition-transform group-hover:translate-x-0.5 rtl:rotate-180"
                          aria-hidden
                        />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
