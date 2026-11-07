'use client';

import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface TagGroup {
  id: string;
  label: string;
  icon?: ReactNode;
  tags: Array<{ id: string; label: string; title?: string }>;
}

/**
 * Tags grouped by category, e.g. permissions by module, skills by area,
 * products by family. Shows `initialGroups` groups, then "show all".
 */
export function TagGroups({
  groups,
  initialGroups = 6,
  showAllLabel,
  showLessLabel,
  className,
}: Readonly<{
  groups: TagGroup[];
  initialGroups?: number;
  showAllLabel: (hidden: number) => string;
  showLessLabel: string;
  className?: string;
}>) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? groups : groups.slice(0, initialGroups);
  const hidden = groups.length - visible.length;
  return (
    <div className={className}>
      <ul className="divide-y divide-border">
        {visible.map((g) => (
          <li key={g.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-start sm:gap-4">
            <div className="flex w-44 shrink-0 items-center gap-2 text-sm font-semibold [&_svg]:size-4 [&_svg]:text-muted-foreground">
              {g.icon}
              <span className="truncate">{g.label}</span>
              <span className="rounded-pill bg-muted px-1.5 text-[10px] leading-4 font-bold text-muted-foreground tabular">
                {g.tags.length}
              </span>
            </div>
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {g.tags.map((tag) => (
                <span
                  key={tag.id}
                  title={tag.title}
                  className="rounded-item border border-border bg-surface-muted px-1.5 py-0.5 text-xs text-foreground"
                >
                  {tag.label}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {groups.length > initialGroups ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 flex items-center gap-1 rounded-item text-xs font-semibold text-secondary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? showLessLabel : showAllLabel(hidden)}
          <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />
        </button>
      ) : null}
    </div>
  );
}
