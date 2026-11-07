import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/** Page title bar: title, description and primary actions (IB page header pattern). */
export function PageHeader({
  title,
  description,
  actions,
  icon,
  className,
}: Readonly<{
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
}>) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-center justify-between gap-4', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {icon ? (
          <div className="flex size-9 items-center justify-center rounded-control bg-primary-soft text-primary-text [&_svg]:size-5">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-tight">{title}</h1>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
