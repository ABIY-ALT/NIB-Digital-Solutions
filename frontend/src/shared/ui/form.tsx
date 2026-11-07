'use client';

import { AlertCircle } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import {
  FormProvider,
  useController,
  useFormContext,
  type ControllerFieldState,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
  type UseFormReturn,
} from 'react-hook-form';
import { isApiClientError } from '@/shared/errors/api-client-error';
import { cn } from '@/shared/lib/cn';
import { Button, type ButtonProps } from './button';
import { useFormSurface } from './form-surface';
import { Input, Label, type InputProps } from './input';

/**
 * Form kit (React Hook Form + Zod). Handles validation display, submission
 * state and mapping of backend errors (field issues → fields, everything else →
 * a form-level alert carrying the correlation id) automatically.
 *
 *   const form = useForm({ resolver: zodResolver(schema), defaultValues });
 *   <Form form={form} onSubmit={save}>
 *     <TextField name="email" label="Email" />
 *     <FormRootError />
 *     <SubmitButton>Save</SubmitButton>
 *   </Form>
 */

export interface ServerErrorOptions {
  /** Localises an issue by its `code` (e.g. password policy rule ids); fallback = server text. */
  translate?: (issue: { field: string; message: string; code?: string }) => string | undefined;
}

/**
 * Pushes an API error into the form: field issues onto fields (several issues
 * on one field are joined), the rest onto `root.server`.
 */
export function applyServerError<T extends FieldValues, TOut = T>(
  form: UseFormReturn<T, unknown, TOut>,
  error: unknown,
  fallbackMessage = 'Something went wrong. Please try again.',
  options: ServerErrorOptions = {},
): void {
  if (isApiClientError(error)) {
    let mapped = false;
    const byField = new Map<string, string[]>();
    for (const issue of error.fieldIssues) {
      if (issue.field && issue.field !== '(root)' && issue.field in form.getValues()) {
        const text = options.translate?.(issue) ?? issue.message;
        byField.set(issue.field, [...(byField.get(issue.field) ?? []), text]);
      }
    }
    for (const [field, messages] of byField) {
      form.setError(field as FieldPath<T>, { type: 'server', message: messages.join(' · ') });
      mapped = true;
    }
    if (!mapped || error.code !== 'VALIDATION_FAILED') {
      // The reference travels in the message, after a NUL (FormRootError splits it off).
      const reference = error.correlationId ? `\u0000${error.correlationId}` : '';
      form.setError('root.server' as FieldPath<T>, {
        type: error.code,
        message: `${error.message}${reference}`,
      });
    }
    return;
  }
  form.setError('root.server' as FieldPath<T>, { type: 'UNKNOWN_ERROR', message: fallbackMessage });
}

export function Form<T extends FieldValues, TOut extends FieldValues = T>({
  form,
  onSubmit,
  children,
  className,
  errorMessage,
  translateIssue,
}: Readonly<{
  form: UseFormReturn<T, unknown, TOut>;
  /** Receives the schema OUTPUT (parsed/transformed values); a returned promise is awaited. */
  onSubmit: (values: TOut) => unknown;
  children: ReactNode;
  className?: string;
  /** Generic message for unexpected failures (translated by the caller). */
  errorMessage?: string;
  /** Localises server field issues by code (e.g. usePasswordIssueTranslator()). */
  translateIssue?: NonNullable<ServerErrorOptions['translate']>;
}>) {
  return (
    <FormProvider {...form}>
      {/* POST, though the browser never submits it while the app runs (handleSubmit
          prevents that): before hydration, or without JavaScript, the default GET
          would put every field, passwords included, in the URL. */}
      <form
        method="post"
        noValidate
        className={cn('space-y-4', className)}
        onSubmit={form.handleSubmit(async (values) => {
          form.clearErrors('root.server' as FieldPath<T>);
          try {
            await onSubmit(values);
          } catch (error) {
            applyServerError(form, error, errorMessage, { translate: translateIssue });
          }
        })}
      >
        {children}
      </form>
    </FormProvider>
  );
}

/**
 * Responsive field grid. Columns follow the width of the CONTAINER (CSS
 * container queries), not the viewport, so one form lays out correctly in a
 * small dialog, a wide dialog, a drawer or a full page. `columns` is the most
 * it will use; fields collapse to fewer columns as space shrinks. A field
 * spans the whole row with `className="col-span-full"`. Inside a FormSurface
 * (CRUD modal / side panel) the grid never exceeds `ui.forms.maxColumns`
 * (default 2) — per form: <FormSurface maxColumns={3}>.
 *
 *   <FormGrid columns={3}>
 *     <TextField name="fullName" … />
 *     <TextField name="notes" className="col-span-full" … />
 *   </FormGrid>
 */
const gridColumns = {
  1: '',
  2: '@lg:grid-cols-2',
  3: '@lg:grid-cols-2 @3xl:grid-cols-3',
  4: '@lg:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4',
} as const;

export function FormGrid({
  columns = 2,
  className,
  children,
}: Readonly<{
  columns?: keyof typeof gridColumns;
  className?: string;
  children: ReactNode;
}>) {
  const surface = useFormSurface();
  const effective = surface ? (Math.min(columns, surface.maxColumns) as typeof columns) : columns;
  return (
    <div className="@container">
      <div className={cn('grid items-start gap-4', gridColumns[effective], className)}>
        {children}
      </div>
    </div>
  );
}

/** Form footer: right-aligned actions over a hairline (Cancel + Submit). */
export function FormActions({
  className,
  children,
}: Readonly<{ className?: string; children: ReactNode }>) {
  return (
    <div
      className={cn(
        'flex flex-wrap justify-end gap-2 border-t border-border pt-4 max-sm:[&>button]:flex-1',
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface FieldRenderProps<T extends FieldValues> {
  field: ControllerRenderProps<T, FieldPath<T>>;
  fieldState: ControllerFieldState;
  id: string;
  /** Spread onto the control for accessibility. */
  aria: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby'?: string;
    'aria-required'?: boolean;
  };
}

export function FormField<T extends FieldValues>({
  name,
  label,
  description,
  required,
  className,
  render,
  horizontal,
}: Readonly<{
  name: FieldPath<T>;
  label?: ReactNode;
  description?: ReactNode;
  required?: boolean;
  className?: string;
  horizontal?: boolean;
  render: (props: FieldRenderProps<T>) => ReactNode;
}>) {
  const { control } = useFormContext<T>();
  const { field, fieldState } = useController({ name, control });
  const id = useId();
  const descId = description ? `${id}-desc` : undefined;
  const errId = fieldState.error ? `${id}-err` : undefined;
  const describedBy = [descId, errId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn(horizontal ? 'flex items-center gap-2' : 'space-y-1.5', className)}>
      {label && !horizontal ? (
        <Label htmlFor={id}>
          {label}
          {required ? (
            <span className="ms-0.5 text-danger" aria-hidden>
              *
            </span>
          ) : null}
        </Label>
      ) : null}
      {render({
        field,
        fieldState,
        id,
        aria: {
          id,
          'aria-invalid': !!fieldState.error,
          'aria-describedby': describedBy,
          'aria-required': required || undefined,
        },
      })}
      {label && horizontal ? (
        <Label htmlFor={id} className="font-normal">
          {label}
        </Label>
      ) : null}
      {description && !fieldState.error ? (
        <p id={descId} className="text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
      {fieldState.error?.message ? (
        <p
          id={errId}
          role="alert"
          className="flex items-center gap-1 text-xs font-medium text-danger"
        >
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {fieldState.error.message}
        </p>
      ) : null}
    </div>
  );
}

/** Text-like input bound to the form. */
export function TextField<T extends FieldValues>({
  name,
  label,
  description,
  required,
  className,
  ...inputProps
}: {
  name: FieldPath<T>;
  label?: ReactNode;
  description?: ReactNode;
  required?: boolean;
  className?: string;
} & Omit<InputProps, 'name'>) {
  return (
    <FormField<T>
      name={name}
      label={label}
      description={description}
      required={required}
      className={className}
      render={({ field, aria }) => (
        <Input
          {...inputProps}
          {...aria}
          name={field.name}
          ref={field.ref}
          value={field.value ?? ''}
          onChange={field.onChange}
          onBlur={field.onBlur}
        />
      )}
    />
  );
}

/** Form-level error (backend / network), with the correlation id for support. */
export function FormRootError({
  referenceLabel = 'Reference',
}: Readonly<{ referenceLabel?: string }>) {
  const { formState } = useFormContext();
  const error = (formState.errors.root as Record<string, { message?: string }> | undefined)?.server;
  if (!error?.message) return null;
  const [message, correlationId] = error.message.split('\u0000');
  return (
    <div
      role="alert"
      className="flex gap-2.5 rounded-control border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
      <div>
        <p className="font-medium text-foreground">{message}</p>
        {correlationId ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {referenceLabel}: <code className="font-mono select-all">{correlationId}</code>
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function SubmitButton({ children, ...props }: Readonly<ButtonProps>) {
  const { formState } = useFormContext();
  return (
    <Button type="submit" loading={formState.isSubmitting} {...props}>
      {children}
    </Button>
  );
}
