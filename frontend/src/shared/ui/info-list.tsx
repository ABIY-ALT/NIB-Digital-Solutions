'use client';

import { Check, Copy } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface InfoItem {
  id: string;
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  /** Text copied by the copy button (enables it). */
  copy?: string;
  /** Mono font for identifiers. */
  mono?: boolean;
  /** Small trailing hint, e.g. "Verified" or "Managed by your administrator". */
  hint?: ReactNode;
}

/**
 * Label / value rows with icons (profile "About" and "Contacts" idiom); also
 * fits detail drawers and summaries. Optional per-row copy button.
 */
export function InfoList({
  items,
  copyLabel = 'Copy',
  copiedLabel = 'Copied',
  layout = 'rows',
  className,
}: Readonly<{
  items: InfoItem[];
  copyLabel?: string;
  copiedLabel?: string;
  /** rows: icon · label · value on one line; stacked: label above value. */
  layout?: 'rows' | 'stacked';
  className?: string;
}>) {
  return (
    <dl className={cn('space-y-3', className)}>
      {items.map((item) => (
        <div
          key={item.id}
          className={cn('flex min-w-0 gap-3', layout === 'rows' ? 'items-center' : 'items-start')}
        >
          {item.icon ? (
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-control bg-muted text-muted-foreground [&_svg]:size-4"
              aria-hidden
            >
              {item.icon}
            </span>
          ) : null}
          <div
            className={cn(
              'min-w-0 flex-1',
              layout === 'rows' && 'flex flex-wrap items-baseline justify-between gap-x-3',
            )}
          >
            <dt className="text-xs font-semibold text-muted-foreground">{item.label}</dt>
            <dd
              className={cn(
                'flex min-w-0 items-center gap-1.5 text-sm break-words',
                item.mono && 'font-mono text-[13px]',
                layout === 'stacked' && 'mt-0.5',
              )}
            >
              <span className="min-w-0">{item.value}</span>
              {item.hint ? (
                <span className="shrink-0 text-xs text-muted-foreground">{item.hint}</span>
              ) : null}
              {item.copy ? (
                <CopyButton
                  text={item.copy}
                  label={`${copyLabel} ${item.label}`}
                  done={copiedLabel}
                />
              ) : null}
            </dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

function CopyButton({
  text,
  label,
  done,
}: Readonly<{ text: string; label: string; done: string }>) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? done : label}
      title={copied ? done : label}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="shrink-0 rounded-item p-0.5 text-subtle-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
    </button>
  );
}
