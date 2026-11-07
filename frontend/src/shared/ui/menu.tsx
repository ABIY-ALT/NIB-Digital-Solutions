'use client';

import {
  Avatar as AvatarPrimitive,
  DropdownMenu as MenuPrimitive,
  Tabs as TabsPrimitive,
  Tooltip as TooltipPrimitive,
} from 'radix-ui';
import { Check, ChevronRight } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { initials } from '@/shared/lib/format';

/**
 * Dropdown menu (items, labels, separators, submenus, radio choices, switches,
 * shortcuts), tooltip, avatar and tabs.
 */

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;
export const DropdownMenuGroup = MenuPrimitive.Group;
/** Unstyled, focusable menu item for custom layouts (cards, callouts). */
export const DropdownMenuItemPrimitive = MenuPrimitive.Item;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-48 overflow-hidden rounded-control border border-border bg-surface p-1 shadow-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0',
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  destructive,
  ...props
}: ComponentProps<typeof MenuPrimitive.Item> & { destructive?: boolean }) {
  return (
    <MenuPrimitive.Item
      className={cn(
        'flex cursor-default items-center gap-2 rounded-item px-2 py-1.5 text-sm outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-hover [&_svg]:size-4 [&_svg]:text-muted-foreground',
        destructive && 'text-danger [&_svg]:text-danger',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Label>) {
  return (
    <MenuPrimitive.Label
      className={cn('px-2 py-1.5 text-xs font-semibold text-muted-foreground', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Separator>) {
  return (
    <MenuPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
  );
}

// ── Advanced menu parts (submenus, choices, toggles, shortcuts) ─────────────

const itemBase =
  'relative flex cursor-default items-center gap-2 rounded-item px-2 py-1.5 text-sm outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-hover [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground';

/** Keyboard hint at the end of an item, e.g. <DropdownMenuShortcut>Ctrl K</DropdownMenuShortcut>. */
export function DropdownMenuShortcut({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'ms-auto ps-3 font-sans text-[11px] tracking-wide text-subtle-foreground',
        className,
      )}
      {...props}
    />
  );
}

export const DropdownMenuSub = MenuPrimitive.Sub;
export const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;

/** Opens a nested menu (e.g. Appearance ›). `hint` shows the current value before the chevron. */
export function DropdownMenuSubTrigger({
  className,
  hint,
  children,
  ...props
}: ComponentProps<typeof MenuPrimitive.SubTrigger> & { hint?: ReactNode }) {
  return (
    <MenuPrimitive.SubTrigger
      className={cn(itemBase, 'data-[state=open]:bg-hover', className)}
      {...props}
    >
      {children}
      <span className="ms-auto flex items-center gap-1 ps-3 text-xs text-subtle-foreground">
        {hint}
        <ChevronRight className="size-3.5 rtl:rotate-180" aria-hidden />
      </span>
    </MenuPrimitive.SubTrigger>
  );
}

export function DropdownMenuSubContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof MenuPrimitive.SubContent>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.SubContent
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-44 overflow-hidden rounded-control border border-border bg-surface p-1 shadow-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0',
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}

/** One option of a DropdownMenuRadioGroup; the chosen one shows a check. */
export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof MenuPrimitive.RadioItem>) {
  return (
    <MenuPrimitive.RadioItem className={cn(itemBase, 'pe-8', className)} {...props}>
      {children}
      <MenuPrimitive.ItemIndicator className="absolute end-2 flex">
        <Check className="text-primary-text!" aria-hidden />
      </MenuPrimitive.ItemIndicator>
    </MenuPrimitive.RadioItem>
  );
}

/** On/off item rendered as a small switch (keeps the menu open). */
export function DropdownMenuSwitchItem({
  className,
  children,
  checked,
  ...props
}: ComponentProps<typeof MenuPrimitive.CheckboxItem>) {
  return (
    <MenuPrimitive.CheckboxItem
      {...props}
      checked={checked}
      className={cn(itemBase, className)}
      onSelect={(e) => {
        e.preventDefault(); // keep the menu open while toggling
        props.onSelect?.(e);
      }}
    >
      {children}
      <span
        aria-hidden
        className={cn(
          'ms-auto inline-flex h-4 w-7 shrink-0 items-center rounded-pill p-0.5 transition-colors',
          checked === true ? 'bg-primary' : 'bg-border-strong',
        )}
      >
        <span
          className={cn(
            'size-3 rounded-full bg-white shadow-raised transition-transform',
            checked === true && 'translate-x-3 rtl:-translate-x-3',
          )}
        />
      </span>
    </MenuPrimitive.CheckboxItem>
  );
}

export function TooltipProvider({ children }: Readonly<{ children: ReactNode }>) {
  return <TooltipPrimitive.Provider delayDuration={300}>{children}</TooltipPrimitive.Provider>;
}

export function Tooltip({
  content,
  children,
  side = 'top',
}: Readonly<{
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}>) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-xs rounded-control bg-foreground px-2 py-1 text-xs text-background shadow-raised data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/**
 * Photo, or initials on a tinted background:
 *   soft  (default) pale brand tint with brand-coloured initials — calm in lists and headers
 *   solid gold → brown brand gradient with white initials — for emphasis
 */
export type AvatarVariant = 'soft' | 'solid';

const AVATAR_VARIANT: Record<AvatarVariant, string> = {
  soft: 'bg-primary-softer text-primary-text ring-1 ring-inset ring-primary/20',
  solid: 'avatar-brand',
};

export function Avatar({
  name,
  src,
  size = 32,
  variant = 'soft',
  className,
}: Readonly<{
  name: string;
  src?: string | null;
  size?: number;
  variant?: AvatarVariant;
  className?: string;
}>) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        AVATAR_VARIANT[variant],
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
    >
      {src ? (
        <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" />
      ) : null}
      <AvatarPrimitive.Fallback className="font-semibold" aria-label={name}>
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List className={cn('flex gap-1 border-b border-border', className)} {...props} />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        '-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:border-primary data-[state=active]:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('pt-4 outline-none', className)} {...props} />;
}
