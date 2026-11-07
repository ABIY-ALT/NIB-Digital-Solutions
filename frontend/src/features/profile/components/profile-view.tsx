'use client';

import {
  Activity,
  BadgeCheck,
  Building2,
  CalendarDays,
  Clock,
  KeyRound,
  LaptopMinimal,
  Lock,
  Pencil,
  Shield,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { describeError } from '@/shared/errors/error-messages';
import { usePageBreadcrumbs } from '@/shared/layouts/page-breadcrumbs';
import { formatRelative } from '@/shared/lib/format';
import type { UserProfile } from '@/shared/types';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { ErrorState, PageSkeleton, Skeleton } from '@/shared/ui/feedback';
import { ProfileHeader } from '@/shared/ui/profile-header';
import { useMySessions } from '../hooks/use-account';
import { useProfile } from '../hooks/use-profile';
import { ActivityFeed } from './activity-feed';
import { EditProfileDialog } from './edit-profile-dialog';
import type { PreferencesPanelProps } from './preferences-panel';
import { humanizeCode, ProfileOverview } from './profile-overview';

// Tabs are code-split: a panel's code loads the first time its tab is opened.
const SecurityPanel = dynamic(() => import('./security-panel').then((m) => m.SecurityPanel), {
  loading: () => <PageSkeleton />,
});
const SessionsPanel = dynamic(() => import('./sessions-panel').then((m) => m.SessionsPanel), {
  loading: () => <PageSkeleton />,
});
const PreferencesPanel = dynamic(
  () => import('./preferences-panel').then((m) => m.PreferencesPanel),
  { loading: () => <PageSkeleton /> },
);

const TABS = ['overview', 'activity', 'security', 'sessions', 'preferences'] as const;
type Tab = (typeof TABS)[number];
const TAB_ICONS: Record<Tab, typeof UserRound> = {
  overview: UserRound,
  activity: Activity,
  security: Lock,
  sessions: LaptopMinimal,
  preferences: SlidersHorizontal,
};

/**
 * My profile (Vuexy / Materio user-profile layout): profile header with cover,
 * identity, meta and tabs; Overview (about, contacts, security score, figures,
 * recent activity, access), Activity, Security, Sessions, Preferences.
 * The tab lives in ?tab= so every view can be linked and bookmarked.
 */
export function ProfileView({ preferences }: Readonly<{ preferences: PreferencesPanelProps }>) {
  const t = useTranslations('profile');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const ts = useTranslations('users.status');
  const locale = useLocale();
  const { data: profile, isPending, error, refetch } = useProfile();
  const sessions = useMySessions();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState(false);
  const requested = searchParams.get('tab');
  const tab: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : 'overview';
  const tabHref = (id: string) => (id === 'overview' ? pathname : `${pathname}?tab=${id}`);

  // "Home › Account › My profile › Security ▾" — the last crumb switches tabs.
  usePageBreadcrumbs([
    {
      label: t(`tabs.${tab}`),
      icon: <TabIcon tab={tab} />,
      siblings: TABS.map((id) => ({
        label: t(`tabs.${id}`),
        href: tabHref(id),
        active: id === tab,
        icon: <TabIcon tab={id} />,
      })),
    },
  ]);

  if (isPending) return <ProfileSkeleton />;
  if (error || !profile) {
    const { message, correlationId } = describeError(error, te);
    return (
      <ErrorState
        className="rounded-surface border border-border bg-surface"
        title={te('title')}
        description={message}
        correlationId={correlationId}
        referenceLabel={tc('reference')}
        action={
          <Button variant="outline" onClick={() => refetch()}>
            {tc('retry')}
          </Button>
        }
      />
    );
  }

  const sessionCount = sessions.data?.length;

  return (
    <div className="space-y-5">
      <ProfileHeader
        name={profile.fullName}
        handle={`@${profile.username}`}
        presence="online"
        presenceLabel={t('header.signedIn')}
        badges={
          <>
            <Badge tone={profile.status === 'ACTIVE' ? 'success' : 'warning'} dot>
              {ts(profile.status)}
            </Badge>
            {profile.mfaEnabled ? (
              <Badge tone="info">
                <BadgeCheck className="size-3.5" aria-hidden /> {t('header.mfaOn')}
              </Badge>
            ) : null}
          </>
        }
        meta={[
          {
            icon: <Shield />,
            title: t('header.roles'),
            label: profile.roles.map(humanizeCode).join(', '),
          },
          ...(profile.branchCode
            ? [{ icon: <Building2 />, title: t('header.branch'), label: profile.branchCode }]
            : []),
          {
            icon: <CalendarDays />,
            label: t('header.joined', {
              date: new Intl.DateTimeFormat(locale === 'am' ? 'am-ET' : 'en-GB', {
                month: 'long',
                year: 'numeric',
              }).format(new Date(profile.createdAt)),
            }),
          },
          ...(profile.lastLoginAt
            ? [
                {
                  icon: <Clock />,
                  label: t('header.lastSignIn', {
                    time: formatRelative(profile.lastLoginAt, locale),
                  }),
                },
              ]
            : []),
        ]}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={tabHref('security')} scroll={false}>
                <KeyRound /> {t('header.changePassword')}
              </Link>
            </Button>
            <Button onClick={() => setEditing(true)}>
              <Pencil /> {t('header.editProfile')}
            </Button>
          </>
        }
        tabsLabel={t('title')}
        activeTab={tab}
        tabs={TABS.map((id) => {
          const Icon = TAB_ICONS[id];
          return {
            id,
            label: t(`tabs.${id}`),
            icon: <Icon />,
            href: tabHref(id),
            badge: tabBadge(id, sessionCount, profile.mfaEnabled, t('header.attention')),
          };
        })}
      />

      <ProfileTabPanel
        tab={tab}
        profile={profile}
        preferences={preferences}
        onEdit={() => setEditing(true)}
        tabHref={tabHref}
      />

      <EditProfileDialog profile={profile} open={editing} onOpenChange={setEditing} />
    </div>
  );
}

/** A count on the Sessions tab; a dot on Security while two-step verification is off. */
function tabBadge(
  id: Tab,
  sessionCount: number | undefined,
  mfaEnabled: boolean,
  attentionLabel: string,
): ReactNode {
  if (id === 'sessions' && sessionCount) {
    return (
      <span className="rounded-pill bg-muted px-1.5 text-[10px] leading-4 font-bold text-muted-foreground tabular">
        {sessionCount}
      </span>
    );
  }
  if (id === 'security' && !mfaEnabled) {
    return (
      <>
        <span className="size-1.5 rounded-full bg-warning" aria-hidden />
        <span className="sr-only">({attentionLabel})</span>
      </>
    );
  }
  return undefined;
}

function ProfileTabPanel({
  tab,
  profile,
  preferences,
  onEdit,
  tabHref,
}: Readonly<{
  tab: Tab;
  profile: UserProfile;
  preferences: PreferencesPanelProps;
  onEdit: () => void;
  tabHref: (tab: string) => string;
}>) {
  const t = useTranslations('profile');
  switch (tab) {
    case 'overview':
      return <ProfileOverview profile={profile} onEdit={onEdit} tabHref={tabHref} />;
    case 'activity':
      return (
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="size-4 text-muted-foreground" aria-hidden />
                {t('activity.tabTitle')}
              </CardTitle>
              <CardDescription>{t('activity.tabDescription')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ActivityFeed />
          </CardContent>
        </Card>
      );
    case 'security':
      return <SecurityPanel profile={profile} />;
    case 'sessions':
      return <SessionsPanel />;
    default:
      return <PreferencesPanel {...preferences} />;
  }
}

function TabIcon({ tab }: Readonly<{ tab: Tab }>) {
  const Icon = TAB_ICONS[tab];
  return <Icon aria-hidden />;
}

/** Layout-shaped placeholder (no jump when the profile arrives). */
function ProfileSkeleton() {
  return (
    <div className="space-y-5" aria-busy>
      <div className="overflow-hidden rounded-surface border border-border bg-surface">
        <Skeleton className="h-28 rounded-none sm:h-36" />
        <div className="flex items-end gap-4 px-6 pb-5">
          <Skeleton className="-mt-12 size-28 rounded-surface" />
          <div className="flex-1 space-y-2 pb-1">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-12">
        <Skeleton className="h-80 xl:col-span-4" />
        <Skeleton className="h-80 xl:col-span-8" />
      </div>
    </div>
  );
}
