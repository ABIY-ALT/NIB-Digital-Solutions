'use client';

import {
  BadgeCheck,
  Bell,
  Building2,
  Clock,
  Languages,
  LaptopMinimal,
  Lock,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import { useNotificationSummary } from '@/features/notifications/hooks/use-notifications';
import { useChangeLocale } from '@/shared/i18n/use-change-locale';
import { formatDate, formatDateTime, humanizeCode } from '@/shared/lib/format';
import { COLOR_MODE_ICON } from '@/shared/theme/theme-switcher';
import { useTheme } from '@/shared/theme/theme-provider';
import {
  AccountMenu,
  type AccountMenuProps,
  type AccountMenuSection,
} from '@/shared/ui/account-menu';
import { Badge } from '@/shared/ui/badge';
import { useLogout } from '../hooks/use-auth';
import { useCurrentUser } from './permissions-provider';

export interface LocaleOption {
  code: string;
  label: string;
}

const PROFILE = '/profile';
const profileTab = (tab: string) => `${PROFILE}?tab=${tab}`;

/**
 * This product's account menu content: identity from the session, a security
 * callout while two-step verification is off, account pages, appearance and
 * language, the session end time and sign-out. The header avatar menu and the
 * sidebar card render the same content through the shared <AccountMenu>.
 */
export function useAccountMenu(
  locales: LocaleOption[],
): Omit<AccountMenuProps, 'triggerLabel' | 'trigger' | 'side' | 'align'> | null {
  const t = useTranslations('auth.menu');
  const ta = useTranslations('auth');
  const tt = useTranslations('theme');
  const user = useCurrentUser();
  const locale = useLocale();
  const theme = useTheme();
  const logout = useLogout();
  const changeLocale = useChangeLocale();
  const { data: session } = useSession();
  const unread = useNotificationSummary().data?.unread ?? 0;
  if (!user) return null;

  const sections: AccountMenuSection[] = [
    {
      id: 'account',
      label: t('sections.account'),
      items: [
        {
          kind: 'link',
          id: 'profile',
          label: ta('myProfile'),
          icon: <UserRound />,
          href: PROFILE,
        },
        {
          kind: 'link',
          id: 'security',
          label: t('security'),
          icon: <Lock />,
          href: profileTab('security'),
          badge: user.mfaEnabled ? undefined : (
            <span className="size-2 rounded-full bg-warning" aria-label={t('attention')} />
          ),
        },
        {
          kind: 'link',
          id: 'sessions',
          label: t('sessions'),
          icon: <LaptopMinimal />,
          href: profileTab('sessions'),
        },
        {
          kind: 'link',
          id: 'notifications',
          label: t('notifications'),
          icon: <Bell />,
          href: '/notifications',
          badge: unread ? (
            <span className="rounded-pill bg-primary px-1.5 text-[11px] leading-4 font-semibold text-primary-foreground tabular">
              {unread > 99 ? '99+' : unread}
              <span className="sr-only"> {t('unread')}</span>
            </span>
          ) : undefined,
        },
      ],
    },
    {
      id: 'preferences',
      label: t('sections.preferences'),
      items: [
        ...(theme.canSwitch
          ? [
              {
                kind: 'choice' as const,
                id: 'appearance',
                label: tt('appearance'),
                icon: (() => {
                  const Icon = COLOR_MODE_ICON[theme.mode];
                  return <Icon />;
                })(),
                value: theme.mode,
                options: theme.modes.map((mode) => {
                  const Icon = COLOR_MODE_ICON[mode];
                  return { value: mode, label: tt(`modes.${mode}`), icon: <Icon /> };
                }),
                onChange: (mode: string) => theme.setMode(mode as typeof theme.mode),
              },
            ]
          : []),
        ...(locales.length > 1
          ? [
              {
                kind: 'choice' as const,
                id: 'language',
                label: t('language'),
                icon: <Languages />,
                value: locale,
                disabled: changeLocale.isPending,
                options: locales.map((l) => ({ value: l.code, label: l.label, lang: l.code })),
                onChange: (code: string) => changeLocale.mutate(code),
              },
            ]
          : []),
        {
          kind: 'link',
          id: 'preferences',
          label: t('allPreferences'),
          icon: <SlidersHorizontal />,
          href: profileTab('preferences'),
        },
      ],
    },
  ];

  return {
    name: user.name,
    handle: `@${user.username}`,
    email: user.email,
    presence: 'online',
    presenceLabel: t('online'),
    badges: user.mfaEnabled ? (
      <Badge tone="info" className="px-1.5">
        <BadgeCheck className="size-3" aria-hidden /> {t('mfaOn')}
      </Badge>
    ) : undefined,
    meta: [
      ...(user.roles.length
        ? [
            {
              icon: <Shield />,
              title: t('roles'),
              label: user.roles.map(humanizeCode).join(', '),
            },
          ]
        : []),
      ...(user.branchCode
        ? [{ icon: <Building2 />, title: t('branch'), label: user.branchCode }]
        : []),
    ],
    profileHref: PROFILE,
    profileLabel: t('viewProfile'),
    notice: user.mfaEnabled
      ? undefined
      : {
          tone: 'warning',
          icon: <ShieldAlert />,
          title: t('mfaTitle'),
          action: { label: t('mfaAction'), href: profileTab('security') },
        },
    sections,
    signOut: {
      label: ta('signOut'),
      pending: logout.isPending,
      hint: session?.expires ? (
        <span title={t('sessionEnds', { time: formatDateTime(session.expires, locale) })}>
          <span className="sr-only">
            {t('sessionEnds', { time: formatDateTime(session.expires, locale) })}
          </span>
          <span className="inline-flex items-center gap-1" aria-hidden>
            <Clock className="size-3!" />
            {formatDate(session.expires, locale, { timeStyle: 'short' })}
          </span>
        </span>
      ) : undefined,
      onSelect: () => logout.mutate(undefined),
    },
  };
}

/** Header avatar menu. */
export function UserMenu({ locales = [] }: Readonly<{ locales?: LocaleOption[] }>) {
  const t = useTranslations('auth');
  const menu = useAccountMenu(locales);
  if (!menu) return null;
  return <AccountMenu {...menu} triggerLabel={t('userMenu')} />;
}
