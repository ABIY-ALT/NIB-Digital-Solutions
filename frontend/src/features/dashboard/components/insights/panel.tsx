'use client';

import type { ReactNode } from 'react';

/** Card chrome shared by the insight tabs (the shared dashboard widget card). */
export { WidgetCard as Panel } from '@/shared/ui/widgets';

export function Gauge({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {children}
      <span className="max-w-28 text-[11px] font-medium text-muted-foreground">{label}</span>
    </div>
  );
}
