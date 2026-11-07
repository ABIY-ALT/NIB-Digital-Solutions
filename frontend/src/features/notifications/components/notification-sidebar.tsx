'use client';

import {
  Archive,
  Inbox,
  Layers,
  MailOpen,
  PenSquare,
  Settings,
  Star,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';
import {
  NOTIFICATION_CATEGORIES,
  type NotificationFolder,
  type NotificationSummary,
} from '../types';
import { categoryMeta } from './notification-visuals';

const FOLDERS: Array<{ id: NotificationFolder; icon: LucideIcon }> = [
  { id: 'inbox', icon: Inbox },
  { id: 'unread', icon: MailOpen },
  { id: 'starred', icon: Star },
  { id: 'archived', icon: Archive },
  { id: 'trash', icon: Trash2 },
  { id: 'all', icon: Layers },
];

/** Gmail-style navigation rail: Compose, folders with counters, category labels, settings. */
export function NotificationSidebar({
  folder,
  category,
  summary,
  canCompose,
  onFolder,
  onCategory,
  onCompose,
  onSettings,
}: Readonly<{
  folder: NotificationFolder;
  category: string | null;
  summary: NotificationSummary | undefined;
  canCompose: boolean;
  onFolder: (folder: NotificationFolder) => void;
  onCategory: (category: string | null) => void;
  onCompose: () => void;
  onSettings: () => void;
}>) {
  const t = useTranslations('notifications');
  const count = (f: NotificationFolder) => {
    if (f === 'inbox') return summary?.unread;
    if (f === 'starred') return summary?.starred;
    return f === 'trash' ? summary?.trash : undefined;
  };

  return (
    <nav aria-label={t('title')} className="flex flex-col gap-4">
      {canCompose ? (
        <Button
          onClick={onCompose}
          className="h-12 justify-start gap-3 rounded-surface px-5 text-sm shadow-card"
        >
          <PenSquare className="size-5" /> {t('compose.button')}
        </Button>
      ) : null}

      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {FOLDERS.map(({ id, icon: Icon }) => {
          const active = folder === id && !category;
          const n = count(id);
          return (
            <li key={id} className="shrink-0">
              <button
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onFolder(id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-e-pill py-1.5 ps-4 pe-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring max-lg:rounded-pill',
                  active
                    ? 'bg-primary-soft font-bold text-foreground'
                    : 'text-foreground/80 hover:bg-muted',
                )}
              >
                <Icon
                  className={cn('size-[18px] shrink-0', active && 'text-primary-text')}
                  aria-hidden
                />
                <span className="flex-1 text-start whitespace-nowrap">{t(`folders.${id}`)}</span>
                {n ? (
                  <span className={cn('text-xs tabular', id === 'inbox' && 'font-bold')}>{n}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="max-lg:hidden">
        <p className="px-4 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t('categories.title')}
        </p>
        <ul className="flex flex-col gap-0.5">
          {NOTIFICATION_CATEGORIES.map((c) => {
            const meta = categoryMeta(c);
            const active = category === c;
            const unread = summary?.categories[c]?.unread ?? 0;
            return (
              <li key={c}>
                <button
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onCategory(active ? null : c)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-e-pill py-1.5 ps-4 pe-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                    active ? 'bg-primary-soft font-bold' : 'text-foreground/80 hover:bg-muted',
                  )}
                >
                  <span className={cn('size-2.5 shrink-0 rounded-full', meta.dot)} aria-hidden />
                  <span className="flex-1 text-start">{t(`categories.${c}`)}</span>
                  {unread ? <span className="text-xs font-bold tabular">{unread}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <button
        type="button"
        onClick={onSettings}
        className="flex items-center gap-3 rounded-e-pill py-1.5 ps-4 pe-3 text-sm text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring max-lg:hidden"
      >
        <Settings className="size-[18px]" aria-hidden /> {t('settings.title')}
      </button>
    </nav>
  );
}
