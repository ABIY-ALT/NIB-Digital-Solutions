'use client';

import { ChevronsUpDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { humanizeCode } from '@/shared/lib/format';
import { useUiStore } from '@/shared/stores/ui-store';
import { AccountMenu, PresenceAvatar } from '@/shared/ui/account-menu';
import { useCurrentUser } from './permissions-provider';
import { useAccountMenu, type LocaleOption } from './user-menu';

/** Sidebar footer: signed-in user; opens the same account menu as the header avatar. */
export function SidebarUserCard({ locales = [] }: Readonly<{ locales?: LocaleOption[] }>) {
  const t = useTranslations('auth');
  const user = useCurrentUser();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const menu = useAccountMenu(locales);
  if (!user || !menu) return null;

  return (
    <AccountMenu
      {...menu}
      triggerLabel={t('userMenu')}
      side={collapsed ? 'right' : 'top'}
      align={collapsed ? 'end' : 'start'}
      trigger={
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-2.5 rounded-surface border border-transparent text-start outline-none transition-colors hover:border-border hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-border data-[state=open]:bg-hover',
            collapsed ? 'justify-center p-1.5' : 'px-2.5 py-2',
          )}
        >
          <PresenceAvatar name={user.name} size={34} presence="online" />
          {!collapsed ? (
            <>
              <span className="min-w-0 flex-1 leading-[1.3]">
                <span className="block truncate text-[13px] font-semibold">{user.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {user.roles.map(humanizeCode).join(', ')}
                </span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-subtle-foreground" aria-hidden />
            </>
          ) : null}
        </button>
      }
    />
  );
}
