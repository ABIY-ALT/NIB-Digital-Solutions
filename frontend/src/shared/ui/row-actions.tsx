'use client';

import { MoreVertical, RefreshCw } from 'lucide-react';
import { DropdownMenu as MenuPrimitive } from 'radix-ui';
import { Fragment, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { Button } from './button';

export interface RowAction {
  /** Stable id (React key). */
  id: string;
  label: string;
  icon?: ReactNode;
  /** Secondary line under the label (why it is disabled, what it does). */
  description?: string;
  onSelect: () => void;
  danger?: boolean;
  /** Not rendered at all (e.g. permission missing). */
  hidden?: boolean;
  /** Rendered but not selectable (e.g. system-locked). */
  disabled?: boolean;
  /** Divider above this item. */
  divider?: boolean;
}

/**
 * Per-row kebab menu (IB pattern): one ⋮ trigger per row, actions with icon,
 * label and optional description, danger actions last behind a divider.
 * Radix handles focus, keyboard navigation, collision flipping and the portal.
 */
export function RowActionsMenu({
  actions,
  label,
}: Readonly<{ actions: RowAction[]; label: string }>) {
  const visible = actions.filter((a) => !a.hidden);
  if (visible.length === 0) return null;

  return (
    <MenuPrimitive.Root modal={false}>
      <MenuPrimitive.Trigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          title={label}
          onClick={(e) => e.stopPropagation()}
          className="text-muted-foreground hover:text-foreground data-[state=open]:bg-hover data-[state=open]:text-foreground"
        >
          <MoreVertical />
        </Button>
      </MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Content
          align="end"
          sideOffset={4}
          collisionPadding={8}
          onClick={(e) => e.stopPropagation()}
          className="z-50 w-60 max-w-80 rounded-surface border border-border bg-surface p-1 shadow-[0_8px_24px_rgb(0_0_0/0.12),0_1px_3px_rgb(0_0_0/0.08)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1"
        >
          {visible.map((a, i) => (
            <Fragment key={a.id}>
              {a.divider && i > 0 ? (
                <MenuPrimitive.Separator className="my-1 h-px bg-border" />
              ) : null}
              <MenuPrimitive.Item
                disabled={a.disabled}
                onSelect={a.onSelect}
                className={cn(
                  'flex cursor-pointer items-start gap-2.5 rounded-item px-3 py-2 text-[13px] outline-none select-none transition-colors',
                  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-55',
                  '[&_svg]:mt-px [&_svg]:size-4 [&_svg]:shrink-0',
                  a.danger
                    ? 'text-danger data-[highlighted]:bg-danger-soft'
                    : 'text-foreground data-[highlighted]:bg-hover [&_svg]:text-muted-foreground',
                )}
              >
                {a.icon}
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium leading-4">{a.label}</span>
                  {a.description ? (
                    <span
                      className={cn(
                        'text-[11px] leading-4',
                        a.danger ? 'text-danger/80' : 'text-muted-foreground',
                      )}
                    >
                      {a.description}
                    </span>
                  ) : null}
                </span>
              </MenuPrimitive.Item>
            </Fragment>
          ))}
        </MenuPrimitive.Content>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}

/** Toolbar refresh control: spins and disables while a (re)fetch is in flight. */
export function RefreshButton({
  onClick,
  busy,
  label,
  busyLabel,
}: Readonly<{
  onClick: () => void;
  busy?: boolean;
  label: string;
  busyLabel: string;
}>) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
      className="h-[30px] gap-1.5 px-3"
    >
      <RefreshCw className={cn(busy && 'animate-spin')} aria-hidden />
      {busy ? busyLabel : label}
    </Button>
  );
}
