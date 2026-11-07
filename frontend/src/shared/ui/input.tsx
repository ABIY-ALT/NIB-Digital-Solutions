'use client';

import { cva } from 'class-variance-authority';
import { Label as LabelPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { useUiSettings, type FieldAppearance } from './ui-settings';

/**
 * Text fields come in three appearances: outline (bordered box), filled
 * (tinted box, no border) and underline (bottom line only). The product picks
 * one in app.config `ui.controls.field`; a single field can pin its own:
 *
 *   <Input />                          product appearance
 *   <Input appearance="filled" />      this field only
 *
 * Select and RecordPicker share these styles, so a form always looks uniform.
 */
export type { FieldAppearance };

/** Styles for a focusable field element (input, textarea, select trigger). */
export const fieldVariants = cva(
  'w-full min-w-0 text-sm text-foreground transition-[border-color,box-shadow,background-color] outline-none placeholder:text-subtle-foreground disabled:cursor-not-allowed disabled:opacity-70 aria-invalid:border-danger',
  {
    variants: {
      appearance: {
        outline:
          'rounded-control border border-input bg-surface px-3 hover:border-border-strong focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary disabled:bg-muted aria-invalid:ring-danger/40',
        filled:
          'rounded-control border border-transparent bg-muted px-3 hover:bg-border focus-visible:border-primary focus-visible:bg-surface focus-visible:hover:bg-surface disabled:hover:bg-muted focus-visible:ring-1 focus-visible:ring-primary aria-invalid:ring-danger/40',
        underline:
          'border-b border-input bg-transparent px-1 hover:border-border-strong focus-visible:border-primary focus-visible:shadow-[0_1px_0_0_var(--brand-primary)] disabled:border-dashed',
      },
    },
    defaultVariants: { appearance: 'outline' },
  },
);

/**
 * The same looks for a wrapper that contains the focusable element (record
 * picker, custom composite fields). `open` keeps the focus look while a popup
 * belonging to the field is open.
 */
export const fieldShellVariants = cva(
  'text-sm transition-[border-color,box-shadow,background-color]',
  {
    variants: {
      appearance: {
        outline:
          'rounded-control border border-input bg-surface hover:border-border-strong has-[:focus-visible]:border-primary has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-primary',
        filled:
          'rounded-control border border-transparent bg-muted hover:bg-border has-[:focus-visible]:border-primary has-[:focus-visible]:bg-surface has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-primary',
        underline:
          'border-b border-input bg-transparent hover:border-border-strong has-[:focus-visible]:border-primary has-[:focus-visible]:shadow-[0_1px_0_0_var(--brand-primary)]',
      },
      open: { true: '', false: '' },
      disabled: { true: 'cursor-not-allowed opacity-70', false: '' },
    },
    compoundVariants: [
      { appearance: 'outline', open: true, class: 'border-primary ring-1 ring-primary' },
      {
        appearance: 'filled',
        open: true,
        class: 'border-primary bg-surface ring-1 ring-primary hover:bg-surface',
      },
      {
        appearance: 'underline',
        open: true,
        class: 'border-primary shadow-[0_1px_0_0_var(--brand-primary)]',
      },
      { appearance: 'outline', disabled: true, class: 'bg-muted hover:border-input' },
      { appearance: 'filled', disabled: true, class: 'hover:bg-muted' },
      { appearance: 'underline', disabled: true, class: 'border-dashed hover:border-input' },
    ],
    defaultVariants: { appearance: 'outline', open: false, disabled: false },
  },
);

/** The product's field appearance, unless the control pins its own. */
export function useFieldAppearance(appearance?: FieldAppearance): FieldAppearance {
  const { controls } = useUiSettings();
  return appearance ?? controls.field;
}

export interface InputProps extends ComponentProps<'input'> {
  /** Overrides the product's field appearance (app.config `ui.controls.field`). */
  appearance?: FieldAppearance;
  /** Icon or text rendered inside the start of the field. */
  startAdornment?: ReactNode;
  endAdornment?: ReactNode;
}

export function Input({
  className,
  appearance: appearanceProp,
  startAdornment,
  endAdornment,
  ...props
}: Readonly<InputProps>) {
  const appearance = useFieldAppearance(appearanceProp);
  if (!startAdornment && !endAdornment) {
    return (
      <input
        data-slot="input"
        className={cn(fieldVariants({ appearance }), 'h-control', className)}
        {...props}
      />
    );
  }
  return (
    <div className="relative flex items-center">
      {startAdornment ? (
        <span className="pointer-events-none absolute start-2.5 flex text-subtle-foreground [&_svg]:size-4">
          {startAdornment}
        </span>
      ) : null}
      <input
        data-slot="input"
        className={cn(
          fieldVariants({ appearance }),
          'h-control',
          startAdornment && 'ps-8',
          endAdornment && 'pe-9',
          className,
        )}
        {...props}
      />
      {endAdornment ? <span className="absolute end-1.5 flex">{endAdornment}</span> : null}
    </div>
  );
}

export interface TextareaProps extends ComponentProps<'textarea'> {
  /** Overrides the product's field appearance (app.config `ui.controls.field`). */
  appearance?: FieldAppearance;
}

export function Textarea({
  className,
  appearance: appearanceProp,
  ...props
}: Readonly<TextareaProps>) {
  const appearance = useFieldAppearance(appearanceProp);
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldVariants({ appearance }), 'min-h-20 py-2', className)}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'text-sm font-semibold text-foreground select-none peer-disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}
