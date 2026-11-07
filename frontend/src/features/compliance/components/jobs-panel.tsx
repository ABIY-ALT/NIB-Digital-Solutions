'use client';

import { Play } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { usePermissions } from '@/features/auth/components/permissions-provider';
import { describeError } from '@/shared/errors/error-messages';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { RelativeTime } from '@/shared/ui/relative-time';
import { toast } from '@/shared/ui/toaster';
import { useTriggerJob } from '../hooks/use-compliance';
import type { ComplianceOverview } from '../types';

const STATUS_TONE = { success: 'success', failed: 'danger', skipped: 'neutral' } as const;

function every(ms: number, t: (k: string, v: Record<string, number>) => string): string {
  const minutes = Math.round(ms / 60_000);
  return minutes >= 60
    ? t('everyHours', { count: Math.round(minutes / 60) })
    : t('everyMinutes', { count: minutes });
}

/** Background jobs of this instance (retention, approval expiry, anchors, reminders). */
export function JobsPanel({ overview: o }: Readonly<{ overview: ComplianceOverview }>) {
  const t = useTranslations('compliance.jobs');
  const te = useTranslations('errors');
  const locale = useLocale();
  const { can } = usePermissions();
  const trigger = useTriggerJob();

  return (
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-start font-semibold">{t('name')}</th>
              <th className="px-4 py-2 text-start font-semibold">{t('schedule')}</th>
              <th className="px-4 py-2 text-start font-semibold">{t('lastRun')}</th>
              <th className="px-4 py-2 text-start font-semibold">{t('status')}</th>
              <th className="px-4 py-2 text-start font-semibold">{t('nextRun')}</th>
              <th className="w-28" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {o.jobs.map((j) => (
              <tr key={j.name}>
                <td className="px-4 py-3">
                  <p className="font-semibold">
                    {t.has(`names.${j.name}`) ? t(`names.${j.name}`) : j.name}
                  </p>
                  <code className="text-[11px] text-muted-foreground">{j.name}</code>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{every(j.everyMs, t)}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {j.lastFinishedAt ? (
                    <RelativeTime value={j.lastFinishedAt} locale={locale} />
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3">
                  {j.lastStatus ? (
                    <Badge tone={STATUS_TONE[j.lastStatus]} dot title={j.lastError ?? undefined}>
                      {t(`statuses.${j.lastStatus}`)}
                    </Badge>
                  ) : (
                    <span className="text-subtle-foreground">{t('notYet')}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {j.nextRunAt ? (
                    <RelativeTime value={j.nextRunAt} locale={locale} />
                  ) : (
                    t('disabled')
                  )}
                </td>
                <td className="px-4 py-3 text-end">
                  {can('compliance:manage') ? (
                    <Button
                      variant="outline"
                      size="sm"
                      loading={trigger.isPending && trigger.variables === j.name}
                      disabled={trigger.isPending}
                      onClick={() =>
                        trigger.mutate(j.name, {
                          onSuccess: (r) =>
                            r.result === 'ran' ? toast.success(t('ran')) : toast.info(t('skipped')),
                          onError: (e) => toast.error(describeError(e, te).message),
                        })
                      }
                    >
                      <Play /> {t('runNow')}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
