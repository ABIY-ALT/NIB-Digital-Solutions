'use client';

import type { BreadcrumbConfig } from '@/infrastructure/config/app-config.schema';
import { Breadcrumbs } from '@/shared/ui/breadcrumbs';
import { useBreadcrumbTrail, type ResolvedNavSection } from './navigation';

export interface BreadcrumbShellLabels {
  home: string;
  breadcrumb: string;
  showHiddenPath: string;
  switchTo: string;
}

/**
 * The application's breadcrumb trail: navigation config + page overrides,
 * styled by `appConfig.breadcrumbs`.
 *   header  — in the top bar;
 *   content — above the page title (full trail);
 *   compact — phones: home icon + last crumb, the rest behind "…".
 */
export function AppBreadcrumbs({
  sections,
  homeHref,
  config,
  labels,
  variant,
  className,
}: Readonly<{
  sections: ResolvedNavSection[];
  homeHref: string;
  config: BreadcrumbConfig;
  labels: BreadcrumbShellLabels;
  variant: 'header' | 'content' | 'compact';
  className?: string;
}>) {
  const trail = useBreadcrumbTrail(sections, labels.home, homeHref, {
    showSection: config.showSection,
    showIcons: config.showIcons,
  });
  if (!config.enabled || !trail || trail.length === 0) return null;
  const compact = variant === 'compact';

  return (
    <Breadcrumbs
      items={trail}
      maxItems={compact ? 3 : config.maxItems}
      itemsAfterCollapse={compact ? 1 : 2}
      separator={config.separator}
      home={compact && config.home !== 'none' ? 'icon' : config.home}
      size={variant === 'header' ? 'sm' : 'md'}
      labels={{
        nav: labels.breadcrumb,
        showHidden: labels.showHiddenPath,
        switchTo: labels.switchTo,
      }}
      className={className}
    />
  );
}
