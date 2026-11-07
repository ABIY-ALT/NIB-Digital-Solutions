'use client';

import type { ComponentProps, ReactNode } from 'react';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { cn } from '@/shared/lib/cn';
import { Checkbox, RadioGroup, RadioGroupItem, Select, Switch, type SelectOption } from './choice';
import { FormField } from './form';
import { Input, Label, Textarea } from './input';
import { OtpInput } from './otp-input';

/**
 * Typed form fields bound to React Hook Form. Every field inherits label,
 * description, required marker, error display and ARIA wiring from FormField,
 * so forms stay declarative:
 *
 *   <SelectField<Values> name="status" label={t('status')} options={statusOptions} />
 *   <SwitchField<Values> name="notify" label={t('notify')} description={t('notifyHint')} />
 */
export interface FieldBaseProps<T extends FieldValues> {
  name: FieldPath<T>;
  label?: ReactNode;
  description?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export function TextareaField<T extends FieldValues>({
  name,
  label,
  description,
  required,
  disabled,
  className,
  ...props
}: FieldBaseProps<T> & Omit<ComponentProps<'textarea'>, 'name' | 'value' | 'onChange'>) {
  return (
    <FormField<T>
      name={name}
      label={label}
      description={description}
      required={required}
      className={className}
      render={({ field, aria }) => (
        <Textarea
          {...props}
          {...aria}
          disabled={disabled}
          name={field.name}
          ref={field.ref}
          value={(field.value as string) ?? ''}
          onChange={field.onChange}
          onBlur={field.onBlur}
        />
      )}
    />
  );
}

/** Number input that stores a number (or null when empty) — no string/number drift in schemas. */
export function NumberField<T extends FieldValues>({
  name,
  label,
  description,
  required,
  disabled,
  className,
  ...props
}: FieldBaseProps<T> & Omit<ComponentProps<typeof Input>, 'name' | 'value' | 'onChange' | 'type'>) {
  return (
    <FormField<T>
      name={name}
      label={label}
      description={description}
      required={required}
      className={className}
      render={({ field, aria }) => (
        <Input
          {...props}
          {...aria}
          type="number"
          inputMode="decimal"
          disabled={disabled}
          name={field.name}
          ref={field.ref}
          value={field.value === null || field.value === undefined ? '' : String(field.value)}
          onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.valueAsNumber)}
          onBlur={field.onBlur}
          className="tabular"
        />
      )}
    />
  );
}

export function SelectField<T extends FieldValues>({
  name,
  label,
  description,
  required,
  disabled,
  className,
  options,
  placeholder,
}: FieldBaseProps<T> & { options: SelectOption[]; placeholder?: string }) {
  return (
    <FormField<T>
      name={name}
      label={label}
      description={description}
      required={required}
      className={className}
      render={({ field, aria }) => (
        <Select
          id={aria.id}
          aria-invalid={aria['aria-invalid']}
          options={options}
          placeholder={placeholder}
          disabled={disabled}
          name={field.name}
          value={(field.value as string) || undefined}
          onValueChange={(v) => {
            field.onChange(v);
            field.onBlur();
          }}
        />
      )}
    />
  );
}

export function CheckboxField<T extends FieldValues>({
  name,
  label,
  description,
  disabled,
  className,
}: Readonly<Omit<FieldBaseProps<T>, 'required'>>) {
  return (
    <FormField<T>
      name={name}
      label={label}
      description={description}
      className={className}
      horizontal
      render={({ field, aria }) => (
        <Checkbox
          {...aria}
          ref={field.ref}
          disabled={disabled}
          checked={field.value === true}
          onCheckedChange={(v) => field.onChange(v === true)}
          onBlur={field.onBlur}
        />
      )}
    />
  );
}

/** Setting-style toggle: label and description on the left, switch on the right. */
export function SwitchField<T extends FieldValues>({
  name,
  label,
  description,
  disabled,
  className,
}: Readonly<Omit<FieldBaseProps<T>, 'required'>>) {
  return (
    <FormField<T>
      name={name}
      className={className}
      render={({ field, aria }) => (
        <div className="flex items-start justify-between gap-4 rounded-control border border-border px-3.5 py-3">
          <div className="min-w-0">
            <Label htmlFor={aria.id}>{label}</Label>
            {description ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <Switch
            {...aria}
            ref={field.ref}
            disabled={disabled}
            checked={field.value === true}
            onCheckedChange={field.onChange}
            onBlur={field.onBlur}
          />
        </div>
      )}
    />
  );
}

export function RadioGroupField<T extends FieldValues>({
  name,
  label,
  description,
  required,
  disabled,
  className,
  options,
  orientation = 'vertical',
}: FieldBaseProps<T> & {
  options: Array<SelectOption & { description?: string }>;
  orientation?: 'vertical' | 'horizontal';
}) {
  return (
    <FormField<T>
      name={name}
      label={label}
      description={description}
      required={required}
      className={className}
      render={({ field, aria }) => (
        <RadioGroup
          aria-labelledby={undefined}
          aria-invalid={aria['aria-invalid']}
          aria-describedby={aria['aria-describedby']}
          disabled={disabled}
          value={(field.value as string) ?? ''}
          onValueChange={field.onChange}
          orientation={orientation}
          className={cn('gap-2', orientation === 'horizontal' ? 'flex flex-wrap gap-x-5' : 'grid')}
        >
          {options.map((o) => {
            const optionId = `${aria.id}-${o.value}`;
            return (
              <div key={o.value} className="flex items-start gap-2">
                <RadioGroupItem
                  id={optionId}
                  value={o.value}
                  disabled={o.disabled}
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor={optionId} className="font-normal">
                    {o.label}
                  </Label>
                  {o.description ? (
                    <p className="text-xs text-muted-foreground">{o.description}</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </RadioGroup>
      )}
    />
  );
}

export function OtpField<T extends FieldValues>({
  name,
  label,
  description,
  disabled,
  className,
  length = 6,
  onComplete,
}: Omit<FieldBaseProps<T>, 'required'> & { length?: number; onComplete?: (code: string) => void }) {
  return (
    <FormField<T>
      name={name}
      label={label}
      description={description}
      className={className}
      render={({ field, fieldState }) => (
        <OtpInput
          value={(field.value as string) ?? ''}
          onChange={field.onChange}
          length={length}
          disabled={disabled}
          invalid={!!fieldState.error}
          onComplete={onComplete}
          aria-label={typeof label === 'string' ? label : undefined}
        />
      )}
    />
  );
}
