'use client';

import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { useUiStore } from '@/shared/stores/ui-store';
import { Button } from '@/shared/ui/button';
import type { BreadcrumbConfig } from '@/infrastructure/config/app-config.schema';
import { AppBreadcrumbs } from './app-breadcrumbs';
import type { ResolvedNavSection } from './navigation';

export interface ShellLabels {
  toggleSidebar: string;
  openMenu: string;
  notifications: string;
  noNotifications: string;
  markAllRead: string;
  home: string;
  skipToContent: string;
  searchMenu: string;
  noResults: string;
  breadcrumb: string;
  showHiddenPath: string;
  switchTo: string;
}

/** Top header bar: sidebar toggle, breadcrumbs, and right-side actions (notifications, locale, user). */
export function AppHeader({
  sections,
  labels,
  homeHref,
  actions,
  collapsible,
  brand,
  breadcrumbs,
}: Readonly<{
  sections: ResolvedNavSection[];
  labels: ShellLabels;
  homeHref: string;
  actions: ReactNode;
  collapsible: boolean;
  brand?: ReactNode;
  breadcrumbs: BreadcrumbConfig;
}>) {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);

  return (
    <header className="surface-honeycomb relative z-20 flex h-header shrink-0 items-center gap-2 border-b border-border px-4">
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground lg:hidden"
        aria-label={labels.openMenu}
        onClick={() => setMobileNavOpen(true)}
      >
        <Menu />
      </Button>
      {collapsible ? (
        <Button
          variant="ghost"
          size="icon"
          className="hidden text-muted-foreground lg:inline-flex"
          aria-label={labels.toggleSidebar}
          aria-pressed={collapsed}
          onClick={toggle}
        >
          {collapsed ? (
            <PanelLeftOpen className="rtl:rotate-180" />
          ) : (
            <PanelLeftClose className="rtl:rotate-180" />
          )}
        </Button>
      ) : null}
      {brand}
      {breadcrumbs.placement === 'header' ? (
        <AppBreadcrumbs
          sections={sections}
          homeHref={homeHref}
          config={breadcrumbs}
          labels={labels}
          variant="header"
          className="ms-1 hidden sm:block"
        />
      ) : null}
      <div className="ms-auto flex items-center gap-1">{actions}</div>
    </header>
  );
}
