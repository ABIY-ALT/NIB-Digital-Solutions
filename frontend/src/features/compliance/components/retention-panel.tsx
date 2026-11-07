'use client';

import { Archive, ChevronDown, FlaskConical, Play, Trash } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Fragment, useState } from 'react';
import { usePermissions } from '@/features/auth/components/permissions-provider';
import { describeError } from '@/shared/errors/error-messages';
import { cn } from '@/shared/lib/cn';
import { formatDateTime } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/feedback';
import { ConfirmDialog } from '@/shared/ui/overlay';
import { toast } from '@/shared/ui/toaster';
import { useRetentionPreview, useRetentionRuns, useRunRetention } from '../hooks/use-compliance';
import type { ComplianceOverview, RetentionRun } from '../types';
import { formatPeriod } from './policies-panel';

const RUN_TONE = { RUNNING: 'info', SUCCEEDED: 'success', FAILED: 'danger' } as const;

/** Retention policies with what is due now, manual runs (dry run first) and the run history. */
export function RetentionPanel({ overview: o }: Readonly<{ overview: ComplianceOverview }>) {
  const t = useTranslations('compliance.retention');
  const tp = useTranslations('compliance.policies');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { can } = usePermissions();
  const preview = useRetentionPreview();
  const run = useRunRetention();
  const [page, setPage] = useState(1);
  const runs = useRetentionRuns(page);
  const [confirming, setConfirming] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const due = new Map<string, number>((preview.data ?? []).map((p) => [p.policy, p.matched]));

  const start = (dryRun: boolean) =>
    run.mutate(dryRun, {
      onSuccess: (r) => {
        const purged = r.results.reduce((n, x) => n + x.purged, 0);
        const matched = r.results.reduce((n, x) => n + x.matched, 0);
        toast.success(
          dryRun ? t('dryRunDone', { count: matched }) : t('runDone', { count: purged }),
        );
        setExpanded(r.id);
        setConfirming(false);
      },
      onError: (e) => {
        toast.error(describeError(e, te).message);
        setConfirming(false);
      },
    });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-[15px]">{t('policies')}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {o.retention.enabled
                ? t('scheduled', { hours: o.retention.intervalHours })
                : t('disabled')}
            </p>
          </div>
          {can('compliance:manage') ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                loading={run.isPending && run.variables === true}
                onClick={() => start(true)}
              >
                <FlaskConical /> {t('dryRun')}
              </Button>
              <Button size="sm" disabled={run.isPending} onClick={() => setConfirming(true)}>
                <Play /> {t('runNow')}
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="border-y border-border bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-start font-semibold">{t('dataset')}</th>
                <th className="px-4 py-2 text-start font-semibold">{t('period')}</th>
                <th className="px-4 py-2 text-start font-semibold">{t('handling')}</th>
                <th className="px-4 py-2 text-end font-semibold">{t('dueNow')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {o.retention.policies.map((p) => (
                <tr key={p.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{p.dataset}</p>
                    <p className="text-xs text-muted-foreground">{p.description}</p>
                    {p.basis ? (
                      <p className="mt-0.5 text-[11px] text-subtle-foreground">{p.basis}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatPeriod(p.retentionDays, tp)}
                  </td>
                  <td className="px-4 py-3">
                    {p.archive ? (
                      <Badge tone="info">
                        <Archive className="size-3.5" aria-hidden /> {t('archiveThenDelete')}
                      </Badge>
                    ) : (
                      <Badge tone="neutral">
                        <Trash className="size-3.5" aria-hidden /> {t('delete')}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-end tabular">
                    {preview.isPending ? (
                      <Skeleton className="ms-auto h-4 w-10" />
                    ) : (
                      (due.get(p.id) ?? 0).toLocaleString(locale)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-[15px]">{t('history')}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {runs.isPending ? (
            <div className="p-4">
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <RunHistoryTable
              runs={runs.data?.items ?? []}
              expanded={expanded}
              onExpand={setExpanded}
            />
          )}
          {runs.data && runs.data.pagination.totalPages > 1 ? (
            <div className="flex items-center justify-end gap-2 border-t border-border p-2 text-xs">
              <Button
                variant="outline"
                size="sm"
                disabled={!runs.data.pagination.hasPreviousPage}
                onClick={() => setPage((p) => p - 1)}
              >
                {tc('back')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!runs.data.pagination.hasNextPage}
                onClick={() => setPage((p) => p + 1)}
              >
                {tc('next')}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('confirm.title')}
        description={t('confirm.description')}
        confirmLabel={t('runNow')}
        cancelLabel={tc('cancel')}
        loading={run.isPending}
        onConfirm={() => start(false)}
      />
    </div>
  );
}

/** Past runs; a row opens the per-policy results of that run. */
function RunHistoryTable({
  runs,
  expanded,
  onExpand,
}: Readonly<{
  runs: readonly RetentionRun[];
  expanded: string | null;
  onExpand: (id: string | null) => void;
}>) {
  const t = useTranslations('compliance.retention');
  const locale = useLocale();
  if (runs.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">{t('noRuns')}</p>;
  }
  return (
    <table className="w-full min-w-[44rem] text-sm">
      <thead className="border-y border-border bg-muted/50 text-xs text-muted-foreground">
        <tr>
          <th className="w-8" />
          <th className="px-3 py-2 text-start font-semibold">{t('started')}</th>
          <th className="px-3 py-2 text-start font-semibold">{t('trigger')}</th>
          <th className="px-3 py-2 text-start font-semibold">{t('status')}</th>
          <th className="px-3 py-2 text-end font-semibold">{t('removed')}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {runs.map((r) => {
          const open = expanded === r.id;
          const purged = r.results.reduce((n, x) => n + x.purged, 0);
          const matched = r.results.reduce((n, x) => n + x.matched, 0);
          return (
            <Fragment key={r.id}>
              <tr
                className="cursor-pointer hover:bg-muted/40"
                onClick={() => onExpand(open ? null : r.id)}
              >
                <td className="ps-3">
                  <ChevronDown
                    className={cn(
                      'size-4 text-muted-foreground transition-transform',
                      open && 'rotate-180',
                    )}
                    aria-hidden
                  />
                </td>
                <td className="px-3 py-2.5 tabular">{formatDateTime(r.startedAt, locale)}</td>
                <td className="px-3 py-2.5">
                  {t(`triggers.${r.trigger}`)}
                  {r.dryRun ? (
                    <Badge tone="outline" className="ms-2">
                      {t('dryRunTag')}
                    </Badge>
                  ) : null}
                </td>
                <td className="px-3 py-2.5">
                  <Badge tone={RUN_TONE[r.status]} dot>
                    {t(`statuses.${r.status}`)}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 text-end tabular">
                  {r.dryRun ? t('wouldRemove', { count: matched }) : purged.toLocaleString(locale)}
                </td>
              </tr>
              {open ? (
                <tr className="bg-muted/30">
                  <td />
                  <td colSpan={4} className="px-3 py-3">
                    <ul className="space-y-1.5 text-xs">
                      {r.results.map((x) => (
                        <li
                          key={x.policy}
                          className="flex flex-wrap items-center gap-x-3 gap-y-0.5"
                        >
                          <span className="w-40 font-semibold">{x.dataset}</span>
                          <span className="text-muted-foreground">
                            {t('resultLine', {
                              matched: x.matched,
                              purged: x.purged,
                              archived: x.archived,
                            })}
                          </span>
                          {x.archiveRef ? (
                            <code className="rounded-item bg-muted px-1.5">{x.archiveRef}</code>
                          ) : null}
                          {x.notes ? (
                            <span className="text-muted-foreground">{x.notes}</span>
                          ) : null}
                          {x.error ? (
                            <span className="font-semibold text-danger">{x.error}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
