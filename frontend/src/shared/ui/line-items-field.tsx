'use client';

import { AlertCircle, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import {
  Controller,
  get,
  useFieldArray,
  useFormContext,
  useWatch,
  type ArrayPath,
  type FieldArray,
  type FieldValues,
  type Path,
} from 'react-hook-form';
import { cn } from '@/shared/lib/cn';
import { Button } from './button';
import { Select, type SelectOption } from './choice';
import { Input, Label } from './input';

/**
 * Master–detail rows inside a form (invoice lines, order items, journal
 * entries, signatories): add, edit and remove rows, with computed columns and
 * a totals block. The rows are an ordinary array field of the form, so the Zod
 * schema validates them and the submitted values contain them.
 *
 *   <LineItemsField<Values, 'items'>
 *     name="items"
 *     label="Items"
 *     newRow={() => ({ description: '', quantity: 1, price: null })}
 *     columns={[
 *       { key: 'description', label: 'Description', type: 'text', width: '3fr' },
 *       { key: 'quantity', label: 'Qty', type: 'number', min: 0, width: '6rem' },
 *       { key: 'price', label: 'Price', type: 'number', step: 0.01, width: '9rem' },
 *       { key: 'amount', label: 'Amount', type: 'computed', width: '9rem',
 *         compute: (row) => money(lineAmount(row)) },
 *     ]}
 *     summary={(rows) => [{ label: 'Total', value: money(lineTotals(rows).total), emphasis: true }]}
 *   />
 *
 * Wide containers show a table; narrow ones (a small dialog, a phone) stack
 * each row as a card with its labels. Enter moves down a column and adds a row
 * from the last one. Number cells store a number, or null when empty.
 */
type Row<T extends FieldValues, N extends ArrayPath<T>> = FieldArray<T, N>;

interface ColumnBase {
  /** Field of the row (or any unique id for a computed column). */
  key: string;
  label: string;
  /** Grid track: "3fr", "8rem", "minmax(8rem,1fr)". Default "1fr". */
  width?: string;
  align?: 'start' | 'end';
}

export type LineItemColumn<R> = ColumnBase &
  (
    | { type: 'text'; placeholder?: string; maxLength?: number }
    | { type: 'number'; placeholder?: string; min?: number; max?: number; step?: number }
    | { type: 'select'; options: SelectOption[]; placeholder?: string }
    /** Read-only value derived from the row (line amount, running balance). */
    | { type: 'computed'; compute: (row: R, index: number) => ReactNode }
    /** Any control: bind it with `name` (e.g. a RecordPickerField without a label). */
    | { type: 'custom'; render: (cell: { name: string; index: number; row: R }) => ReactNode }
  );

export interface LineItemsSummaryLine {
  label: string;
  value: ReactNode;
  emphasis?: boolean;
}

export interface LineItemsFieldProps<T extends FieldValues, N extends ArrayPath<T>> {
  name: N;
  label?: ReactNode;
  description?: ReactNode;
  columns: Array<LineItemColumn<Row<T, N>>>;
  /** Values of a row added with the button (or Enter on the last row). */
  newRow: () => Row<T, N>;
  minRows?: number;
  maxRows?: number;
  /** Totals under the rows, recomputed as the user types. */
  summary?: (rows: Array<Row<T, N>>) => LineItemsSummaryLine[];
  addLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function LineItemsField<T extends FieldValues, N extends ArrayPath<T> = ArrayPath<T>>({
  name,
  label,
  description,
  columns,
  newRow,
  minRows = 0,
  maxRows = 100,
  summary,
  addLabel,
  disabled,
  className,
}: Readonly<LineItemsFieldProps<T, N>>) {
  const t = useTranslations('lineItems');
  const form = useFormContext<T>();
  const { fields, append, remove } = useFieldArray({ control: form.control, name });
  // Live values (the `fields` snapshot only changes when rows are added or removed).
  const rows = (useWatch({ control: form.control, name: name as unknown as Path<T> }) ??
    []) as Array<Row<T, N>>;
  const errors = get(form.formState.errors, name) as
    { message?: string; root?: { message?: string } } | undefined;
  const listError = errors?.root?.message ?? errors?.message;

  const firstEditable = columns.find((c) => c.type !== 'computed' && c.type !== 'custom');
  const canAdd = !disabled && fields.length < maxRows;
  const canRemove = !disabled && fields.length > minRows;
  const path = (index: number, key: string) => `${name}.${index}.${key}` as Path<T>;

  const add = () => {
    if (!canAdd) return;
    const first = firstEditable;
    append(newRow(), {
      shouldFocus: !!first,
      focusName: first ? path(fields.length, first.key) : undefined,
    });
  };

  /** Enter moves down the column; from the last row it adds one. Never submits the form. */
  const onEnter = (event: KeyboardEvent, index: number, key: string) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (index < fields.length - 1) form.setFocus(path(index + 1, key));
    else add();
  };

  const template = `${columns.map((c) => c.width ?? '1fr').join(' ')} 2rem`;

  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? <p className="text-sm font-semibold text-foreground">{label}</p> : null}
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      <div
        className="@container rounded-control border border-border"
        style={{ '--line-cols': template } as CSSProperties}
      >
        {/* Visual column headings: each cell carries its own (visually hidden) label. */}
        <div
          aria-hidden
          className="hidden gap-2 border-b border-border bg-surface-muted px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase @2xl:grid @2xl:grid-cols-(--line-cols)"
        >
          {columns.map((c) => (
            <span key={c.key} className={cn(c.align === 'end' && 'text-end')}>
              {c.label}
            </span>
          ))}
          <span className="sr-only">{t('actions')}</span>
        </div>

        {fields.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('empty')}</p>
        ) : null}

        {fields.map((field, index) => (
          <fieldset
            key={field.id}
            aria-label={t('row', { n: index + 1 })}
            className="relative grid min-w-0 gap-2 border-b border-border px-3 py-3 pe-11 last:border-b-0 @2xl:grid-cols-(--line-cols) @2xl:items-start @2xl:py-2 @2xl:pe-3"
          >
            {columns.map((column) => {
              const id = `${field.id}-${column.key}`;
              const error = get(form.formState.errors, path(index, column.key)) as
                { message?: string } | undefined;
              return (
                <div key={column.key} className="min-w-0 space-y-1">
                  {/* Stacked layout shows the label on every cell; the table has a header row. */}
                  <Label
                    htmlFor={column.type === 'computed' ? undefined : id}
                    className="text-xs font-medium text-muted-foreground @2xl:sr-only"
                  >
                    {column.label}
                  </Label>
                  <Cell
                    column={column}
                    id={id}
                    name={path(index, column.key)}
                    index={index}
                    row={rows[index] ?? (field as unknown as Row<T, N>)}
                    disabled={disabled}
                    invalid={!!error}
                    onKeyDown={(e) => onEnter(e, index, column.key)}
                  />
                  {error?.message ? (
                    <p role="alert" className="text-xs font-medium text-danger">
                      {error.message}
                    </p>
                  ) : null}
                </div>
              );
            })}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute end-2 top-2 text-muted-foreground hover:text-danger @2xl:static @2xl:mt-0.5"
              aria-label={t('remove', { n: index + 1 })}
              title={t('remove', { n: index + 1 })}
              disabled={!canRemove}
              onClick={() => remove(index)}
            >
              <Trash2 />
            </Button>
          </fieldset>
        ))}
      </div>

      {listError ? (
        <p role="alert" className="flex items-center gap-1 text-xs font-medium text-danger">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {listError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4 pt-1">
        <Button type="button" variant="outline" size="sm" disabled={!canAdd} onClick={add}>
          <Plus /> {addLabel ?? t('add')}
        </Button>
        {summary ? (
          <dl className="ms-auto w-full max-w-xs space-y-1 text-sm">
            {summary(rows).map((line) => (
              <div
                key={line.label}
                className={cn(
                  'flex items-baseline justify-between gap-4',
                  line.emphasis &&
                    'mt-1 border-t border-border pt-2 text-base font-semibold text-foreground',
                )}
              >
                <dt className={cn(!line.emphasis && 'text-muted-foreground')}>{line.label}</dt>
                <dd className="tabular">{line.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </div>
  );
}

function Cell<R>({
  column,
  id,
  name,
  index,
  row,
  disabled,
  invalid,
  onKeyDown,
}: Readonly<{
  column: LineItemColumn<R>;
  id: string;
  name: string;
  index: number;
  row: R;
  disabled?: boolean;
  invalid: boolean;
  onKeyDown: (event: KeyboardEvent) => void;
}>) {
  const { control } = useFormContext();
  const end = column.align === 'end';

  if (column.type === 'computed') {
    return (
      <p
        className={cn(
          'flex min-h-control items-center text-sm font-medium tabular',
          end && '@2xl:justify-end',
        )}
      >
        {column.compute(row, index)}
      </p>
    );
  }
  if (column.type === 'custom') return <>{column.render({ name, index, row })}</>;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => {
        if (column.type === 'select') {
          return (
            <Select
              id={id}
              aria-invalid={invalid}
              aria-label={column.label}
              options={column.options}
              placeholder={column.placeholder}
              disabled={disabled}
              name={field.name}
              value={(field.value as string) || undefined}
              onValueChange={(value) => {
                field.onChange(value);
                field.onBlur();
              }}
            />
          );
        }
        const numeric = column.type === 'number';
        return (
          <Input
            id={id}
            ref={field.ref}
            name={field.name}
            aria-invalid={invalid}
            disabled={disabled}
            placeholder={column.placeholder}
            className={cn(numeric && 'tabular', end && '@2xl:text-end')}
            onBlur={field.onBlur}
            onKeyDown={onKeyDown}
            {...(numeric
              ? {
                  type: 'number',
                  inputMode: 'decimal' as const,
                  min: column.min,
                  max: column.max,
                  step: column.step ?? 'any',
                  value:
                    field.value === null || field.value === undefined ? '' : String(field.value),
                  onChange: (e) =>
                    field.onChange(e.target.value === '' ? null : e.target.valueAsNumber),
                }
              : {
                  maxLength: column.maxLength,
                  value: (field.value as string | undefined) ?? '',
                  onChange: field.onChange,
                })}
          />
        );
      }}
    />
  );
}
