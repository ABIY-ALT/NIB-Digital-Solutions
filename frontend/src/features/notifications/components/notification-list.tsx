'use client';

import {
  Archive,
  ArchiveRestore,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Mail,
  MailOpen,
  MoreVertical,
  RefreshCw,
  Star,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/choice';
import { EmptyState, Skeleton } from '@/shared/ui/feedback';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
} from '@/shared/ui/menu';
import type { PaginationMeta } from '@/shared/types';
import type { AppNotification, NotificationAction, NotificationFolder } from '../types';
import { categoryMeta, useNotificationText } from './notification-visuals';

export type SelectMode = 'all' | 'none' | 'read' | 'unread' | 'starred' | 'unstarred';

/** Gmail-like compact time: 14:05 today · 12 Sep this year · 12/09/25 before. */
export function shortTime(iso: string, locale: string, now = new Date()): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay)
    return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(d);
  if (d.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(d);
  }
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(d);
}

function IconAction({
  label,
  onClick,
  children,
  className,
}: Readonly<{
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}>) {
  return (
    <Tooltip content={label}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        className={cn('text-muted-foreground hover:text-foreground', className)}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        {children}
      </Button>
    </Tooltip>
  );
}

/** The header checkbox: everything, part of the page, or nothing selected. */
function selectionState(all: boolean, count: number): boolean | 'indeterminate' {
  if (all) return true;
  return count > 0 ? 'indeterminate' : false;
}

/** Bulk actions on the selection; what they are depends on the folder. */
function SelectionActions({
  folder,
  markRead,
  onAction,
}: Readonly<{
  folder: NotificationFolder;
  /** Offer "mark read" (some selected message is unread) rather than "mark unread". */
  markRead: boolean;
  onAction: (action: NotificationAction) => void;
}>) {
  const t = useTranslations('notifications');
  if (folder === 'trash') {
    return (
      <>
        <IconAction label={t('actions.restore')} onClick={() => onAction('restore')}>
          <Undo2 />
        </IconAction>
        <IconAction
          label={t('actions.deleteForever')}
          onClick={() => onAction('delete')}
          className="hover:text-danger"
        >
          <Trash2 />
        </IconAction>
      </>
    );
  }
  return (
    <>
      {folder === 'archived' ? (
        <IconAction label={t('actions.unarchive')} onClick={() => onAction('unarchive')}>
          <ArchiveRestore />
        </IconAction>
      ) : (
        <IconAction label={t('actions.archive')} onClick={() => onAction('archive')}>
          <Archive />
        </IconAction>
      )}
      <IconAction label={t('actions.trash')} onClick={() => onAction('trash')}>
        <Trash2 />
      </IconAction>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      {markRead ? (
        <IconAction label={t('actions.markRead')} onClick={() => onAction('read')}>
          <MailOpen />
        </IconAction>
      ) : (
        <IconAction label={t('actions.markUnread')} onClick={() => onAction('unread')}>
          <Mail />
        </IconAction>
      )}
      <IconAction label={t('actions.star')} onClick={() => onAction('star')}>
        <Star />
      </IconAction>
    </>
  );
}

export function NotificationToolbar({
  folder,
  items,
  selected,
  allInFolder,
  pagination,
  busy,
  onSelect,
  onAction,
  onRefresh,
  onPage,
}: Readonly<{
  folder: NotificationFolder;
  items: AppNotification[];
  selected: Set<string>;
  allInFolder: boolean;
  pagination: PaginationMeta | undefined;
  busy: boolean;
  onSelect: (mode: SelectMode) => void;
  onAction: (action: NotificationAction) => void;
  onRefresh: () => void;
  onPage: (page: number) => void;
}>) {
  const t = useTranslations('notifications');
  const count = selected.size;
  const all = items.length > 0 && count === items.length;
  const p = pagination;
  const from = p?.totalItems ? (p.page - 1) * p.pageSize + 1 : 0;
  const to = p ? Math.min(p.page * p.pageSize, p.totalItems) : 0;
  const anyUnread = items.some((n) => selected.has(n.id) && !n.read);

  return (
    <div className="flex min-h-12 flex-wrap items-center gap-1 border-b border-border px-2 py-1">
      <div className="flex items-center rounded-control hover:bg-muted">
        <Checkbox
          aria-label={t('select.toggle')}
          checked={selectionState(all || allInFolder, count)}
          onCheckedChange={() => onSelect(count > 0 ? 'none' : 'all')}
          className="m-2"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t('select.menu')}
              className="-ms-1 flex h-8 w-5 items-center justify-center text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronDown className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {(['all', 'none', 'read', 'unread', 'starred', 'unstarred'] as const).map((m) => (
              <DropdownMenuItem key={m} onSelect={() => onSelect(m)}>
                {t(`select.${m}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {count > 0 || allInFolder ? (
        <SelectionActions folder={folder} markRead={anyUnread || allInFolder} onAction={onAction} />
      ) : (
        <>
          <IconAction label={t('actions.refresh')} onClick={onRefresh}>
            <RefreshCw className={cn(busy && 'animate-spin')} />
          </IconAction>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t('actions.more')}>
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => onAction('read')}>
                <CheckCheck /> {t('actions.markAllRead')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      <div className="ms-auto flex items-center gap-1 text-xs text-muted-foreground">
        {p && p.totalItems > 0 ? (
          <span className="px-2 tabular">{t('pager', { from, to, total: p.totalItems })}</span>
        ) : null}
        <IconAction
          label={t('actions.newer')}
          onClick={() => p && onPage(p.page - 1)}
          className={cn(!p?.hasPreviousPage && 'pointer-events-none opacity-40')}
        >
          <ChevronLeft className="rtl:rotate-180" />
        </IconAction>
        <IconAction
          label={t('actions.older')}
          onClick={() => p && onPage(p.page + 1)}
          className={cn(!p?.hasNextPage && 'pointer-events-none opacity-40')}
        >
          <ChevronRight className="rtl:rotate-180" />
        </IconAction>
      </div>
    </div>
  );
}

export function NotificationList({
  items,
  loading,
  selected,
  activeId,
  focusId,
  folder,
  emptyTitle,
  onToggle,
  onOpen,
  onAction,
}: Readonly<{
  items: AppNotification[];
  loading: boolean;
  selected: Set<string>;
  activeId: string | null;
  focusId: string | null;
  folder: NotificationFolder;
  emptyTitle: string;
  onToggle: (id: string) => void;
  onOpen: (n: AppNotification) => void;
  onAction: (n: AppNotification, action: NotificationAction) => void;
}>) {
  const t = useTranslations('notifications');

  if (loading) {
    return (
      <div className="space-y-px p-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return <EmptyState icon={<CheckCheck />} title={emptyTitle} className="py-20" />;
  }
  return (
    // Container queries: one line per message when wide, two lines (Gmail split view / phones) when narrow.
    <ul aria-label={t('list')} className="@container divide-y divide-border">
      {items.map((n) => (
        <NotificationRow
          key={n.id}
          notification={n}
          selected={selected.has(n.id)}
          active={activeId === n.id}
          focused={focusId === n.id}
          folder={folder}
          onToggle={onToggle}
          onOpen={onOpen}
          onAction={onAction}
        />
      ))}
    </ul>
  );
}

/**
 * One message. The subject is the button that opens it; its ::after covers the
 * row, so a click anywhere opens the message, while the checkbox, the star and
 * the hover actions sit above that layer.
 */
function NotificationRow({
  notification: n,
  selected,
  active,
  focused,
  folder,
  onToggle,
  onOpen,
  onAction,
}: Readonly<{
  notification: AppNotification;
  selected: boolean;
  active: boolean;
  focused: boolean;
  folder: NotificationFolder;
  onToggle: (id: string) => void;
  onOpen: (n: AppNotification) => void;
  onAction: (n: AppNotification, action: NotificationAction) => void;
}>) {
  const t = useTranslations('notifications');
  const locale = useLocale();
  const text = useNotificationText();
  const { title, body } = text(n);
  const meta = categoryMeta(n.category);
  return (
    <li
      data-id={n.id}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'group relative flex cursor-pointer items-center gap-1 px-2 transition-shadow hover:z-10 hover:shadow-[inset_1px_0_0_var(--color-border),inset_-1px_0_0_var(--color-border),0_1px_3px_rgb(0_0_0/0.12)]',
        'flex-wrap py-2 @3xl:flex-nowrap @3xl:py-0',
        n.read ? 'bg-muted/35' : 'bg-surface',
        selected && 'bg-primary-softer',
        active && 'bg-primary-soft/70',
        focused && 'ring-2 ring-primary ring-inset',
      )}
    >
      {!n.read ? (
        <span className="absolute inset-y-0 start-0 w-[3px] bg-primary" aria-hidden />
      ) : null}
      <span className="relative z-10 flex">
        <Checkbox
          aria-label={t('select.one', { title })}
          checked={selected}
          onCheckedChange={() => onToggle(n.id)}
          className="m-2"
        />
      </span>
      <button
        type="button"
        aria-label={n.starred ? t('actions.unstar') : t('actions.star')}
        aria-pressed={n.starred}
        onClick={(e) => {
          e.stopPropagation();
          onAction(n, n.starred ? 'unstar' : 'star');
        }}
        className="relative z-10 flex size-8 items-center justify-center rounded-full outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Star
          className={cn(
            'size-[18px] transition-colors',
            n.starred ? 'fill-warning text-warning' : 'text-subtle-foreground',
          )}
        />
      </button>
      <span
        className={cn(
          'min-w-0 flex-1 truncate ps-1 text-sm @3xl:w-44 @3xl:flex-none @3xl:shrink-0',
          !n.read && 'font-bold',
        )}
      >
        {n.senderName ?? t('system')}
      </span>
      <span className="order-last flex min-w-0 basis-full items-center gap-2 ps-[4.75rem] text-sm @3xl:order-none @3xl:flex-1 @3xl:basis-auto @3xl:py-2.5 @3xl:ps-0">
        <span
          className={cn(
            'hidden shrink-0 rounded-item px-1.5 py-px text-[10px] font-bold uppercase @3xl:inline',
            meta.chip,
          )}
        >
          {t(`categories.${n.category}`)}
        </span>
        <button
          type="button"
          onClick={() => onOpen(n)}
          className="min-w-0 cursor-pointer truncate text-start outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
        >
          <span className={cn(!n.read && 'font-bold')}>{title}</span>
          <span className="text-muted-foreground"> — {body}</span>
        </button>
      </span>
      <span
        className={cn(
          'shrink-0 text-end text-xs tabular @3xl:w-20 @3xl:group-hover:invisible',
          n.read ? 'text-muted-foreground' : 'font-bold text-foreground',
        )}
      >
        {shortTime(n.createdAt, locale)}
      </span>
      <span className="invisible absolute end-2 z-10 hidden items-center gap-0.5 bg-inherit group-hover:visible @3xl:flex">
        <RowActions notification={n} folder={folder} onAction={onAction} />
      </span>
    </li>
  );
}

/** Hover actions of one message. */
function RowActions({
  notification: n,
  folder,
  onAction,
}: Readonly<{
  notification: AppNotification;
  folder: NotificationFolder;
  onAction: (n: AppNotification, action: NotificationAction) => void;
}>) {
  const t = useTranslations('notifications');
  if (folder === 'trash') {
    return (
      <IconAction label={t('actions.restore')} onClick={() => onAction(n, 'restore')}>
        <Undo2 />
      </IconAction>
    );
  }
  return (
    <>
      {folder === 'archived' ? (
        <IconAction label={t('actions.unarchive')} onClick={() => onAction(n, 'unarchive')}>
          <ArchiveRestore />
        </IconAction>
      ) : (
        <IconAction label={t('actions.archive')} onClick={() => onAction(n, 'archive')}>
          <Archive />
        </IconAction>
      )}
      <IconAction label={t('actions.trash')} onClick={() => onAction(n, 'trash')}>
        <Trash2 />
      </IconAction>
      <IconAction
        label={n.read ? t('actions.markUnread') : t('actions.markRead')}
        onClick={() => onAction(n, n.read ? 'unread' : 'read')}
      >
        {n.read ? <Mail /> : <MailOpen />}
      </IconAction>
    </>
  );
}
