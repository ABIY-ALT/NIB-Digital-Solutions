'use client';

import { Activity, Lock, ShieldCheck, UserCheck, Users, UserX } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { AuditLogEntry } from '@/features/audit/types';
import { useCurrentUser } from '@/features/auth/components/permissions-provider';
import { describeError } from '@/shared/errors/error-messages';
import { formatDate, formatDateTime, formatNumber } from '@/shared/lib/format';
import { RelativeTime } from '@/shared/ui/relative-time';
import { Badge, Tag, type BadgeTone } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/shared/ui/feedback';
import dynamic from 'next/dynamic';
import { useFeatureFlag } from '@/shared/feature-flags/feature-flags';
import { useDashboard } from '../hooks/use-dashboard';
import type { DashboardSummary } from '../types';
import { DashboardHighlights } from './dashboard-highlights';
import { WorkspaceHome } from './workspace-home';

// The chart kit is code-split: it loads with the dashboard only when the flag is on.
const DashboardInsights = dynamic(
  () => import('./dashboard-insights').then((m) => m.DashboardInsights),
  {
    loading: () => <Skeleton className="h-[520px] rounded-surface" />,
  },
);

/**
 * Dashboard → useDashboard() → GET /api/dashboard (Next.js) → NestJS. Staff who
 * work on NIB Digital Solutions get their workspace (WorkspaceHome); everyone
 * else gets the general overview (users, audit trail, session).
 */
export function DashboardView({
  productNames = {},
}: Readonly<{ productNames?: Record<string, string> }>) {
  const t = useTranslations('dashboard');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const locale = useLocale();
  const user = useCurrentUser();
  const { data, isPending, error, refetch } = useDashboard();
  const firstName = user?.name.split(' ')[0] ?? '';
  const showInsights = useFeatureFlag('dashboardInsights');

  if (data?.workspace) {
    return (
      <div className="surface-honeycomb-local -m-page min-h-[calc(100%+var(--page-padding)*2)] p-page">
        <WorkspaceHome workspace={data.workspace} productNames={productNames} />
      </div>
    );
  }

  return (
    <div className="surface-honeycomb-local -m-page min-h-[calc(100%+var(--page-padding)*2)] p-page">
      <section className="relative mb-5 overflow-hidden rounded-surface bg-[linear-gradient(120deg,var(--brand-secondary)_0%,#a3622a_55%,#d9921a_100%)] px-6 py-5 text-white shadow-raised">
        <div
          className="pointer-events-none absolute -end-10 -top-16 size-56 rounded-full bg-primary/35"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-20 end-40 size-40 rounded-full bg-primary/20"
          aria-hidden
        />
        <div className="relative">
          <p className="text-xs font-semibold tracking-[0.02em] text-white/80">
            {formatDate(new Date(), locale, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
          <h1 className="mt-1 text-[22px] leading-tight font-semibold">
            {t('greeting', { name: firstName })}
          </h1>
          <p className="mt-1 text-sm text-white/85">{t('subtitle')}</p>
        </div>
      </section>
      {showInsights ? (
        <div className="mb-6">
          <DashboardHighlights />
        </div>
      ) : null}
      {error ? (
        <ErrorState
          className="rounded-surface border border-border bg-surface"
          title={t('widgetError')}
          description={describeError(error, te).message}
          correlationId={describeError(error, te).correlationId}
          referenceLabel={tc('reference')}
          action={
            <Button variant="outline" onClick={() => refetch()}>
              {tc('retry')}
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          <UserStats loading={isPending} stats={data?.userStats ?? null} />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle>{t('activity.title')}</CardTitle>
                  <CardDescription>{t('activity.description')}</CardDescription>
                </div>
                <Activity className="size-4 text-muted-foreground" aria-hidden />
              </CardHeader>
              <RecentActivity loading={isPending} activity={data?.recentActivity} />
            </Card>

            <SessionCard sessionEndsAt={data?.sessionEndsAt} />
          </div>
        </div>
      )}
      {showInsights ? (
        <div className="mt-7">
          <DashboardInsights />
        </div>
      ) : null}
    </div>
  );
}

function UserStats({
  loading,
  stats,
}: Readonly<{ loading: boolean; stats: DashboardSummary['userStats'] }>) {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-surface" />
        ))}
      </div>
    );
  }
  if (!stats) return null;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label={t('stats.total')}
        value={formatNumber(stats.total, locale)}
        icon={<Users />}
        tone="bg-primary-soft text-primary-text"
      />
      <StatCard
        label={t('stats.active')}
        value={formatNumber(stats.active, locale)}
        icon={<UserCheck />}
        tone="bg-success-soft text-success"
      />
      <StatCard
        label={t('stats.locked')}
        value={formatNumber(stats.locked, locale)}
        icon={<Lock />}
        tone="bg-warning-soft text-warning"
      />
      <StatCard
        label={t('stats.disabled')}
        value={formatNumber(stats.disabled, locale)}
        icon={<UserX />}
        tone="bg-danger-soft text-danger"
      />
    </div>
  );
}

function outcomeTone(outcome: AuditLogEntry['outcome']): BadgeTone {
  if (outcome === 'SUCCESS') return 'success';
  return outcome === 'DENIED' ? 'warning' : 'danger';
}

/** Latest audit events; `activity` is null when the user may not read the audit trail. */
function RecentActivity({
  loading,
  activity,
}: Readonly<{ loading: boolean; activity: DashboardSummary['recentActivity'] | undefined }>) {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  if (loading) {
    return (
      <div className="space-y-3 p-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
    );
  }
  if (activity === null)
    return <EmptyState icon={<ShieldCheck />} title={t('activity.noAccess')} />;
  if (!activity?.length) return <EmptyState title={t('activity.empty')} />;
  return (
    <ul className="divide-y divide-border">
      {activity.map((e) => (
        <li key={e.id} className="flex items-center gap-3 px-5 py-2.5">
          <Badge tone={outcomeTone(e.outcome)} dot className="w-24 justify-center">
            {e.outcome}
          </Badge>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{e.action}</p>
            <p className="truncate text-xs text-muted-foreground">{e.actorUsername ?? '—'}</p>
          </div>
          <RelativeTime
            value={e.occurredAt}
            locale={locale}
            className="text-xs whitespace-nowrap text-subtle-foreground"
          />
        </li>
      ))}
    </ul>
  );
}

function SessionCard({ sessionEndsAt }: Readonly<{ sessionEndsAt: string | undefined }>) {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const user = useCurrentUser();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('session.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Row label={t('session.user')} value={user ? `@${user.username}` : '—'} />
        <Row label={t('session.branch')} value={user?.branchCode ?? '—'} />
        <Row
          label={t('session.mfa')}
          value={
            user?.mfaEnabled ? (
              <Badge tone="success">{t('session.enabled')}</Badge>
            ) : (
              <Badge>{t('session.disabled')}</Badge>
            )
          }
        />
        <Row
          label={t('session.expires')}
          value={sessionEndsAt ? formatDateTime(sessionEndsAt, locale) : '—'}
        />
        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{t('session.roles')}</p>
          <div className="flex flex-wrap gap-1">
            {user?.roles.map((r) => (
              <Tag key={r}>{r}</Tag>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: Readonly<{
  label: string;
  value: string;
  icon: ReactNode;
  tone: string;
}>) {
  return (
    <Card className="flex items-center gap-4 p-4 transition-shadow hover:shadow-raised">
      <span
        className={`flex size-11 items-center justify-center rounded-control [&_svg]:size-5 ${tone}`}
      >
        {icon}
      </span>
      <div>
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular">{value}</p>
      </div>
    </Card>
  );
}

function Row({ label, value }: Readonly<{ label: string; value: ReactNode }>) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
