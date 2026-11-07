'use client';

import {
  Bell,
  ClipboardCheck,
  Megaphone,
  Server,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { formatDateTime } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import type { AppNotification } from '../types';

/** Visual identity per category (icon + token colours), Gmail-label style. */
export const CATEGORY_META: Record<string, { icon: LucideIcon; chip: string; dot: string }> = {
  APPROVAL: { icon: ClipboardCheck, chip: 'bg-primary-soft text-primary-text', dot: 'bg-primary' },
  SECURITY: { icon: ShieldAlert, chip: 'bg-danger-soft text-danger', dot: 'bg-danger' },
  SYSTEM: { icon: Server, chip: 'bg-info-soft text-info', dot: 'bg-info' },
  ANNOUNCEMENT: { icon: Megaphone, chip: 'bg-secondary-soft text-secondary', dot: 'bg-secondary' },
};
const FALLBACK = {
  icon: Bell,
  chip: 'bg-muted text-muted-foreground',
  dot: 'bg-subtle-foreground',
};

export const categoryMeta = (category: string) => CATEGORY_META[category] ?? FALLBACK;

export function CategoryIcon({
  category,
  severity,
  className,
}: Readonly<{
  category: string;
  severity?: AppNotification['severity'];
  className?: string;
}>) {
  const meta = categoryMeta(category);
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'relative flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-[18px]',
        meta.chip,
        className,
      )}
      aria-hidden
    >
      <Icon />
      {severity === 'CRITICAL' ? (
        <span className="absolute -end-0.5 -top-0.5 size-2.5 rounded-full border-2 border-surface bg-danger" />
      ) : null}
    </span>
  );
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * Renders a message in the reader's language: `notifications.templates.<template>`
 * with the stored params (dates formatted for the locale); falls back to the
 * English text the backend stored (e-mail text) for unknown templates.
 */
export function useNotificationText() {
  const t = useTranslations('notifications.templates');
  const locale = useLocale();
  return useCallback(
    (n: Pick<AppNotification, 'template' | 'params' | 'title' | 'body'>) => {
      const params = Object.fromEntries(
        Object.entries(n.params ?? {}).map(([k, v]) => [
          k,
          typeof v === 'string' && ISO.test(v) ? formatDateTime(v, locale) : (v ?? ''),
        ]),
      );
      const key = n.template;
      const title = t.has(`${key}.title`) ? t(`${key}.title`, params) : n.title;
      const body = t.has(`${key}.body`) ? t(`${key}.body`, params) : n.body;
      return { title, body };
    },
    [locale, t],
  );
}
