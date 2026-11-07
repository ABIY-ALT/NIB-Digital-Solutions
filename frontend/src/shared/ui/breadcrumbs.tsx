'use client';

import { Check, ChevronDown, ChevronRight, Home, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { collapseBreadcrumbs, type BreadcrumbItem } from '@/shared/lib/breadcrumbs';
import { cn } from '@/shared/lib/cn';
import { keyed } from '@/shared/lib/keys';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from './menu';

export type { BreadcrumbItem, BreadcrumbSibling } from '@/shared/lib/breadcrumbs';

export type BreadcrumbSeparator = 'chevron' | 'slash' | 'dot';

export interface BreadcrumbLabels {
  /** Accessible name of the landmark. */
  nav: string;
  /** "…" button that reveals collapsed crumbs. */
  showHidden: string;
  /** Title of the sibling switcher menu. */
  switchTo: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  /** Collapse to `head … tail` when the trail is longer than this. */
  maxItems?: number;
  itemsBeforeCollapse?: number;
  itemsAfterCollapse?: number;
  separator?: BreadcrumbSeparator | ReactNode;
  /** Home icon on the first crumb: with its label, icon only (label kept for screen readers) or none. */
  home?: 'icon' | 'icon-label' | 'none';
  size?: 'sm' | 'md';
  labels?: Partial<BreadcrumbLabels>;
  className?: string;
}

const DEFAULT_LABELS: BreadcrumbLabels = {
  nav: 'Breadcrumb',
  showHidden: 'Show hidden path',
  switchTo: 'Switch to',
};

const crumbBase =
  'inline-flex min-w-0 items-center gap-1.5 rounded-item px-1.5 py-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5 [&_svg]:shrink-0';

/**
 * Breadcrumb trail (WAI-ARIA breadcrumb pattern): an ordered list inside a
 * labelled <nav>, the current page marked with aria-current. Long trails collapse
 * into a "…" menu. A crumb with `siblings` gets a switcher (e.g. other tabs).
 * Mirrors correctly in RTL. Purely presentational: it does not know about routes.
 */
export function Breadcrumbs({
  items,
  maxItems = 4,
  itemsBeforeCollapse = 1,
  itemsAfterCollapse = 2,
  separator = 'chevron',
  home = 'icon-label',
  size = 'sm',
  labels: labelOverrides,
  className,
}: Readonly<BreadcrumbsProps>) {
  if (items.length === 0) return null;
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const view = collapseBreadcrumbs(items, maxItems, itemsBeforeCollapse, itemsAfterCollapse);
  const lastIndex = items.length - 1;

  const crumbEntry = (item: BreadcrumbItem, index: number) => ({
    id: item.href ?? item.label,
    node: (
      <Crumb
        item={item}
        current={index === lastIndex}
        isHome={index === 0 && home !== 'none'}
        iconOnly={index === 0 && home === 'icon' && index !== lastIndex}
        switchLabel={labels.switchTo}
      />
    ),
  });

  const entries: Array<{ id: string; node: ReactNode }> = view.collapsed
    ? [
        ...view.head.map((item, i) => crumbEntry(item, i)),
        { id: 'hidden', node: <HiddenCrumbs items={view.hidden} label={labels.showHidden} /> },
        ...view.tail.map((item, i) => crumbEntry(item, items.length - view.tail.length + i)),
      ]
    : view.items.map((item, i) => crumbEntry(item, i));

  return (
    <nav aria-label={labels.nav} className={cn('min-w-0', className)}>
      <ol
        className={cn(
          'flex min-w-0 flex-wrap items-center gap-0.5',
          size === 'md' ? 'text-[13px]' : 'text-xs',
        )}
      >
        {keyed(entries, (e) => e.id).map(({ key, item: entry }, i) => (
          <Fragment key={key}>
            {i > 0 ? (
              <li aria-hidden className="flex shrink-0 items-center text-subtle-foreground">
                <Separator kind={separator} />
              </li>
            ) : null}
            <li className="flex min-w-0 items-center">{entry.node}</li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}

/** A named separator ("chevron", "slash", "dot") or any custom node. */
function Separator({ kind }: Readonly<{ kind: ReactNode }>) {
  if (kind === 'chevron') return <ChevronRight className="size-3.5 rtl:rotate-180" />;
  if (kind === 'slash') return <span className="px-0.5 text-border-strong">/</span>;
  if (kind === 'dot') return <span className="px-0.5 text-[10px]">•</span>;
  return <>{kind}</>;
}

function Crumb({
  item,
  current,
  isHome,
  iconOnly,
  switchLabel,
}: Readonly<{
  item: BreadcrumbItem;
  current: boolean;
  isHome: boolean;
  iconOnly: boolean;
  switchLabel: string;
}>) {
  const icon = item.icon ?? (isHome ? <Home aria-hidden /> : null);
  const content = (
    <>
      {icon ? (
        <span
          className={cn(
            'inline-flex shrink-0 [&_svg]:size-3.5',
            current
              ? 'text-primary'
              : 'text-subtle-foreground group-hover/crumb:text-muted-foreground',
          )}
          aria-hidden
        >
          {icon}
        </span>
      ) : null}
      <span className={cn('max-w-[14rem] truncate', iconOnly && 'sr-only')}>{item.label}</span>
    </>
  );
  const siblings = item.siblings?.length ? item.siblings : null;

  // Current page with siblings: the crumb itself opens the switcher.
  if (current && siblings) {
    return (
      <SiblingMenu siblings={siblings} label={switchLabel}>
        <button
          type="button"
          aria-current="page"
          title={item.label}
          className={cn(
            crumbBase,
            'font-semibold text-foreground hover:bg-hover data-[state=open]:bg-hover',
          )}
        >
          {content}
          <ChevronDown className="text-muted-foreground" aria-hidden />
        </button>
      </SiblingMenu>
    );
  }

  let main: ReactNode;
  if (current) {
    main = (
      <span
        aria-current="page"
        title={item.label}
        className={cn(crumbBase, 'font-semibold text-foreground')}
      >
        {content}
      </span>
    );
  } else if (item.href) {
    main = (
      <Link
        href={item.href}
        title={item.label}
        className={cn(
          crumbBase,
          'group/crumb text-muted-foreground hover:bg-hover hover:text-foreground',
        )}
      >
        {content}
      </Link>
    );
  } else {
    main = (
      <span title={item.label} className={cn(crumbBase, 'text-muted-foreground')}>
        {content}
      </span>
    );
  }

  if (!siblings) return main;
  return (
    <span className="inline-flex min-w-0 items-center">
      {main}
      <SiblingMenu siblings={siblings} label={switchLabel}>
        <button
          type="button"
          aria-label={`${switchLabel}: ${item.label}`}
          className="-ms-1 inline-flex size-5 items-center justify-center rounded-item text-subtle-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-hover"
        >
          <ChevronDown className="size-3" aria-hidden />
        </button>
      </SiblingMenu>
    </span>
  );
}

function SiblingMenu({
  siblings,
  label,
  children,
}: Readonly<{
  siblings: NonNullable<BreadcrumbItem['siblings']>;
  label: string;
  children: ReactNode;
}>) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {siblings.map((s) => (
          <DropdownMenuItem key={s.href} asChild>
            <Link
              href={s.href}
              aria-current={s.active ? 'page' : undefined}
              className={cn('justify-between gap-4', s.active && 'font-semibold text-primary-text')}
            >
              <span className="flex min-w-0 items-center gap-2">
                {s.icon ? (
                  <span
                    className={cn(
                      'inline-flex shrink-0 [&_svg]:size-4',
                      s.active ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {s.icon}
                  </span>
                ) : null}
                <span className="truncate">{s.label}</span>
              </span>
              {s.active ? <Check className="!text-primary" aria-hidden /> : null}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function HiddenCrumbs({ items, label }: Readonly<{ items: BreadcrumbItem[]; label: string }>) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className="inline-flex h-5 w-6 items-center justify-center rounded-item text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-hover"
        >
          <MoreHorizontal className="size-3.5" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        {items.map((item, i) =>
          item.href ? (
            <DropdownMenuItem key={`${item.label}-${i}`} asChild>
              <Link href={item.href}>
                {item.icon}
                <span className="truncate">{item.label}</span>
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuLabel key={`${item.label}-${i}`}>{item.label}</DropdownMenuLabel>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
