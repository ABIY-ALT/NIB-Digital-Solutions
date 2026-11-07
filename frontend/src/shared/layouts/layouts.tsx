'use client';

import { Dialog as DialogPrimitive } from 'radix-ui';
import { Menu, X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/lib/cn';
import { useUiStore } from '@/shared/stores/ui-store';
import { Button } from '@/shared/ui/button';
import { AppHeader, type ShellLabels } from './app-header';
import type { BreadcrumbConfig } from '@/infrastructure/config/app-config.schema';
import type { TopNavConfig } from '@/infrastructure/config/theme';
import { AppBreadcrumbs } from './app-breadcrumbs';
import { SidebarNav, type ResolvedNavSection } from './navigation';
import { TopNav } from './top-nav';

export interface ShellProps {
  sections: ResolvedNavSection[];
  labels: ShellLabels;
  homeHref: string;
  /** Brand block (logo + product name). */
  brand: ReactNode;
  /** Compact brand for the collapsed sidebar. */
  brandMark: ReactNode;
  /** Header actions (notifications, locale switcher, user menu). */
  headerActions: ReactNode;
  /** Sidebar footer (signed-in user card). */
  sidebarFooter?: ReactNode;
  initialCollapsed: boolean;
  collapsible: boolean;
  /** Breadcrumb settings (appConfig.breadcrumbs). */
  breadcrumbs: BreadcrumbConfig;
  /** Page content width (theme.contentWidth). */
  contentWidth?: 'full' | 'contained';
  /** Top navigation settings for the horizontal layout (theme.topNav). */
  topNav?: TopNavConfig;
  children: ReactNode;
}

/** Sidebar body shared by the desktop rail and the mobile drawer. */
function SidebarBody({
  sections,
  labels,
  brand,
  brandMark,
  footer,
  collapsed,
}: Readonly<{
  sections: ResolvedNavSection[];
  labels: ShellLabels;
  brand: ReactNode;
  brandMark: ReactNode;
  footer?: ReactNode;
  collapsed: boolean;
}>) {
  return (
    <>
      <div
        className={cn(
          'relative flex shrink-0 items-center overflow-hidden',
          collapsed ? 'min-h-14 justify-center' : 'min-h-[78px] px-4 py-2',
        )}
      >
        {collapsed ? brandMark : brand}
        <div className="divider-brand absolute inset-x-0 bottom-0" aria-hidden />
      </div>
      <SidebarNav
        sections={sections}
        collapsed={collapsed}
        searchLabel={labels.searchMenu}
        noResultsLabel={labels.noResults}
      />
      {footer ? (
        <div className={cn('relative shrink-0', collapsed ? 'px-1 py-2' : 'px-2.5 pt-2.5 pb-3')}>
          <div
            className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent"
            aria-hidden
          />
          {footer}
        </div>
      ) : null}
    </>
  );
}

/** Slide-out navigation for small screens (both layouts); closes on navigation. */
function MobileNav({
  sections,
  labels,
  brand,
  brandMark,
  footer,
}: Readonly<{
  sections: ResolvedNavSection[];
  labels: ShellLabels;
  brand: ReactNode;
  brandMark: ReactNode;
  footer?: ReactNode;
}>) {
  const open = useUiStore((s) => s.mobileNavOpen);
  const setOpen = useUiStore((s) => s.setMobileNavOpen);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname, setOpen]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
        <DialogPrimitive.Content className="surface-honeycomb fixed inset-y-0 start-0 z-50 flex w-72 flex-col shadow-overlay outline-none lg:hidden">
          <DialogPrimitive.Title className="sr-only">{labels.openMenu}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {labels.openMenu}
          </DialogPrimitive.Description>
          <DialogPrimitive.Close asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close"
              className="absolute end-2 top-2 z-10"
            >
              <X />
            </Button>
          </DialogPrimitive.Close>
          <SidebarBody
            sections={sections}
            labels={labels}
            brand={brand}
            brandMark={brandMark}
            footer={footer}
            collapsed={false}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function SkipLink({ label }: Readonly<{ label: string }>) {
  return (
    <a
      href="#main-content"
      className="sr-only z-50 rounded-control bg-primary px-3 py-2 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
    >
      {label}
    </a>
  );
}

/** Vertical layout (default): collapsible sidebar + header + main content. */
export function VerticalLayout({
  sections,
  labels,
  homeHref,
  brand,
  brandMark,
  headerActions,
  sidebarFooter,
  initialCollapsed,
  collapsible,
  breadcrumbs,
  contentWidth = 'full',
  children,
}: Readonly<ShellProps>) {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const setCollapsed = useUiStore((s) => s.setSidebarCollapsed);

  useEffect(() => setCollapsed(initialCollapsed), [initialCollapsed, setCollapsed]);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <SkipLink label={labels.skipToContent} />
      <aside
        className={cn(
          'surface-honeycomb relative z-30 hidden h-dvh shrink-0 flex-col overflow-hidden border-e border-border shadow-[1px_0_0_rgb(15_23_42/0.02),4px_0_12px_rgb(15_23_42/0.03)] transition-[width] duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)] lg:flex',
          collapsed ? 'w-sidebar-collapsed' : 'w-sidebar',
        )}
      >
        <SidebarBody
          sections={sections}
          labels={labels}
          brand={brand}
          brandMark={brandMark}
          footer={sidebarFooter}
          collapsed={collapsed}
        />
      </aside>

      <MobileNav
        sections={sections}
        labels={labels}
        brand={brand}
        brandMark={brandMark}
        footer={sidebarFooter}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AppHeader
          sections={sections}
          labels={labels}
          homeHref={homeHref}
          actions={headerActions}
          collapsible={collapsible}
          breadcrumbs={breadcrumbs}
        />
        <main
          id="main-content"
          tabIndex={-1}
          className="scrollbar-thin relative flex-1 overflow-x-hidden overflow-y-auto p-page outline-none"
        >
          {/* In "header" placement the top bar hides the trail on phones, so a compact one is shown here. */}
          <AppBreadcrumbs
            sections={sections}
            homeHref={homeHref}
            config={breadcrumbs}
            labels={labels}
            variant={breadcrumbs.placement === 'content' ? 'content' : 'compact'}
            className={cn('mb-3', breadcrumbs.placement === 'header' && 'sm:hidden')}
          />
          {contentWidth === 'contained' ? (
            <div className="mx-auto max-w-7xl">{children}</div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}

/**
 * Horizontal layout: brand + top navigation (section dropdowns, see
 * theme.topNav) + main content. Below the lg breakpoint the bar gives way to a
 * menu button and the same slide-out navigation as the vertical layout.
 */
export function HorizontalLayout({
  sections,
  labels,
  homeHref,
  brand,
  brandMark,
  headerActions,
  sidebarFooter,
  breadcrumbs,
  contentWidth = 'full',
  topNav,
  children,
}: Readonly<ShellProps>) {
  const setMobileOpen = useUiStore((s) => s.setMobileNavOpen);
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink label={labels.skipToContent} />
      <MobileNav
        sections={sections}
        labels={labels}
        brand={brand}
        brandMark={brandMark}
        footer={sidebarFooter}
      />
      <header className="surface-honeycomb sticky top-0 z-30 flex h-header items-center gap-4 border-b border-border px-4">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={labels.openMenu}
          onClick={() => setMobileOpen(true)}
          className="lg:hidden"
        >
          <Menu />
        </Button>
        {brand}
        <TopNav sections={sections} config={topNav} className="hidden lg:block" />
        <div className="ms-auto flex items-center gap-1">{headerActions}</div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          'relative w-full flex-1 p-page outline-none',
          contentWidth === 'contained' && 'mx-auto max-w-7xl',
        )}
      >
        <AppBreadcrumbs
          sections={sections}
          homeHref={homeHref}
          config={breadcrumbs}
          labels={labels}
          variant="content"
          className="mb-3"
        />
        {children}
      </main>
    </div>
  );
}

/** Blank layout: centred content for sign-in, errors and splash pages. */
export function BlankLayout({
  children,
  footer,
}: Readonly<{ children: ReactNode; footer?: ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <main id="main-content" className="flex flex-1 items-center justify-center p-6">
        {children}
      </main>
      {footer ? (
        <footer className="p-4 text-center text-xs text-subtle-foreground">{footer}</footer>
      ) : null}
    </div>
  );
}

/** Split layout: two panels (e.g. brand/illustration + form, or list + detail). */
export function SplitLayout({
  aside,
  children,
  asideClassName,
}: Readonly<{
  aside: ReactNode;
  children: ReactNode;
  asideClassName?: string;
}>) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className={cn('hidden lg:flex', asideClassName)}>{aside}</aside>
      <main id="main-content" className="flex items-center justify-center p-6">
        {children}
      </main>
    </div>
  );
}

/** Fullscreen layout: immersive screens with a minimal exit bar. */
export function FullscreenLayout({
  title,
  exit,
  children,
}: Readonly<{
  title: ReactNode;
  exit: ReactNode;
  children: ReactNode;
}>) {
  return (
    <div className="flex h-dvh flex-col bg-background">
      <div className="flex h-header shrink-0 items-center justify-between border-b border-border bg-surface px-4">
        <p className="text-sm font-semibold">{title}</p>
        {exit}
      </div>
      <main id="main-content" className="relative min-h-0 flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
