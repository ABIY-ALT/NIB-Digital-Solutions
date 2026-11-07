'use client';

import { Lock, Mail, MonitorSmartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { describeError } from '@/shared/errors/error-messages';
import { Button } from '@/shared/ui/button';
import { Switch } from '@/shared/ui/choice';
import { Skeleton } from '@/shared/ui/feedback';
import { Dialog, DialogContent } from '@/shared/ui/overlay';
import { toast } from '@/shared/ui/toaster';
import {
  useNotificationPreferences,
  useSaveNotificationPreferences,
} from '../hooks/use-notifications';
import type { NotificationPreference } from '../types';
import { CategoryIcon } from './notification-visuals';

/** Per-category delivery channels (in-app, e-mail). Security alerts always stay on in-app. */
export function PreferencesDialog({
  open,
  onOpenChange,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const t = useTranslations('notifications.settings');
  const tn = useTranslations('notifications');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const { data, isPending } = useNotificationPreferences(open);
  const save = useSaveNotificationPreferences();
  const [draft, setDraft] = useState<NotificationPreference[]>([]);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const set = (category: string, patch: Partial<NotificationPreference>) =>
    setDraft((d) => d.map((p) => (p.category === category ? { ...p, ...patch } : p)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        title={t('title')}
        description={t('description')}
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button
              loading={save.isPending}
              disabled={isPending}
              onClick={() =>
                save.mutate(
                  draft.map(({ category, inApp, email }) => ({ category, inApp, email })),
                  {
                    onSuccess: () => {
                      toast.success(t('saved'));
                      onOpenChange(false);
                    },
                    onError: (error) => toast.error(describeError(error, te).message),
                  },
                )
              }
            >
              {tc('save')}
            </Button>
          </>
        }
      >
        {isPending ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="pb-2 text-start font-semibold">{t('category')}</th>
                <th className="w-24 pb-2 text-center font-semibold">
                  <span className="inline-flex items-center gap-1">
                    <MonitorSmartphone className="size-3.5" aria-hidden /> {t('inApp')}
                  </span>
                </th>
                <th className="w-24 pb-2 text-center font-semibold">
                  <span className="inline-flex items-center gap-1">
                    <Mail className="size-3.5" aria-hidden /> {t('email')}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {draft.map((p) => {
                const category = tn(`categories.${p.category}`);
                return (
                  <tr key={p.category}>
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <CategoryIcon category={p.category} className="size-8" />
                        <div>
                          <p className="font-semibold">{tn(`categories.${p.category}`)}</p>
                          <p className="text-xs text-muted-foreground">
                            {t(`hints.${p.category}`)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="text-center">
                      {p.inAppLocked ? (
                        <span
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                          title={t('locked')}
                        >
                          <Lock className="size-3.5" aria-hidden />
                          <span className="sr-only">{t('locked')}</span>
                          <Switch checked disabled aria-label={`${category} · ${t('inApp')}`} />
                        </span>
                      ) : (
                        <Switch
                          checked={p.inApp}
                          onCheckedChange={(v) => set(p.category, { inApp: v })}
                          aria-label={`${category} · ${t('inApp')}`}
                        />
                      )}
                    </td>
                    <td className="text-center">
                      <Switch
                        checked={p.email}
                        onCheckedChange={(v) => set(p.category, { email: v })}
                        aria-label={`${category} · ${t('email')}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </DialogContent>
    </Dialog>
  );
}
