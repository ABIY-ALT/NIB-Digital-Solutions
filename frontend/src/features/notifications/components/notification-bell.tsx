'use client';

import { Bell, CheckCheck, Settings } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';
import { EmptyState, Skeleton } from '@/shared/ui/feedback';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { RelativeTime } from '@/shared/ui/relative-time';
import { useNotificationAction, useNotificationSummary } from '../hooks/use-notifications';
import type { AppNotification } from '../types';
import { CategoryIcon, useNotificationText } from './notification-visuals';

/**
 * Header bell: unread counter (polled), the latest messages with quick
 * "mark all as read", and a door into the notification centre. Opening a
 * message marks it read and follows its link.
 */
export function NotificationBell() {
  const t = useTranslations('notifications');
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const { data, isPending } = useNotificationSummary();
  const act = useNotificationAction();
  const text = useNotificationText();
  const unread = data?.unread ?? 0;
  const items = (data?.latest ?? []).filter((n) => tab === 'all' || !n.read);

  const openMessage = (n: AppNotification) => {
    if (!n.read) act.mutate({ action: 'read', target: { ids: [n.id] } });
    setOpen(false);
    router.push(n.link ?? `/notifications?id=${n.id}`);
  };

  let latest: ReactNode;
  if (isPending) {
    latest = (
      <div className="space-y-2 p-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  } else if (items.length === 0) {
    latest = (
      <EmptyState
        icon={<CheckCheck />}
        title={tab === 'unread' ? t('empty.unread') : t('empty.inbox')}
        className="py-8"
      />
    );
  } else {
    latest = (
      <ul className="scrollbar-thin max-h-[24rem] divide-y divide-border overflow-y-auto">
        {items.map((n) => {
          const { title, body } = text(n);
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => openMessage(n)}
                className={cn(
                  'flex w-full gap-3 px-4 py-3 text-start outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted',
                  !n.read && 'bg-primary-softer',
                )}
              >
                <CategoryIcon category={n.category} severity={n.severity} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span
                      className={cn(
                        'line-clamp-2 text-[13px] leading-snug',
                        n.read ? 'font-medium text-foreground/90' : 'font-bold',
                      )}
                    >
                      {title}
                    </span>
                    {!n.read ? (
                      <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" aria-hidden />
                    ) : null}
                  </span>
                  <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">
                    {body}
                  </span>
                  <RelativeTime
                    value={n.createdAt}
                    locale={locale}
                    className="mt-1 block text-[11px] text-subtle-foreground"
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={unread ? t('bell.labelUnread', { count: unread }) : t('bell.label')}
          className="relative"
        >
          <Bell />
          {unread ? (
            <span className="absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-danger px-1 text-[10px] leading-none font-bold text-danger-foreground tabular ring-2 ring-surface">
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
          <p className="text-sm font-semibold">{t('title')}</p>
          <div className="flex items-center gap-1">
            {unread ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-secondary"
                onClick={() => act.mutate({ action: 'read', target: { folder: 'unread' } })}
              >
                <CheckCheck /> {t('actions.markAllRead')}
              </Button>
            ) : null}
            <Button asChild variant="ghost" size="icon-sm" aria-label={t('settings.title')}>
              <Link href="/notifications?settings=1" onClick={() => setOpen(false)}>
                <Settings />
              </Link>
            </Button>
          </div>
        </div>
        <div className="flex gap-1 border-b border-border px-3" role="tablist">
          {(['all', 'unread'] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                '-mb-px border-b-2 px-2 py-1.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring',
                tab === key
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t(`bell.${key}`)}
              {key === 'unread' && unread ? ` (${unread})` : ''}
            </button>
          ))}
        </div>

        {latest}
        <div className="border-t border-border p-2">
          <Button asChild variant="ghost" className="w-full justify-center text-sm font-semibold">
            <Link href="/notifications" onClick={() => setOpen(false)}>
              {t('bell.openCenter')}
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
