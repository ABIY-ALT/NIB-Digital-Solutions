'use client';

import {
  Activity,
  ClipboardCheck,
  KeyRound,
  LogIn,
  LogOut,
  MonitorX,
  Plus,
  ShieldAlert,
  Smartphone,
  Trash2,
  UserPen,
  type LucideIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useActionLabel, useFieldLabel } from '@/features/audit/components/audit-labels';
import { formatDate } from '@/shared/lib/format';
import { parseUserAgent } from '@/shared/lib/user-agent';
import { EmptyState } from '@/shared/ui/feedback';
import { RelativeTime } from '@/shared/ui/relative-time';
import { Timeline, type TimelineItem, type TimelineTone } from '@/shared/ui/timeline';
import { useMyActivity } from '../hooks/use-profile';
import type { PersonalActivityEntry } from '../types';

/** Icon and colour for an action (failures and denials are always red). */
function visual(e: PersonalActivityEntry): { icon: LucideIcon; tone: TimelineTone } {
  if (e.outcome !== 'SUCCESS') return { icon: ShieldAlert, tone: 'danger' };
  const a = e.action;
  if (a === 'AUTH_LOGIN') return { icon: LogIn, tone: 'success' };
  if (a === 'AUTH_LOGOUT') return { icon: LogOut, tone: 'neutral' };
  if (/PASSWORD/.test(a)) return { icon: KeyRound, tone: 'warning' };
  if (/MFA/.test(a)) return { icon: Smartphone, tone: 'info' };
  if (/SESSION/.test(a)) return { icon: MonitorX, tone: 'neutral' };
  if (a === 'PROFILE_UPDATE' || a === 'USER_UPDATE') return { icon: UserPen, tone: 'primary' };
  if (a.startsWith('APPROVAL_') || a.endsWith('_REQUESTED'))
    return { icon: ClipboardCheck, tone: 'secondary' };
  if (a.endsWith('_CREATE')) return { icon: Plus, tone: 'primary' };
  if (a.endsWith('_DELETE')) return { icon: Trash2, tone: 'warning' };
  return { icon: Activity, tone: 'neutral' };
}

/** Maps personal activity to timeline rows (shared by the overview card and the Activity tab). */
export function useActivityItems(entries: readonly PersonalActivityEntry[]): TimelineItem[] {
  const t = useTranslations('profile.activity');
  const locale = useLocale();
  const actionLabel = useActionLabel();
  const fieldLabel = useFieldLabel();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  const dayGroup = (iso: string) => {
    const day = new Date(iso).toDateString();
    if (day === today) return t('today');
    return day === yesterday ? t('yesterday') : formatDate(iso, locale);
  };

  return entries.map((e) => {
    const { icon: Icon, tone } = visual(e);
    const client = parseUserAgent(e.userAgent);
    const device = [client.browser, client.os].filter(Boolean).join(' · ');
    const description = [
      e.byOther && e.actorUsername ? t('byOther', { actor: e.actorUsername }) : null,
      device || null,
      e.ipAddress,
      e.outcome !== 'SUCCESS' && e.errorCode ? e.errorCode : null,
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      id: e.id,
      icon: <Icon />,
      tone,
      title: (
        <>
          {actionLabel(e.action)}
          {e.outcome !== 'SUCCESS' ? (
            <span className="ms-1.5 text-xs font-semibold text-danger">
              {t(`outcomes.${e.outcome}`)}
            </span>
          ) : null}
        </>
      ),
      description,
      time: <RelativeTime value={e.occurredAt} locale={locale} />,
      group: dayGroup(e.occurredAt),
      extra: e.changedFields.length ? (
        <div className="flex flex-wrap gap-1">
          {e.changedFields.slice(0, 6).map((f) => (
            <span
              key={f}
              className="rounded-item bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
            >
              {fieldLabel(f)}
            </span>
          ))}
        </div>
      ) : undefined,
    };
  });
}

/** Full, paginated activity history (Activity tab). */
export function ActivityFeed({ pageSize = 20 }: Readonly<{ pageSize?: number }>) {
  const t = useTranslations('profile.activity');
  const query = useMyActivity(pageSize);
  const entries = query.data?.pages.flatMap((p) => p.items) ?? [];
  const items = useActivityItems(entries);
  return (
    <Timeline
      items={items}
      loading={query.isPending}
      hasMore={query.hasNextPage}
      loadingMore={query.isFetchingNextPage}
      onLoadMore={() => void query.fetchNextPage()}
      loadMoreLabel={t('loadMore')}
      empty={<EmptyState icon={<Activity />} title={t('empty')} />}
    />
  );
}
