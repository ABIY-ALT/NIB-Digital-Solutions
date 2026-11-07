'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';

/**
 * Lists the options of a union type. The record must name every member, so
 * the gallery fails to compile when a component gains an option it does not show.
 */
export const optionsOf = <T extends string>(record: Record<T, true>): T[] =>
  Object.keys(record) as T[];

/** One group of options: what it is, and where it is set (config key and/or prop). */
export function Section({
  id,
  config,
  prop,
  children,
}: Readonly<{
  /** Key under componentGallery.sections. */
  id: string;
  /** app.config path that sets the product default, e.g. "ui.controls.button". */
  config?: string;
  /** Prop that pins one control, e.g. "appearance". */
  prop?: string;
  children: ReactNode;
}>) {
  const t = useTranslations('componentGallery.sections');
  return (
    <Card>
      <CardHeader className="flex-wrap">
        <div className="min-w-0">
          <CardTitle>{t(`${id}.title`)}</CardTitle>
          <CardDescription>{t(`${id}.description`)}</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {config ? <Source>{config}</Source> : null}
          {prop ? <Source>{prop}</Source> : null}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Source({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <code className="rounded-item border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
      {children}
    </code>
  );
}

/** Grid of specimens; `min` is the narrowest a tile may get. */
export function SpecimenGrid({
  min = '9rem',
  className,
  children,
}: Readonly<{
  min?: string;
  className?: string;
  children: ReactNode;
}>) {
  return (
    <div
      className={cn('grid gap-3', className)}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}, 100%), 1fr))` }}
    >
      {children}
    </div>
  );
}

/** One option: the live component above the value to write in code or config. */
export function Specimen({
  name,
  isDefault,
  align = 'center',
  className,
  children,
}: Readonly<{
  /** The option's value, exactly as written in code. */
  name: string;
  /** Marks the value the product currently uses. */
  isDefault?: boolean;
  align?: 'center' | 'stretch';
  className?: string;
  children: ReactNode;
}>) {
  const t = useTranslations('componentGallery');
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col rounded-control border bg-surface',
        isDefault ? 'border-primary' : 'border-border',
        className,
      )}
    >
      <div
        className={cn(
          'flex min-h-20 flex-1 p-4',
          align === 'center'
            ? 'flex-wrap items-center justify-center gap-2'
            : 'flex-col justify-center gap-3',
        )}
      >
        {children}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-border bg-surface-muted px-3 py-1.5">
        <code className="font-mono text-xs text-foreground">{name}</code>
        {isDefault ? <Badge tone="primary">{t('productDefault')}</Badge> : null}
      </div>
    </div>
  );
}
