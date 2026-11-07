'use client';

import {
  Check,
  ClipboardCheck,
  KeyRound,
  LaptopMinimal,
  Lock,
  Minus,
  ShieldCheck,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useApprovalPolicy } from '@/features/approvals/hooks/use-approvals';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import type { ComplianceOverview } from '../types';

function PolicyCard({
  icon: Icon,
  title,
  children,
}: Readonly<{
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}>) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-[15px]">
          <span className="flex size-8 items-center justify-center rounded-control bg-primary-soft text-primary-text">
            <Icon className="size-4" aria-hidden />
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="divide-y divide-border text-sm">{children}</dl>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: Readonly<{ label: string; value: ReactNode }>) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-end font-semibold">{value}</dd>
    </div>
  );
}

function Flag({ on, yes, no }: Readonly<{ on: boolean; yes: string; no: string }>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1',
        on ? 'text-success' : 'text-muted-foreground',
      )}
    >
      {on ? <Check className="size-4" aria-hidden /> : <Minus className="size-4" aria-hidden />}
      {on ? yes : no}
    </span>
  );
}

/** The effective security policy (from configuration) as auditors need to see it. */
export function PoliciesPanel({ overview: o }: Readonly<{ overview: ComplianceOverview }>) {
  const t = useTranslations('compliance.policies');
  const approvals = useApprovalPolicy();
  const yes = t('on');
  const no = t('off');
  const days = (n: number) => (n > 0 ? t('days', { count: n }) : t('never'));

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <PolicyCard icon={KeyRound} title={t('password.title')}>
        <Row label={t('password.minLength')} value={t('chars', { count: o.password.minLength })} />
        <Row
          label={t('password.uppercase')}
          value={<Flag on={o.password.requireUppercase} yes={yes} no={no} />}
        />
        <Row
          label={t('password.lowercase')}
          value={<Flag on={o.password.requireLowercase} yes={yes} no={no} />}
        />
        <Row
          label={t('password.digit')}
          value={<Flag on={o.password.requireDigit} yes={yes} no={no} />}
        />
        <Row
          label={t('password.symbol')}
          value={<Flag on={o.password.requireSymbol} yes={yes} no={no} />}
        />
        <Row label={t('password.history')} value={t('lastN', { count: o.password.historyCount })} />
        <Row label={t('password.maxAge')} value={days(o.password.maxAgeDays)} />
        <Row
          label={t('password.minAge')}
          value={o.password.minAgeHours ? t('hours', { count: o.password.minAgeHours }) : no}
        />
        <Row label={t('password.warning')} value={days(o.password.expiryWarningDays)} />
        <Row
          label={t('password.firstLogin')}
          value={<Flag on={o.password.changeOnFirstLogin} yes={yes} no={no} />}
        />
      </PolicyCard>

      <PolicyCard icon={Lock} title={t('lockout.title')}>
        <Row label={t('lockout.attempts')} value={o.lockout.maxFailedAttempts} />
        <Row
          label={t('lockout.duration')}
          value={t('minutes', { count: o.lockout.lockoutMinutes })}
        />
      </PolicyCard>

      <PolicyCard icon={LaptopMinimal} title={t('session.title')}>
        <Row
          label={t('session.idle')}
          value={t('minutes', { count: o.session.idleTimeoutMinutes })}
        />
        <Row label={t('session.absolute')} value={t('hours', { count: o.session.absoluteHours })} />
        <Row
          label={t('session.concurrent')}
          value={o.session.maxConcurrent ? o.session.maxConcurrent : t('unlimited')}
        />
        <Row
          label={t('session.newDevice')}
          value={<Flag on={o.session.newDeviceAlerts} yes={yes} no={no} />}
        />
      </PolicyCard>

      <PolicyCard icon={ShieldCheck} title={t('mfa.title')}>
        <Row
          label={t('mfa.requiredFor')}
          value={
            o.mfa.requiredRoles.length ? (
              <span className="flex flex-wrap justify-end gap-1">
                {o.mfa.requiredRoles.map((r) => (
                  <Badge key={r} tone="secondary">
                    {r}
                  </Badge>
                ))}
              </span>
            ) : (
              t('mfa.optional')
            )
          }
        />
      </PolicyCard>

      <PolicyCard icon={ClipboardCheck} title={t('approvals.title')}>
        {(approvals.data ?? []).map((a) => (
          <Row
            key={a.action}
            label={a.action}
            value={
              a.required ? (
                <Badge tone="warning">{t('approvals.fourEyes')}</Badge>
              ) : (
                <span className="font-normal text-muted-foreground">{t('approvals.direct')}</span>
              )
            }
          />
        ))}
      </PolicyCard>

      <PolicyCard icon={Timer} title={t('retention.title')}>
        {o.retention.policies.map((p) => (
          <Row
            key={p.id}
            label={p.dataset}
            value={t('retention.keep', { period: formatPeriod(p.retentionDays, t) })}
          />
        ))}
        <Row
          label={t('retention.schedule')}
          value={o.retention.enabled ? t('hours', { count: o.retention.intervalHours }) : no}
        />
      </PolicyCard>
    </div>
  );
}

/** 2555 days → "7 years", 180 → "6 months", 30 → "30 days". */
export function formatPeriod(
  days: number,
  t: (key: string, values?: Record<string, number>) => string,
): string {
  if (days >= 365 && days % 365 <= 5) return t('years', { count: Math.round(days / 365) });
  if (days >= 60 && days % 30 <= 2) return t('months', { count: Math.round(days / 30) });
  return t('days', { count: days });
}
