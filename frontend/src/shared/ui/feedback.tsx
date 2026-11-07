import { AlertTriangle, CheckCircle2, Info, Inbox, ShieldAlert, XCircle } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/** Loading, skeleton, alert, empty and error states. */

/** Kept for existing imports: the loading kit lives in ./spinner. */
export { Spinner } from './spinner';

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-control bg-muted', className)}
      {...props}
    />
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-5">
      <output className="sr-only">Loading</output>
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-80" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-surface" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-surface" />
    </div>
  );
}

const alertTones = {
  // IB callouts: light fill with a 3px leading bar; "info" uses the brand gold.
  info: { cls: 'border-primary bg-primary-softer text-primary-text', Icon: Info },
  success: { cls: 'border-success bg-success-soft text-success', Icon: CheckCircle2 },
  warning: { cls: 'border-warning bg-warning-soft text-warning', Icon: AlertTriangle },
  danger: { cls: 'border-danger bg-danger-soft text-danger', Icon: XCircle },
} as const;

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: Readonly<{
  tone?: keyof typeof alertTones;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}>) {
  const { cls, Icon } = alertTones[tone];
  // Problems interrupt (alert); other notes are announced politely, like a status.
  const urgent = tone === 'danger' || tone === 'warning';
  return (
    <div
      role={urgent ? 'alert' : undefined}
      aria-live={urgent ? undefined : 'polite'}
      aria-atomic={urgent ? undefined : true}
      className={cn('flex gap-3 rounded-control border-s-[3px] px-3.5 py-3', cls, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-sm text-foreground">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? (
          <div className={cn(title && 'mt-0.5', 'text-muted-foreground')}>{children}</div>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: Readonly<{
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}>) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-6 py-12 text-center',
        className,
      )}
    >
      <div className="mb-1 text-subtle-foreground [&_svg]:size-12 [&_svg]:stroke-[1.25]">
        {icon ?? <Inbox />}
      </div>
      <p className="text-base font-semibold">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/** Error display with the correlation id so support can trace it in the logs. */
export function ErrorState({
  title,
  description,
  correlationId,
  referenceLabel = 'Reference',
  action,
  variant = 'error',
  className,
}: Readonly<{
  title: ReactNode;
  description?: ReactNode;
  correlationId?: string | null;
  referenceLabel?: string;
  action?: ReactNode;
  variant?: 'error' | 'forbidden';
  className?: string;
}>) {
  const Icon = variant === 'forbidden' ? ShieldAlert : XCircle;
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-6 py-12 text-center',
        className,
      )}
    >
      <Icon
        className={cn(
          'mb-1 size-12 stroke-[1.25]',
          variant === 'forbidden' ? 'text-warning' : 'text-danger',
        )}
        aria-hidden
      />
      <p className="text-base font-semibold">{title}</p>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {correlationId ? (
        <p className="mt-1 text-xs text-subtle-foreground">
          {referenceLabel}:{' '}
          <code className="rounded-item bg-muted px-1 py-0.5 font-mono text-[11px] select-all">
            {correlationId}
          </code>
        </p>
      ) : null}
      {action ? <div className="mt-3 flex gap-2">{action}</div> : null}
    </div>
  );
}
