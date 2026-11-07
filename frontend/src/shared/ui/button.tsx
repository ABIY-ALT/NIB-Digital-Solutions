'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/shared/lib/cn';
import { Spinner } from './spinner';
import { useUiSettings } from './ui-settings';

/**
 * `variant` is what the button means (primary action, danger, quiet…);
 * `appearance` is how the coloured ones (primary, secondary, danger) are drawn:
 * solid, soft (tinted), outline or elevated (solid with a shadow). The product
 * picks one appearance in app.config `ui.controls.button`; a single button can
 * pin its own:
 *
 *   <Button>Save</Button>                          product appearance
 *   <Button appearance="soft">Save</Button>        this button only
 *   <Button variant="danger" appearance="outline">Delete</Button>
 */
export type { ButtonAppearance } from './ui-settings';

const ELEVATED = 'shadow-raised hover:shadow-overlay active:shadow-card';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control text-sm font-semibold transition-[color,background-color,border-color,box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Coloured variants: styled per appearance in compoundVariants below.
        primary: '',
        secondary: '',
        danger: '',
        outline: 'border border-border-strong bg-surface text-foreground hover:bg-hover',
        ghost: 'text-foreground hover:bg-hover',
        subtle: 'bg-muted text-foreground hover:bg-border',
        link: 'h-auto px-0 text-primary-text underline-offset-4 hover:underline',
      },
      appearance: { solid: '', soft: '', outline: '', elevated: '' },
      size: {
        sm: 'h-7 px-2.5 text-xs',
        md: 'h-control px-3.5',
        lg: 'h-10 px-5',
        icon: 'size-control',
        'icon-sm': 'size-7',
      },
    },
    compoundVariants: [
      {
        variant: 'primary',
        appearance: ['solid', 'elevated'],
        class: 'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active',
      },
      {
        variant: 'secondary',
        appearance: ['solid', 'elevated'],
        class: 'bg-secondary text-secondary-foreground hover:bg-secondary-hover',
      },
      {
        variant: 'danger',
        appearance: ['solid', 'elevated'],
        class: 'bg-danger text-danger-foreground hover:bg-danger/90',
      },
      { variant: ['primary', 'secondary', 'danger'], appearance: 'elevated', class: ELEVATED },
      {
        variant: 'primary',
        appearance: 'soft',
        class: 'bg-primary-soft text-primary-text hover:bg-primary/30 active:bg-primary/40',
      },
      {
        variant: 'secondary',
        appearance: 'soft',
        class: 'bg-secondary-soft text-secondary hover:bg-secondary/20 active:bg-secondary/30',
      },
      {
        variant: 'danger',
        appearance: 'soft',
        class: 'bg-danger-soft text-danger hover:bg-danger/20 active:bg-danger/30',
      },
      {
        variant: 'primary',
        appearance: 'outline',
        class:
          'border border-primary text-primary-text hover:bg-primary-softer active:bg-primary-soft',
      },
      {
        variant: 'secondary',
        appearance: 'outline',
        class: 'border border-secondary text-secondary hover:bg-secondary-soft',
      },
      {
        variant: 'danger',
        appearance: 'outline',
        class: 'border border-danger text-danger hover:bg-danger-soft',
      },
    ],
    defaultVariants: { variant: 'primary', appearance: 'solid', size: 'md' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export function Button({
  className,
  variant,
  appearance: appearanceProp,
  size,
  asChild,
  loading,
  disabled,
  children,
  ...props
}: Readonly<ButtonProps>) {
  const { controls } = useUiSettings();
  const appearance = appearanceProp ?? controls.button;
  // Slot requires exactly one child element: render the child as-is (no spinner) when asChild.
  if (asChild) {
    return (
      <Slot.Root
        data-slot="button"
        className={cn(buttonVariants({ variant, appearance, size }), className)}
        {...props}
      >
        {children}
      </Slot.Root>
    );
  }
  const Comp = 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, appearance, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner size="sm" tone="current" decorative /> : null}
      {children}
    </Comp>
  );
}
