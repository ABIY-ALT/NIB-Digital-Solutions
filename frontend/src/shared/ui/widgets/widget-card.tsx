'use client';

import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../card';

/**
 * Card chrome for a dashboard widget: title, description, a header slot
 * (badge, link, menu, control), body and optional footer.
 *
 *   <WidgetCard title="Revenue" description="Won vs target" action={<Badge>…</Badge>}>
 *     <TrendChart … />
 *   </WidgetCard>
 *
 * `flush` removes the body padding for edge-to-edge lists and tables.
 */
export function WidgetCard({
  title,
  description,
  action,
  footer,
  flush = false,
  className,
  contentClassName,
  children,
}: Readonly<{
  title: ReactNode;
  description?: ReactNode;
  /** Header slot on the end side. */
  action?: ReactNode;
  footer?: ReactNode;
  flush?: boolean;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}>) {
  return (
    <Card className={cn('flex min-w-0 flex-col', className)}>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </CardHeader>
      <CardContent className={cn('flex-1', flush && 'p-0', contentClassName)}>
        {children}
      </CardContent>
      {footer ? <CardFooter className="justify-start text-xs">{footer}</CardFooter> : null}
    </Card>
  );
}
