'use client';

import { KeyRound, ShieldAlert, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { usePasswordPolicy } from '@/features/auth/hooks/use-auth';
import { Button } from '@/shared/ui/button';
import { useProfile } from '../hooks/use-profile';

const DISMISS_KEY = 'appcore.account-notices.dismissed';

/**
 * Account-security reminders shown above every page: password expiring soon
 * (policy warning window) and two-step verification required by the user's
 * role. Dismissible for the browser session.
 */
export function AccountNotices() {
  const t = useTranslations('profile.notices');
  const pathname = usePathname();
  const { data: profile } = useProfile();
  const { data: policy } = usePasswordPolicy();
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    try {
      setDismissed(JSON.parse(sessionStorage.getItem(DISMISS_KEY) ?? '[]') as string[]);
    } catch {
      /* storage unavailable: show notices */
    }
  }, []);

  if (!profile || pathname.startsWith('/profile')) return null;
  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      sessionStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const notices: Array<{ id: string; icon: typeof KeyRound; title: string; action: string }> = [];
  if (profile.passwordExpiresAt && policy) {
    const days = Math.ceil((Date.parse(profile.passwordExpiresAt) - Date.now()) / 86_400_000);
    if (days <= policy.expiryWarningDays) {
      notices.push({
        id: `pwd-${profile.passwordExpiresAt}`,
        icon: KeyRound,
        title: t('passwordExpiring', { days: Math.max(0, days) }),
        action: t('changePassword'),
      });
    }
  }
  if (profile.mfaRequired) {
    notices.push({ id: 'mfa', icon: ShieldAlert, title: t('mfaRequired'), action: t('setUpMfa') });
  }
  const visible = notices.filter((n) => !dismissed.includes(n.id));
  if (visible.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {visible.map(({ id, icon: Icon, title, action }) => (
        <div
          key={id}
          className="flex flex-wrap items-center gap-3 rounded-surface border border-warning/40 bg-warning-soft/60 px-4 py-2.5 text-sm"
        >
          <Icon className="size-4 shrink-0 text-warning" aria-hidden />
          <output className="min-w-0 flex-1 font-medium">{title}</output>
          <Button asChild size="sm" variant="outline" className="h-7 bg-surface">
            <Link href="/profile?tab=security">{action}</Link>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('dismiss')}
            onClick={() => dismiss(id)}
          >
            <X />
          </Button>
        </div>
      ))}
    </div>
  );
}
