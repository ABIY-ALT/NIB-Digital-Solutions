'use client';

import {
  Bell,
  Building2,
  ChevronDown,
  Circle,
  ClipboardCheck,
  Component,
  Database,
  FileText,
  GraduationCap,
  Handshake,
  Headset,
  IdCard,
  Images,
  Landmark,
  Lightbulb,
  MessagesSquare,
  Code2,
  Star,
  LayoutGrid,
  ChartLine,
  Scale,
  ShoppingCart,
  Truck,
  LayoutDashboard,
  Settings,
  ScrollText,
  ShieldCheck,
  UserCog,
  UserRound,
  Users,
  Search,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { fuzzyMatch } from '@/shared/lib/fuzzy';
import { fieldVariants, useFieldAppearance } from '@/shared/ui/input';
import { Tooltip } from '@/shared/ui/menu';
import type { BreadcrumbItem } from '@/shared/lib/breadcrumbs';
import { usePageBreadcrumbStore } from './page-breadcrumbs';

/**
 * Navigation already resolved on the server: filtered by permissions and
 * feature flags, labels translated. Layouts only render it.
 */
export interface ResolvedNavItem {
  id: string;
  label: string;
  /** One-line description (top-navigation dropdowns). */
  description?: string;
  href?: string;
  icon?: string;
  badge?: string;
  children?: ResolvedNavItem[];
}

export interface ResolvedNavSection {
  id: string;
  label?: string;
  icon?: string;
  /** Top-navigation display override (see NavSection.topNav). */
  topNav?: 'dropdown' | 'inline';
  items: ResolvedNavItem[];
}

/** Icons available to navigation config (extend as products need). */
const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Users,
  ScrollText,
  UserRound,
  Settings,
  ShieldCheck,
  Wallet,
  FileText,
  Building2,
  UserCog,
  ClipboardCheck,
  Bell,
  Database,
  Scale,
  Component,
  LayoutGrid,
  Handshake,
  ShoppingCart,
  ChartLine,
  Landmark,
  Truck,
  Headset,
  GraduationCap,
  IdCard,
  Images,
  Lightbulb,
  MessagesSquare,
  Code2,
  Star,
};

export function NavIcon({ name, className }: Readonly<{ name?: string; className?: string }>) {
  const Icon = (name && ICONS[name]) || Circle;
  return <Icon className={cn('size-[18px] shrink-0', className)} aria-hidden />;
}

export function isActive(pathname: string, href?: string): boolean {
  if (!href) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Filters the resolved navigation by a free-text query (sidebar search, fuzzy: "rd", "usr", typos). */
function searchNavigation(sections: ResolvedNavSection[], query: string): ResolvedNavSection[] {
  const q = query.trim();
  if (!q) return sections;
  const match = (items: ResolvedNavItem[]): ResolvedNavItem[] =>
    items.flatMap((item) => {
      const children = item.children ? match(item.children) : [];
      if (fuzzyMatch(q, { label: item.label })) return [item];
      return children.length ? [{ ...item, children }] : [];
    });
  return sections.map((s) => ({ ...s, items: match(s.items) })).filter((s) => s.items.length > 0);
}

/**
 * Vertical sidebar navigation, NIB IB style:
 *   • optional search box that filters the menu
 *   • sentence-case, collapsible group headers
 *   • active item = soft gold pill + 3px gold rail on the leading edge
 */
export function SidebarNav({
  sections,
  collapsed,
  searchLabel,
  noResultsLabel,
}: Readonly<{
  sections: ResolvedNavSection[];
  collapsed: boolean;
  searchLabel?: string;
  noResultsLabel?: string;
}>) {
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const appearance = useFieldAppearance();
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const visible = searchNavigation(sections, query);

  return (
    <>
      {!collapsed && searchLabel ? (
        <div className="relative shrink-0 px-3 pt-2.5 pb-1.5">
          <Search
            className="pointer-events-none absolute start-[22px] top-1/2 mt-0.5 size-3.5 -translate-y-1/2 text-subtle-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchLabel}
            aria-label={searchLabel}
            className={cn(fieldVariants({ appearance }), 'h-[34px] ps-8 pe-2.5 text-xs')}
          />
        </div>
      ) : null}
      <nav
        aria-label="Main"
        className={cn(
          'scrollbar-hover flex-1 overflow-x-hidden overflow-y-auto pb-3',
          collapsed ? 'pt-2' : 'pt-1.5',
        )}
      >
        {visible.length === 0 ? (
          <p className="px-4 py-3 text-xs text-subtle-foreground">{noResultsLabel}</p>
        ) : null}
        {visible.map((section, si) => {
          const isClosed = !query && closed[section.id];
          return (
            <div key={section.id} className={cn('mb-0.5', si > 0 && 'mt-1')}>
              <SectionHeading
                label={collapsed ? undefined : section.label}
                divider={si > 0}
                closed={!!isClosed}
                onToggle={() => setClosed((c) => ({ ...c, [section.id]: !c[section.id] }))}
              />
              {!isClosed ? (
                <ul>
                  {section.items.map((item) => (
                    <SidebarItem
                      key={item.id}
                      item={item}
                      collapsed={collapsed}
                      pathname={pathname}
                    />
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </nav>
    </>
  );
}

/** A section's collapsible header; unlabelled sections after the first get a divider instead. */
function SectionHeading({
  label,
  divider,
  closed,
  onToggle,
}: Readonly<{
  label?: string;
  divider: boolean;
  closed: boolean;
  onToggle: () => void;
}>) {
  if (!label) return divider ? <div className="mx-3 my-1.5 h-px bg-border" aria-hidden /> : null;
  return (
    <button
      type="button"
      aria-expanded={!closed}
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-1.5 px-4 pt-3 pb-1.5 text-xs font-semibold text-muted-foreground outline-none transition-colors select-none hover:text-foreground focus-visible:text-foreground"
    >
      {label}
      <ChevronDown
        className={cn('size-3 opacity-60 transition-transform', closed && '-rotate-90')}
        aria-hidden
      />
    </button>
  );
}

const itemBase =
  'group relative flex w-full items-center gap-3 overflow-hidden rounded-control text-[13px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring';
const itemActive =
  'bg-primary-softer font-semibold text-primary-text before:absolute before:inset-y-1/4 before:start-0 before:w-[3px] before:rounded-e-pill before:bg-primary';
const itemIdle = 'text-muted-foreground hover:bg-hover hover:text-foreground';

function SidebarItem({
  item,
  collapsed,
  pathname,
}: Readonly<{
  item: ResolvedNavItem;
  collapsed: boolean;
  pathname: string;
}>) {
  const childActive = item.children?.some((c) => isActive(pathname, c.href)) ?? false;
  const [open, setOpen] = useState(childActive);
  const active = isActive(pathname, item.href);
  const spacing = collapsed
    ? 'mx-1.5 my-0.5 justify-center py-2.5'
    : 'mx-2 my-px py-[7px] ps-3.5 pe-3';
  const iconClass = cn(
    'size-[18px] transition-colors',
    active ? 'text-primary-active' : 'text-subtle-foreground group-hover:text-muted-foreground',
  );

  if (item.children?.length && !collapsed) {
    return (
      <li>
        <button
          type="button"
          className={cn(
            itemBase,
            spacing,
            'w-[calc(100%-1rem)]',
            childActive ? 'text-foreground' : itemIdle,
          )}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <NavIcon name={item.icon} className={iconClass} />
          <span className="flex-1 truncate text-start">{item.label}</span>
          <ChevronDown
            className={cn('size-3.5 opacity-60 transition-transform', open && 'rotate-180')}
            aria-hidden
          />
        </button>
        {open ? (
          <ul className="ps-6">
            {item.children.map((child) => (
              <SidebarItem key={child.id} item={child} collapsed={collapsed} pathname={pathname} />
            ))}
          </ul>
        ) : null}
      </li>
    );
  }

  return (
    <li>
      <SidebarLink
        item={item}
        active={active}
        collapsed={collapsed}
        spacing={spacing}
        iconClass={iconClass}
      />
    </li>
  );
}

/** A leaf item; collapsed to its icon, it shows the label in a tooltip. */
function SidebarLink({
  item,
  active,
  collapsed,
  spacing,
  iconClass,
}: Readonly<{
  item: ResolvedNavItem;
  active: boolean;
  collapsed: boolean;
  spacing: string;
  iconClass: string;
}>) {
  const link = (
    <Link
      href={item.href ?? '#'}
      className={cn(
        itemBase,
        spacing,
        collapsed ? 'w-[calc(100%-0.75rem)]' : 'w-[calc(100%-1rem)]',
        active ? itemActive : itemIdle,
      )}
      aria-current={active ? 'page' : undefined}
    >
      <NavIcon name={item.icon} className={iconClass} />
      {collapsed ? (
        <span className="sr-only">{item.label}</span>
      ) : (
        <span className="flex-1 truncate tracking-[-0.005em]">{item.label}</span>
      )}
      {!collapsed && item.badge ? (
        <span className="rounded-pill bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip content={item.label} side="right">
      {link}
    </Tooltip>
  );
}

/**
 * Breadcrumb trail for the current path: the deepest matching navigation item
 * (with its parents), prefixed by Home, optionally with the section label and
 * nav icons, then merged with any page-level override (usePageBreadcrumbs).
 * Returns null when a page hides breadcrumbs.
 */
export function useBreadcrumbTrail(
  sections: ResolvedNavSection[],
  homeLabel: string,
  homeHref: string,
  options: { showSection?: boolean; showIcons?: boolean } = {},
): BreadcrumbItem[] | null {
  const pathname = usePathname();
  const page = usePageBreadcrumbStore((s) => s.entry);
  if (page?.mode === 'hide') return null;

  const home: BreadcrumbItem = { label: homeLabel, href: homeHref };
  if (page?.mode === 'replace') return [home, ...page.items];

  let best: BreadcrumbItem[] = [];
  let bestSection: ResolvedNavSection | undefined;
  const toCrumb = (item: ResolvedNavItem): BreadcrumbItem => ({
    label: item.label,
    href: item.href,
    icon: options.showIcons && item.icon ? <NavIcon name={item.icon} /> : undefined,
  });
  const walk = (
    items: ResolvedNavItem[],
    trail: BreadcrumbItem[],
    section?: ResolvedNavSection,
  ) => {
    for (const item of items) {
      const next = [...trail, toCrumb(item)];
      if (isActive(pathname, item.href) && next.length >= best.length) {
        best = next;
        bestSection = section;
      }
      if (item.children) walk(item.children, next, section);
    }
  };
  sections.forEach((s) => walk(s.items, [], s));

  const isHome = best[0]?.href === homeHref;
  const trail = isHome
    ? best
    : [
        home,
        ...(options.showSection && bestSection?.label && best.length
          ? [
              {
                label: bestSection.label,
                icon:
                  options.showIcons && bestSection.icon ? (
                    <NavIcon name={bestSection.icon} />
                  ) : undefined,
              },
            ]
          : []),
        ...best,
      ];
  return page?.mode === 'append' ? [...trail, ...page.items] : trail;
}
