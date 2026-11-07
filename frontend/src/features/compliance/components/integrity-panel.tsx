'use client';

import { Anchor, Copy, Fingerprint, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { usePermissions } from '@/features/auth/components/permissions-provider';
import { describeError } from '@/shared/errors/error-messages';
import { cn } from '@/shared/lib/cn';
import { formatDateTime } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Alert, Skeleton } from '@/shared/ui/feedback';
import { RelativeTime } from '@/shared/ui/relative-time';
import { toast } from '@/shared/ui/toaster';
import { useCheckpoints, useCreateAnchor, useVerifyAudit } from '../hooks/use-compliance';
import type { ComplianceOverview, IntegrityReport } from '../types';

const short = (hash: string | null) => (hash ? `${hash.slice(0, 12)}…${hash.slice(-6)}` : '—');

const NEUTRAL_LOOK = { panel: 'border-border bg-surface', badge: 'bg-muted text-muted-foreground' };

/** Icon and colours of the verification result (static class strings for Tailwind). */
const STATUS_LOOK = {
  INTACT: {
    icon: ShieldCheck,
    panel: 'border-success/40 bg-success-soft/40',
    badge: 'bg-success text-success-foreground',
  },
  BROKEN: {
    icon: ShieldAlert,
    panel: 'border-danger/40 bg-danger-soft/40',
    badge: 'bg-danger text-danger-foreground',
  },
  EMPTY: { icon: ShieldCheck, ...NEUTRAL_LOOK },
} as const;
const UNVERIFIED_LOOK = { icon: ShieldQuestion, ...NEUTRAL_LOOK };

function Stat({
  label,
  value,
  mono,
}: Readonly<{ label: string; value: React.ReactNode; mono?: boolean }>) {
  return (
    <div className="rounded-control border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-sm font-semibold tabular', mono && 'font-mono text-xs')}>
        {value}
      </p>
    </div>
  );
}

/**
 * Tamper-evidence of the audit trail: chain statistics, on-demand verification
 * (every HMAC recomputed, anchors checked) and the checkpoint history.
 */
export function IntegrityPanel({ overview: o }: Readonly<{ overview: ComplianceOverview }>) {
  const t = useTranslations('compliance.integrity');
  const te = useTranslations('errors');
  const locale = useLocale();
  const { can } = usePermissions();
  const verify = useVerifyAudit();
  const anchor = useCreateAnchor();
  const [report, setReport] = useState<IntegrityReport | null>(null);

  const status = report?.status ?? null;
  const look = status ? STATUS_LOOK[status] : UNVERIFIED_LOOK;
  const Icon = look.icon;

  return (
    <div className="space-y-4">
      <div
        className={cn('flex flex-wrap items-center gap-4 rounded-surface border p-5', look.panel)}
      >
        <span
          className={cn(
            'flex size-14 items-center justify-center rounded-full [&_svg]:size-7',
            look.badge,
          )}
        >
          <Icon aria-hidden />
        </span>
        <output className="block min-w-0 flex-1">
          <span className="block text-lg font-semibold">
            {t(`status.${status ?? 'UNVERIFIED'}`)}
          </span>
          <span className="block text-sm text-muted-foreground">
            {report
              ? t('verifiedSummary', {
                  count: report.checked,
                  ms: report.durationMs,
                  anchors: report.anchorsChecked,
                })
              : t('explain')}
          </span>
        </output>
        <div className="flex flex-wrap gap-2">
          {can('compliance:manage') ? (
            <Button
              variant="outline"
              loading={anchor.isPending}
              onClick={() =>
                anchor.mutate(undefined, {
                  onSuccess: () => toast.success(t('anchored')),
                  onError: (e) => toast.error(describeError(e, te).message),
                })
              }
            >
              <Anchor /> {t('anchor')}
            </Button>
          ) : null}
          <Button
            loading={verify.isPending}
            onClick={() =>
              verify.mutate(undefined, {
                onSuccess: (r) => {
                  setReport(r);
                  if (r.status === 'BROKEN') toast.error(t('status.BROKEN'));
                  else toast.success(t('status.INTACT'));
                },
                onError: (e) => toast.error(describeError(e, te).message),
              })
            }
          >
            <Fingerprint /> {t('verify')}
          </Button>
        </div>
      </div>

      {report?.break ? (
        <Alert tone="danger" title={t(`breaks.${report.break.reason}`)}>
          {t('breakAt', { seq: report.break.seq })}
          {report.break.id ? (
            <span className="ms-1 font-mono text-xs">({report.break.id})</span>
          ) : null}
        </Alert>
      ) : null}
      {!o.audit.keyConfigured ? <Alert tone="warning" title={t('derivedKey')} /> : null}
      {o.audit.unsealed ? (
        <Alert tone="warning" title={t('unsealed', { count: o.audit.unsealed })} />
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('stats.records')} value={o.audit.total.toLocaleString(locale)} />
        <Stat
          label={t('stats.range')}
          value={o.audit.firstSeq ? `#${o.audit.firstSeq} – #${o.audit.lastSeq}` : '—'}
        />
        <Stat
          label={t('stats.oldest')}
          value={o.audit.oldest ? formatDateTime(o.audit.oldest, locale) : '—'}
        />
        <Stat
          label={t('stats.head')}
          mono
          value={
            <span className="flex items-center gap-1.5">
              {short(o.audit.headHash)}
              {o.audit.headHash ? (
                <button
                  type="button"
                  aria-label={t('copyHash')}
                  className="rounded-item text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    void navigator.clipboard.writeText(o.audit.headHash!);
                    toast.success(t('copied'));
                  }}
                >
                  <Copy className="size-3.5" />
                </button>
              ) : null}
            </span>
          }
        />
      </div>

      <CheckpointHistory />
    </div>
  );
}

/** Anchor and purge checkpoints, newest first. */
function CheckpointHistory() {
  const t = useTranslations('compliance.integrity');
  const locale = useLocale();
  const checkpoints = useCheckpoints();

  let content: ReactNode;
  if (checkpoints.isPending) {
    content = (
      <div className="p-4">
        <Skeleton className="h-24 w-full" />
      </div>
    );
  } else if ((checkpoints.data ?? []).length === 0) {
    content = (
      <p className="p-6 text-center text-sm text-muted-foreground">{t('checkpoints.empty')}</p>
    );
  } else {
    content = (
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-start font-semibold">{t('checkpoints.kind')}</th>
            <th className="px-4 py-2 text-start font-semibold">{t('checkpoints.position')}</th>
            <th className="px-4 py-2 text-start font-semibold">{t('checkpoints.hash')}</th>
            <th className="px-4 py-2 text-end font-semibold">{t('checkpoints.records')}</th>
            <th className="px-4 py-2 text-start font-semibold">{t('checkpoints.when')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {(checkpoints.data ?? []).map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-2.5">
                <Badge tone={c.kind === 'PURGE' ? 'warning' : 'info'}>
                  {t(`checkpoints.kinds.${c.kind}`)}
                </Badge>
              </td>
              <td className="px-4 py-2.5 tabular">
                {c.fromSeq ? `#${c.fromSeq} – ` : ''}#{c.seq}
              </td>
              <td className="px-4 py-2.5 font-mono text-xs">{short(c.hash)}</td>
              <td className="px-4 py-2.5 text-end tabular">
                {c.recordCount.toLocaleString(locale)}
              </td>
              <td className="px-4 py-2.5 text-muted-foreground">
                <RelativeTime value={c.createdAt} locale={locale} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[15px]">{t('checkpoints.title')}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">{content}</CardContent>
    </Card>
  );
}
