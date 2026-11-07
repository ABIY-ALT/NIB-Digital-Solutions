'use client';

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavigationMenu as Nav } from 'radix-ui';
import type { SyntheticEvent } from 'react';
import type { TopNavConfig } from '@/infrastructure/config/theme';
import { cn } from '@/shared/lib/cn';
import { isActive, NavIcon, type ResolvedNavItem, type ResolvedNavSection } from './navigation';
import { buildTopNav, menuItems, type TopNavMenu } from './top-nav-model';

/**
 * Horizontal top navigation. By default each labelled navigation section is a
 * dropdown (Administration ▾ → Users, Roles, Reference data) and unlabelled
 * sections are links in the bar; see `theme.topNav` and a section's `topNav`
 * in app.config.ts. Built on Radix NavigationMenu: hover intent, click,
 * keyboard (Tab, Enter/Space, arrows, Esc) and ARIA for free.
 */
export const DEFAULT_TOP_NAV: TopNavConfig = {
  grouping: 'sections',
  inlineSingleItem: true,
  openOnHover: true,
  showIcons: true,
  showDescriptions: true,
};

const barItem =
  'flex h-header items-center gap-2 border-b-2 px-3 text-sm whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset';
const barActive = 'border-primary font-semibold text-foreground';
const barIdle = 'border-transparent text-muted-foreground hover:text-foreground';

/** Radix opens on pointer movement; cancelling these events makes a menu click-only. */
const noHover = {
  onPointerMove: (e: SyntheticEvent) => e.preventDefault(),
  onPointerLeave: (e: SyntheticEvent) => e.preventDefault(),
};

export function TopNav({
  sections,
  config = DEFAULT_TOP_NAV,
  className,
}: Readonly<{
  sections: ResolvedNavSection[];
  config?: TopNavConfig;
  className?: string;
}>) {
  const pathname = usePathname();
  const entries = buildTopNav(sections, config);
  const hover = config.openOnHover ? {} : noHover;

  return (
    <Nav.Root aria-label="Main" delayDuration={120} className={cn('relative min-w-0', className)}>
      <Nav.List
        className={cn(
          'flex items-center gap-1',
          // Flat bars can outgrow the header; dropdown bars must not clip their panels.
          config.grouping === 'flat' && 'scrollbar-thin overflow-x-auto',
        )}
      >
        {entries.map((entry) =>
          entry.kind === 'link' ? (
            <Nav.Item key={entry.item.id}>
              <BarLink item={entry.item} pathname={pathname} showIcon={config.showIcons} />
            </Nav.Item>
          ) : (
            <Nav.Item key={entry.id} className="relative">
              <Nav.Trigger
                {...hover}
                className={cn(
                  barItem,
                  'group',
                  menuItems(entry).some((i) => isActive(pathname, i.href)) ? barActive : barIdle,
                  'data-[state=open]:text-foreground',
                )}
              >
                {config.showIcons && entry.icon ? (
                  <NavIcon name={entry.icon} className="size-4" />
                ) : null}
                {entry.label}
                <ChevronDown
                  className="size-3.5 opacity-60 transition-transform group-data-[state=open]:rotate-180"
                  aria-hidden
                />
              </Nav.Trigger>
              <Nav.Content
                {...hover}
                className="absolute start-0 top-full z-40 mt-px data-[motion^=from-]:animate-in data-[motion^=from-]:fade-in-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1"
              >
                <MenuPanel menu={entry} pathname={pathname} config={config} />
              </Nav.Content>
            </Nav.Item>
          ),
        )}
      </Nav.List>
    </Nav.Root>
  );
}

function BarLink({
  item,
  pathname,
  showIcon,
}: Readonly<{
  item: ResolvedNavItem;
  pathname: string;
  showIcon: boolean;
}>) {
  const active = isActive(pathname, item.href);
  return (
    <Nav.Link asChild active={active}>
      <Link
        href={item.href ?? '#'}
        aria-current={active ? 'page' : undefined}
        className={cn(barItem, active ? barActive : barIdle)}
      >
        {showIcon ? <NavIcon name={item.icon} className="size-4" /> : null}
        {item.label}
        {item.badge ? <Badge value={item.badge} /> : null}
      </Link>
    </Nav.Link>
  );
}

/** Dropdown body: groups of pages; two columns once a menu grows past six pages. */
function MenuPanel({
  menu,
  pathname,
  config,
}: Readonly<{
  menu: TopNavMenu;
  pathname: string;
  config: TopNavConfig;
}>) {
  const wide = menuItems(menu).length > 6;
  return (
    <div
      className={cn(
        'rounded-surface border border-border bg-surface p-1.5 shadow-overlay',
        wide ? 'w-[36rem]' : 'w-72',
        'max-w-[calc(100vw-2rem)]',
      )}
    >
      {menu.groups.map((group, gi) => (
        <div key={group.id} className={cn(gi > 0 && 'mt-1.5 border-t border-border pt-1.5')}>
          {group.label ? (
            <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold tracking-wide text-subtle-foreground uppercase">
              {group.label}
            </p>
          ) : null}
          <ul className={cn('grid gap-0.5', wide && 'grid-cols-2')}>
            {group.items.map((item) => (
              <li key={item.id}>
                <MenuLink item={item} pathname={pathname} config={config} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function MenuLink({
  item,
  pathname,
  config,
}: Readonly<{
  item: ResolvedNavItem;
  pathname: string;
  config: TopNavConfig;
}>) {
  const active = isActive(pathname, item.href);
  const description = config.showDescriptions ? item.description : undefined;
  return (
    <Nav.Link asChild active={active}>
      <Link
        href={item.href ?? '#'}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group flex items-start gap-3 rounded-item px-2.5 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
          active ? 'bg-primary-softer' : 'hover:bg-hover focus-visible:bg-hover',
        )}
      >
        {config.showIcons ? (
          <span
            className={cn(
              'mt-px flex size-8 shrink-0 items-center justify-center rounded-control transition-colors',
              active
                ? 'bg-primary-soft text-primary-text'
                : 'bg-surface-muted text-muted-foreground group-hover:text-foreground',
            )}
            aria-hidden
          >
            <NavIcon name={item.icon} className="size-4" />
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'flex items-center gap-2 font-medium',
              active ? 'font-semibold text-primary-text' : 'text-foreground',
            )}
          >
            <span className="truncate">{item.label}</span>
            {item.badge ? <Badge value={item.badge} /> : null}
          </span>
          {description ? (
            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
              {description}
            </span>
          ) : null}
        </span>
      </Link>
    </Nav.Link>
  );
}

function Badge({ value }: Readonly<{ value: string }>) {
  return (
    <span className="rounded-pill bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
      {value}
    </span>
  );
}
