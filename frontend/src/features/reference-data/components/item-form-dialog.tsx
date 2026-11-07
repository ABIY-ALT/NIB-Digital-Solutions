'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApprovalNotice } from '@/features/approvals/components/approval-notice';
import { useSaveFeedback } from '@/shared/hooks/use-save-feedback';
import { Button } from '@/shared/ui/button';
import { Select, Switch } from '@/shared/ui/choice';
import {
  Form,
  FormActions,
  FormGrid,
  FormRootError,
  SubmitButton,
  TextField,
} from '@/shared/ui/form';
import { FormSurface } from '@/shared/ui/form-surface';
import { SwitchField } from '@/shared/ui/form-fields';
import { Input, Label } from '@/shared/ui/input';
import { useSaveReferenceItem } from '../hooks/use-reference-data';
import type {
  AttributeDefinition,
  AttributeType,
  AttributeValue,
  ReferenceDataItem,
  ReferenceDataType,
} from '../types';
import { ReferenceSelectField } from './reference-select';

const dateOnly = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

/** A stored attribute value → its form value (a switch for booleans, text otherwise). */
function formValue(type: AttributeType, value: AttributeValue | undefined): string | boolean {
  if (type === 'boolean') return value === true;
  return value === null || value === undefined ? '' : String(value);
}

/** A form value → the attribute value to store (empty text clears it). */
function storedValue(type: AttributeType, raw: string | boolean | undefined): AttributeValue {
  if (type === 'boolean') return raw === true;
  if (raw === '') return null;
  return type === 'number' ? Number(raw) : String(raw);
}

/** The input for one attribute, by its type. */
function AttributeInput({
  attribute: a,
  id,
  invalid,
  value,
  onChange,
  onBlur,
}: Readonly<{
  attribute: AttributeDefinition;
  id: string;
  invalid: boolean;
  value: unknown;
  onChange: (value: unknown) => void;
  onBlur: () => void;
}>) {
  if (a.type === 'boolean') {
    return <Switch id={id} checked={value === true} onCheckedChange={onChange} />;
  }
  if (a.type === 'select') {
    return (
      <Select
        id={id}
        aria-invalid={invalid}
        value={(value as string) || undefined}
        onValueChange={onChange}
        options={(a.options ?? []).map((o) => ({ value: o, label: o }))}
      />
    );
  }
  return (
    <Input
      id={id}
      aria-invalid={invalid}
      type={a.type === 'date' ? 'date' : 'text'}
      inputMode={a.type === 'number' ? 'decimal' : undefined}
      value={(value as string) ?? ''}
      onChange={onChange}
      onBlur={onBlur}
    />
  );
}

/** Add or edit an item of a reference list; attribute fields come from the list definition. */
export function ItemFormDialog({
  type,
  item,
  open,
  onOpenChange,
}: Readonly<{
  type: ReferenceDataType;
  item: ReferenceDataItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const t = useTranslations('referenceData');
  return (
    <FormSurface
      id="reference-data.items"
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      icon={item ? <Pencil /> : <Plus />}
      title={
        item
          ? t('itemForm.editTitle', { code: item.code })
          : t('itemForm.createTitle', { list: type.name })
      }
      description={type.description ?? undefined}
    >
      {open ? <ItemForm type={type} item={item} onDone={() => onOpenChange(false)} /> : null}
    </FormSurface>
  );
}

function ItemForm({
  type,
  item,
  onDone,
}: Readonly<{
  type: ReferenceDataType;
  item: ReferenceDataItem | null;
  onDone: () => void;
}>) {
  const t = useTranslations('referenceData');
  const tc = useTranslations('common');
  const save = useSaveReferenceItem();
  const feedback = useSaveFeedback();
  const [reason, setReason] = useState('');
  const editing = !!item;

  const attributeShape = Object.fromEntries(
    type.attributes.map((a) => {
      if (a.type === 'boolean') return [a.key, z.boolean()];
      let s = z.string().trim();
      if (a.required) s = s.min(1, t('itemForm.required', { field: a.label }));
      if (a.type === 'number') {
        return [
          a.key,
          s.refine((v) => v === '' || Number.isFinite(Number(v)), t('itemForm.number')),
        ];
      }
      return [a.key, s];
    }),
  );
  const schema = z
    .object({
      code: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9][A-Z0-9_.-]{0,63}$/, t('itemForm.codeRule')),
      label: z.string().trim().min(1, t('itemForm.labelRequired')).max(160),
      labelAm: z.string().trim().max(160),
      description: z.string().trim().max(500),
      sortOrder: z.string().regex(/^\d{0,6}$/, t('itemForm.number')),
      active: z.boolean(),
      validFrom: z.string(),
      validTo: z.string(),
      parentCode: z.string(),
      attributes: z.object(attributeShape),
    })
    .refine((v) => !v.validFrom || !v.validTo || v.validTo > v.validFrom, {
      path: ['validTo'],
      message: t('itemForm.validRange'),
    });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: item?.code ?? '',
      label: item?.label ?? '',
      labelAm: item?.labels.am ?? '',
      description: item?.description ?? '',
      sortOrder: String(item?.sortOrder ?? 0),
      active: item?.active ?? true,
      validFrom: dateOnly(item?.validFrom ?? null),
      validTo: dateOnly(item?.validTo ?? null),
      parentCode: item?.parentCode ?? '',
      attributes: Object.fromEntries(
        type.attributes.map((a) => [a.key, formValue(a.type, item?.attributes[a.key])]),
      ),
    },
  });

  return (
    <Form
      form={form}
      onSubmit={async (v) => {
        const attributes: Record<string, AttributeValue> = {};
        for (const a of type.attributes) {
          const raw = (v.attributes as Record<string, string | boolean>)[a.key];
          attributes[a.key] = storedValue(a.type, raw);
        }
        const input = {
          label: v.label,
          labels: (v.labelAm ? { am: v.labelAm } : {}) as Record<string, string>,
          description: v.description || null,
          sortOrder: Number(v.sortOrder || 0),
          active: v.active,
          validFrom: v.validFrom ? `${v.validFrom}T00:00:00.000Z` : null,
          validTo: v.validTo ? `${v.validTo}T00:00:00.000Z` : null,
          parentCode: v.parentCode || null,
          attributes,
        };
        const result = await save.mutateAsync(
          editing
            ? { type: type.code, id: item.id, input: { ...input, version: item.version }, reason }
            : { type: type.code, input: { ...input, code: v.code }, reason },
        );
        feedback(
          result,
          editing
            ? t('toast.itemUpdated', { code: item.code })
            : t('toast.itemCreated', { code: v.code }),
        );
        onDone();
      }}
    >
      <FormGrid columns={2}>
        <TextField<Values>
          name="code"
          label={t('fields.code')}
          required
          disabled={editing}
          autoFocus={!editing}
          description={editing ? t('itemForm.codePermanent') : t('itemForm.codeHint')}
          className="[&_input]:font-mono [&_input]:uppercase"
        />
        <TextField<Values> name="label" label={t('fields.label')} required autoFocus={editing} />
        <TextField<Values> name="labelAm" label={t('fields.labelAm')} lang="am" />
        <TextField<Values> name="sortOrder" label={t('fields.sortOrder')} inputMode="numeric" />
        <TextField<Values>
          name="description"
          label={t('fields.description')}
          className="col-span-full"
        />
        {type.parentTypeCode ? (
          <ReferenceSelectField<Values>
            name="parentCode"
            label={t('fields.parent')}
            type={type.parentTypeCode}
            allowEmpty
          />
        ) : null}
        <TextField<Values> name="validFrom" label={t('fields.validFrom')} type="date" />
        <TextField<Values> name="validTo" label={t('fields.validTo')} type="date" />
        <SwitchField<Values>
          name="active"
          label={t('fields.active')}
          description={t('itemForm.activeHint')}
        />
      </FormGrid>

      {type.attributes.length ? (
        <fieldset className="space-y-3 rounded-surface border border-border p-4">
          <legend className="px-1 text-sm font-semibold">{t('itemForm.attributes')}</legend>
          <FormGrid columns={2}>
            {type.attributes.map((a) => {
              const name = `attributes.${a.key}` as const;
              const id = `attr-${a.key}`;
              const error = (
                form.formState.errors.attributes as Record<string, { message?: string }> | undefined
              )?.[a.key];
              return (
                <div key={a.key} className="space-y-1.5">
                  <Label htmlFor={id}>
                    {a.label}
                    {a.required ? (
                      <span className="ms-0.5 text-danger" aria-hidden>
                        *
                      </span>
                    ) : null}
                  </Label>
                  <Controller
                    control={form.control}
                    name={name as never}
                    render={({ field }) => (
                      <AttributeInput
                        attribute={a}
                        id={id}
                        invalid={!!error}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                      />
                    )}
                  />
                  {error?.message ? <p className="text-xs text-danger">{error.message}</p> : null}
                </div>
              );
            })}
          </FormGrid>
        </fieldset>
      ) : null}

      <ApprovalNotice
        action={editing ? 'reference-data.items.update' : 'reference-data.items.create'}
        reason={reason}
        onReasonChange={setReason}
      />
      <FormRootError referenceLabel={tc('reference')} />
      <FormActions>
        <Button type="button" variant="outline" onClick={onDone}>
          {tc('cancel')}
        </Button>
        <SubmitButton>{editing ? tc('save') : t('itemForm.create')}</SubmitButton>
      </FormActions>
    </Form>
  );
}
