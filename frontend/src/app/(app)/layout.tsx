import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { requireUser } from '@/features/auth/api/session';
import { PermissionsProvider } from '@/features/auth/components/permissions-provider';
import { SessionGuard } from '@/features/auth/components/session-guard';
import { SidebarUserCard } from '@/features/auth/components/sidebar-user-card';
import { UserMenu } from '@/features/auth/components/user-menu';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { AccountNotices } from '@/features/profile/components/account-notices';
import { QuickSearch } from '@/features/quick-search/components/quick-search';
import { hasPermission, hasRole } from '@/features/auth/permissions';
import { isFeatureEnabled } from '@/infrastructure/config/app-config.schema';
import { appConfig } from '@/infrastructure/config/app.config';
import { filterNavigation, type NavItem } from '@/infrastructure/config/navigation';
import { LocaleSwitcher } from '@/shared/i18n/locale-switcher';
import { Brand, BrandMark } from '@/shared/layouts/brand';
import { HorizontalLayout, VerticalLayout } from '@/shared/layouts/layouts';
import type { ResolvedNavItem, ResolvedNavSection } from '@/shared/layouts/navigation';
import { SIDEBAR_COOKIE } from '@/shared/layouts/constants';
import { ThemeSwitcher } from '@/shared/theme/theme-switcher';

/**
 * Authenticated application shell. Navigation is filtered by the user's
 * permissions and feature flags and translated on the server — items the user
 * cannot access are never sent to the browser.
 */
export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await requireUser();
  const t = await getTranslations();

  const filtered = filterNavigation(appConfig.navigation, {
    can: (p) => hasPermission(user.permissions, p),
    hasRole: (r) => hasRole(user.roles, r),
    isFeatureEnabled: (f) => isFeatureEnabled(appConfig, f),
  });
  const resolveItem = (item: NavItem): ResolvedNavItem => ({
    id: item.id,
    label: t(item.labelKey),
    description: item.descriptionKey ? t(item.descriptionKey) : undefined,
    href: item.href,
    icon: item.icon,
    badge: item.badge,
    children: item.children?.map(resolveItem),
  });
  const sections: ResolvedNavSection[] = filtered.map((s) => ({
    id: s.id,
    label: s.labelKey ? t(s.labelKey) : undefined,
    icon: s.icon,
    topNav: s.topNav,
    items: s.items.map(resolveItem),
  }));

  const labels = {
    toggleSidebar: t('layout.toggleSidebar'),
    openMenu: t('layout.openMenu'),
    notifications: t('layout.notifications'),
    noNotifications: t('layout.noNotifications'),
    markAllRead: t('layout.markAllRead'),
    home: t('layout.home'),
    skipToContent: t('layout.skipToContent'),
    searchMenu: t('layout.searchMenu'),
    noResults: t('layout.noResults'),
    breadcrumb: t('layout.breadcrumb'),
    showHiddenPath: t('layout.showHiddenPath'),
    switchTo: t('layout.switchTo'),
  };
  const { theme, app, i18n, auth } = appConfig;
  const localeOptions = i18n.locales.map((code) => ({
    code,
    label: i18n.localeLabels[code] ?? code,
  }));
  const Layout = theme.layout === 'horizontal' ? HorizontalLayout : VerticalLayout;
  const initialCollapsed =
    ((await cookies()).get(SIDEBAR_COOKIE)?.value ??
      (theme.sidebar.defaultCollapsed ? '1' : '0')) === '1';

  return (
    <PermissionsProvider user={user}>
      <Layout
        sections={sections}
        labels={labels}
        homeHref={app.homePath}
        brand={
          <Brand
            name={app.name}
            short={app.shortName}
            logo={app.logo}
            tagline={app.tagline ?? t('common.appTagline')}
            href={app.homePath}
          />
        }
        brandMark={<BrandMark short={app.shortName} logo={app.logo} size={28} />}
        sidebarFooter={<SidebarUserCard locales={localeOptions} />}
        initialCollapsed={theme.sidebar.collapsible && initialCollapsed}
        collapsible={theme.sidebar.collapsible}
        breadcrumbs={appConfig.breadcrumbs}
        contentWidth={theme.contentWidth}
        topNav={theme.topNav}
        headerActions={
          <>
            <QuickSearch sections={sections} locales={localeOptions} />
            <NotificationBell />
            <ThemeSwitcher />
            <LocaleSwitcher locales={localeOptions} />
            <div className="mx-1 h-6 w-px bg-border" aria-hidden />
            <UserMenu locales={localeOptions} />
          </>
        }
      >
        <AccountNotices />
        {children}
      </Layout>
      <SessionGuard
        idleTimeoutSeconds={auth.idleTimeoutMinutes * 60}
        warningSeconds={auth.idleWarningSeconds}
      />
    </PermissionsProvider>
  );
}
