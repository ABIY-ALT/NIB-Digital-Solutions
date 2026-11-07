'use client';

import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowUpRight,
  Mail,
  Star,
  Trash2,
  Undo2,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { formatDateTime } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/feedback';
import { Avatar } from '@/shared/ui/menu';
import { RelativeTime } from '@/shared/ui/relative-time';
import type { AppNotification, NotificationAction } from '../types';
import { categoryMeta, useNotificationText } from './notification-visuals';

const SEVERITY_BAR = {
  INFO: 'bg-info',
  SUCCESS: 'bg-success',
  WARNING: 'bg-warning',
  CRITICAL: 'bg-danger',
} as const;

/** The opened message (Gmail reading pane). */
export function NotificationReader({
  notification: n,
  loading,
  onBack,
  onAction,
}: Readonly<{
  notification: AppNotification | undefined;
  loading: boolean;
  onBack: () => void;
  onAction: (n: AppNotification, action: NotificationAction) => void;
}>) {
  const t = useTranslations('notifications');
  const locale = useLocale();
  const text = useNotificationText();

  if (loading || !n) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  const { title, body } = text(n);
  const meta = categoryMeta(n.category);
  const sender = n.senderName ?? t('system');

  return (
    <article className="flex min-h-full flex-col" aria-labelledby="notification-title">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1">
        <Button variant="ghost" size="icon-sm" aria-label={t('actions.back')} onClick={onBack}>
          <ArrowLeft className="rtl:rotate-180" />
        </Button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        {n.trashed ? (
          <Button variant="ghost" size="sm" onClick={() => onAction(n, 'restore')}>
            <Undo2 /> {t('actions.restore')}
          </Button>
        ) : (
          <>
            {n.archived ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('actions.unarchive')}
                onClick={() => onAction(n, 'unarchive')}
              >
                <ArchiveRestore />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('actions.archive')}
                onClick={() => onAction(n, 'archive')}
              >
                <Archive />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('actions.trash')}
              onClick={() => onAction(n, 'trash')}
            >
              <Trash2 />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('actions.markUnread')}
              onClick={() => onAction(n, 'unread')}
            >
              <Mail />
            </Button>
          </>
        )}
      </div>

      <div className="relative flex-1 px-6 py-5">
        <span
          className={cn('absolute inset-y-5 start-0 w-1 rounded-e-pill', SEVERITY_BAR[n.severity])}
          aria-hidden
        />
        <div className="flex items-start gap-3">
          <h2 id="notification-title" className="flex-1 text-xl leading-snug font-semibold">
            {title}
          </h2>
          <button
            type="button"
            aria-label={n.starred ? t('actions.unstar') : t('actions.star')}
            aria-pressed={n.starred}
            onClick={() => onAction(n, n.starred ? 'unstar' : 'star')}
            className="flex size-9 items-center justify-center rounded-full outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Star
              className={cn(
                'size-5',
                n.starred ? 'fill-warning text-warning' : 'text-subtle-foreground',
              )}
            />
          </button>
        </div>
        <span
          className={cn(
            'mt-2 inline-block rounded-item px-2 py-0.5 text-[11px] font-bold uppercase',
            meta.chip,
          )}
        >
          {t(`categories.${n.category}`)}
        </span>

        <div className="mt-5 flex items-start gap-3">
          <Avatar name={sender} size={40} />
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span className="font-bold">{sender}</span>{' '}
              <span className="text-xs text-muted-foreground">{t('reader.toMe')}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDateTime(n.createdAt, locale)} (
              <RelativeTime value={n.createdAt} locale={locale} />)
            </p>
          </div>
        </div>

        <div className="mt-5 max-w-2xl text-[15px] leading-relaxed whitespace-pre-line">{body}</div>

        {n.link ? (
          <Button asChild className="mt-6">
            <Link href={n.link}>
              {n.category === 'APPROVAL' ? t('reader.review') : t('reader.open')}
              <ArrowUpRight className="rtl:-scale-x-100" />
            </Link>
          </Button>
        ) : null}
      </div>
    </article>
  );
}
