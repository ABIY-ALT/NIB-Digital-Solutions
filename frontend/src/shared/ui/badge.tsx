import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/shared/lib/cn';

export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-2 py-0.5 text-xs font-semibold leading-4',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-muted text-muted-foreground',
        primary: 'border-transparent bg-primary-soft text-primary-text',
        secondary: 'border-transparent bg-secondary-soft text-secondary',
        success: 'border-transparent bg-success-soft text-success',
        warning: 'border-transparent bg-warning-soft text-warning',
        danger: 'border-transparent bg-danger-soft text-danger',
        info: 'border-transparent bg-info-soft text-info',
        outline: 'border-border-strong bg-transparent text-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export interface BadgeProps extends ComponentProps<'span'>, VariantProps<typeof badgeVariants> {
  /** Shows a leading status dot. */
  dot?: boolean;
}

export function Badge({ className, tone, dot, children, ...props }: Readonly<BadgeProps>) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}

/** Tag: a removable/neutral label (e.g. roles, filters). */
export function Tag({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-control border border-border bg-surface-muted px-1.5 py-0.5 text-xs font-medium text-foreground',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Maps a domain status to a colour-coded badge, e.g.
 *   <StatusBadge status="ACTIVE" map={{ ACTIVE: 'success', LOCKED: 'warning' }} label="Active" />
 */
export function StatusBadge({
  status,
  map,
  label,
  className,
}: Readonly<{
  status: string;
  map: Record<string, BadgeTone>;
  label?: string;
  className?: string;
}>) {
  return (
    <Badge tone={map[status] ?? 'neutral'} dot className={className}>
      {label ?? status}
    </Badge>
  );
}
