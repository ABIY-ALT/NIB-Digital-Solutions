'use client';

import {
  Activity,
  AlertTriangle,
  AtSign,
  Building2,
  CircleUser,
  IdCard,
  KeyRound,
  Laptop,
  LogIn,
  Mail,
  Pencil,
  Phone,
  ShieldCheck,
  UserCog,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { formatDate, formatNumber, formatRelative, humanizeCode } from '@/shared/lib/format';
import type { UserProfile } from '@/shared/types';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { ChecklistScore, type ChecklistItem } from '@/shared/ui/checklist-score';
import { EmptyState } from '@/shared/ui/feedback';
import { InfoList } from '@/shared/ui/info-list';
import { StatStrip } from '@/shared/ui/stat-strip';
import { TagGroups, type TagGroup } from '@/shared/ui/tag-groups';
import { Timeline } from '@/shared/ui/timeline';
import { useMyActivity, useMyActivitySummary } from '../hooks/use-profile';
import { useActivityItems } from './activity-feed';

const EXPIRY_WARNING_DAYS = 14;

/** Kept for existing imports; lives in shared/lib/format. */
export { humanizeCode };

/** Overview tab: identity and contacts, security score | figures, recent activity, access. */
export function ProfileOverview({
  profile,
  onEdit,
  tabHref,
}: Readonly<{
  profile: UserProfile;
  onEdit: () => void;
  tabHref: (tab: string) => string;
}>) {
  const t = useTranslations('profile');
  const ts = useTranslations('users.status');
  const locale = useLocale();
  const summary = useMyActivitySummary();
  const recent = useMyActivity(6);
  const recentItems = useActivityItems(recent.data?.pages[0]?.items ?? []);
  const s = summary.data;

  // ── Security checklist ──────────────────────────────────────────────────
  const expiresAt = profile.passwordExpiresAt ? new Date(profile.passwordExpiresAt) : null;
  const passwordFresh =
    !expiresAt || expiresAt.getTime() - Date.now() > EXPIRY_WARNING_DAYS * 86_400_000;
  const checklist: ChecklistItem[] = [
    {
      id: 'mfa',
      label: t('health.mfa'),
      description: t('health.mfaDesc'),
      done: profile.mfaEnabled,
      weight: 3,
      action: { label: t('health.actions.enable'), href: tabHref('security') },
    },
    {
      id: 'password',
      label: t('health.password'),
      description: expiresAt
        ? t('health.passwordExpires', { date: formatDate(expiresAt, locale) })
        : t('health.passwordNoExpiry'),
      done: passwordFresh,
      weight: 2,
      action: { label: t('health.actions.change'), href: tabHref('security') },
    },
    {
      id: 'failures',
      label: t('health.noFailures', { days: s?.days ?? 30 }),
      description: s?.lastFailedSignInAt
        ? t('health.lastFailure', { time: formatRelative(s.lastFailedSignInAt, locale) })
        : undefined,
      done: (s?.failedSignIns ?? 0) === 0,
      action: { label: t('health.actions.review'), href: tabHref('activity') },
    },
    {
      id: 'phone',
      label: t('health.phone'),
      description: t('health.phoneDesc'),
      done: !!profile.phoneNumber,
      action: { label: t('health.actions.add'), onClick: onEdit },
    },
  ];

  // ── Access: permissions grouped by module ("users:read" → Users) ─────────
  const all = profile.permissions.includes('*');
  const groups: TagGroup[] = Object.entries(
    profile.permissions
      .filter((p) => p !== '*')
      .reduce<Record<string, string[]>>((acc, p) => {
        const [resource = p, ...rest] = p.split(':');
        const actions = acc[resource] ?? [];
        actions.push(rest.join(':') || p);
        acc[resource] = actions;
        return acc;
      }, {}),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([resource, actions]) => ({
      id: resource,
      label: humanizeCode(resource),
      tags: actions
        .toSorted((a, b) => a.localeCompare(b))
        .map((a) => ({ id: `${resource}:${a}`, label: a, title: `${resource}:${a}` })),
    }));

  const copy = { copyLabel: t('about.copy'), copiedLabel: t('about.copied') };

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <div className="space-y-5 xl:col-span-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('about.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoList
              {...copy}
              items={[
                {
                  id: 'name',
                  icon: <CircleUser />,
                  label: t('about.fullName'),
                  value: profile.fullName,
                },
                {
                  id: 'username',
                  icon: <AtSign />,
                  label: t('about.username'),
                  value: profile.username,
                  mono: true,
                  copy: profile.username,
                },
                {
                  id: 'status',
                  icon: <IdCard />,
                  label: t('about.status'),
                  value: (
                    <Badge tone={profile.status === 'ACTIVE' ? 'success' : 'warning'} dot>
                      {ts(profile.status)}
                    </Badge>
                  ),
                },
                {
                  id: 'branch',
                  icon: <Building2 />,
                  label: t('about.branch'),
                  value: profile.branchCode ?? t('about.notSet'),
                },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('about.contacts')}</CardTitle>
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil /> {t('header.editProfile')}
            </Button>
          </CardHeader>
          <CardContent>
            <InfoList
              {...copy}
              items={[
                {
                  id: 'email',
                  icon: <Mail />,
                  label: t('about.email'),
                  value: profile.email,
                  copy: profile.email,
                },
                {
                  id: 'phone',
                  icon: <Phone />,
                  label: t('about.phone'),
                  value: profile.phoneNumber ?? (
                    <span className="text-subtle-foreground">{t('about.notSet')}</span>
                  ),
                  copy: profile.phoneNumber ?? undefined,
                },
              ]}
            />
            <p className="mt-3 text-xs text-muted-foreground">{t('about.managedByAdmin')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
                {t('health.title')}
              </CardTitle>
              <CardDescription>{t('health.description')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ChecklistScore
              items={checklist}
              scoreLabel={t('health.scoreLabel')}
              levels={[
                { min: 0, label: t('health.levels.atRisk'), tone: 'danger' },
                { min: 50, label: t('health.levels.fair'), tone: 'warning' },
                { min: 80, label: t('health.levels.good'), tone: 'info' },
                { min: 100, label: t('health.levels.excellent'), tone: 'success' },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <div className="min-w-0 space-y-5 xl:col-span-8">
        <StatStrip
          items={[
            {
              id: 'signIns',
              label: t('stats.signIns'),
              value: s ? formatNumber(s.signIns, locale) : '…',
              icon: <LogIn />,
              tone: 'success',
              hint: t('stats.window', { days: s?.days ?? 30 }),
            },
            {
              id: 'failed',
              label: t('stats.failedSignIns'),
              value: s ? formatNumber(s.failedSignIns, locale) : '…',
              icon: <AlertTriangle />,
              tone: s?.failedSignIns ? 'danger' : 'neutral',
              hint: t('stats.window', { days: s?.days ?? 30 }),
            },
            {
              id: 'changes',
              label: t('stats.changes'),
              value: s ? formatNumber(s.changes, locale) : '…',
              icon: <UserCog />,
              tone: 'primary',
              hint: t('stats.window', { days: s?.days ?? 30 }),
            },
            {
              id: 'devices',
              label: t('stats.devices'),
              value: s ? formatNumber(s.devices, locale) : '…',
              icon: <Laptop />,
              tone: 'info',
              hint: t('stats.window', { days: s?.days ?? 30 }),
            },
          ]}
        />

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="size-4 text-muted-foreground" aria-hidden />
                {t('activity.title')}
              </CardTitle>
              <CardDescription>{t('activity.description')}</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={tabHref('activity')} scroll={false}>
                {t('activity.viewAll')}
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <Timeline
              items={recentItems}
              loading={recent.isPending}
              empty={<EmptyState icon={<Activity />} title={t('activity.empty')} />}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-4 text-muted-foreground" aria-hidden />
                {t('access.title')}
              </CardTitle>
              <CardDescription>{t('access.description')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {profile.roles.map((r) => (
                <Badge key={r} tone="primary">
                  {humanizeCode(r)}
                </Badge>
              ))}
            </div>
            {all ? (
              <p className="rounded-control border border-primary/40 bg-primary-softer px-3 py-2 text-sm font-medium">
                {t('access.all')}
              </p>
            ) : null}
            {groups.length ? (
              <TagGroups
                groups={groups}
                initialGroups={5}
                showAllLabel={(count) => t('access.showAll', { count })}
                showLessLabel={t('access.showLess')}
              />
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
