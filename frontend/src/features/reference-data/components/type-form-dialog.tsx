'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ListPlus, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
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
import { SelectField } from '@/shared/ui/form-fields';
import { Input } from '@/shared/ui/input';
import { useReferenceTypes, useSaveReferenceType } from '../hooks/use-reference-data';
import { ATTRIBUTE_TYPES, type ReferenceDataType } from '../types';

const NONE = '__none__';

/** Create / edit a reference list and the extra attributes its items carry. */
export function TypeFormDialog({
  open,
  onOpenChange,
  type,
  onSaved,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: ReferenceDataType | null;
  onSaved?: (code: string) => void;
}>) {
  const t = useTranslations('referenceData');
  return (
    <FormSurface
      id="reference-data.types"
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      icon={<ListPlus />}
      title={type ? t('typeForm.editTitle', { name: type.name }) : t('typeForm.createTitle')}
      description={t('typeForm.description')}
    >
      {open ? <TypeForm type={type} onDone={() => onOpenChange(false)} onSaved={onSaved} /> : null}
    </FormSurface>
  );
}

function TypeForm({
  type,
  onDone,
  onSaved,
}: Readonly<{
  type: ReferenceDataType | null;
  onDone: () => void;
  onSaved?: (code: string) => void;
}>) {
  const t = useTranslations('referenceData');
  const tc = useTranslations('common');
  const save = useSaveReferenceType();
  const feedback = useSaveFeedback();
  const lists = useReferenceTypes();
  const editing = !!type;

  const schema = z.object({
    code: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z][a-z0-9-]{1,63}$/, t('typeForm.codeRule')),
    name: z.string().trim().min(2, t('typeForm.nameRequired')).max(120),
    description: z.string().trim().max(500),
    parentTypeCode: z.string(),
    attributes: z.array(
      z.object({
        key: z
          .string()
          .trim()
          .regex(/^[a-z][a-zA-Z0-9]{0,39}$/, t('typeForm.keyRule')),
        label: z.string().trim().min(1, t('typeForm.labelRequired')).max(80),
        type: z.enum(['text', 'number', 'boolean', 'date', 'select']),
        required: z.boolean(),
        options: z.string(),
      }),
    ),
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: type?.code ?? '',
      name: type?.name ?? '',
      description: type?.description ?? '',
      parentTypeCode: type?.parentTypeCode ?? NONE,
      attributes: (type?.attributes ?? []).map((a) => ({
        key: a.key,
        label: a.label,
        type: a.type,
        required: a.required,
        options: (a.options ?? []).join(', '),
      })),
    },
  });
  const attributes = useFieldArray({ control: form.control, name: 'attributes' });
  const kinds = useWatch({ control: form.control, name: 'attributes' });

  return (
    <Form
      form={form}
      onSubmit={async (v) => {
        const input = {
          name: v.name,
          description: v.description || null,
          parentTypeCode: v.parentTypeCode === NONE ? null : v.parentTypeCode,
          attributes: v.attributes.map((a) => ({
            key: a.key,
            label: a.label,
            type: a.type,
            required: a.required,
            ...(a.type === 'select'
              ? {
                  options: a.options
                    .split(',')
                    .map((o) => o.trim())
                    .filter(Boolean),
                }
              : {}),
          })),
        };
        const result = await save.mutateAsync(
          editing
            ? { id: type.code, input: { ...input, version: type.version } }
            : { input: { ...input, code: v.code } },
        );
        feedback(result, editing ? t('toast.typeUpdated') : t('toast.typeCreated'));
        onSaved?.(v.code);
        onDone();
      }}
    >
      <FormGrid columns={2}>
        <TextField<Values>
          name="name"
          label={t('fields.name')}
          required
          autoFocus
          maxLength={120}
        />
        <TextField<Values>
          name="code"
          label={t('fields.code')}
          required
          disabled={editing}
          description={editing ? undefined : t('typeForm.codeHint')}
          className="[&_input]:font-mono"
        />
        <TextField<Values>
          name="description"
          label={t('fields.description')}
          className="col-span-full"
        />
        <SelectField<Values>
          name="parentTypeCode"
          label={t('fields.parentList')}
          description={t('typeForm.parentHint')}
          options={[
            { value: NONE, label: t('typeForm.noParent') },
            ...(lists.data ?? [])
              .filter((l) => l.code !== type?.code)
              .map((l) => ({ value: l.code, label: `${l.name} · ${l.code}` })),
          ]}
        />
      </FormGrid>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">{t('typeForm.attributes')}</h3>
            <p className="text-xs text-muted-foreground">{t('typeForm.attributesHint')}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              attributes.append({ key: '', label: '', type: 'text', required: false, options: '' })
            }
          >
            <Plus /> {t('typeForm.addAttribute')}
          </Button>
        </div>
        {attributes.fields.length === 0 ? (
          <p className="rounded-control border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            {t('typeForm.noAttributes')}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-control border border-border">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-start font-semibold">{t('typeForm.key')}</th>
                  <th className="px-2 py-2 text-start font-semibold">{t('typeForm.label')}</th>
                  <th className="w-32 px-2 py-2 text-start font-semibold">{t('typeForm.type')}</th>
                  <th className="w-20 px-2 py-2 text-center font-semibold">
                    {t('typeForm.required')}
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {attributes.fields.map((f, i) => {
                  const errors = form.formState.errors.attributes?.[i];
                  return (
                    <tr key={f.id} className="align-top">
                      <td className="p-2">
                        <Input
                          {...form.register(`attributes.${i}.key`)}
                          aria-label={t('typeForm.key')}
                          aria-invalid={!!errors?.key}
                          placeholder="symbol"
                          className="font-mono"
                        />
                        {errors?.key ? (
                          <p className="mt-1 text-[11px] text-danger">{errors.key.message}</p>
                        ) : null}
                      </td>
                      <td className="p-2">
                        <Input
                          {...form.register(`attributes.${i}.label`)}
                          aria-label={t('typeForm.label')}
                          aria-invalid={!!errors?.label}
                          placeholder={t('typeForm.labelPlaceholder')}
                        />
                        {kinds?.[i]?.type === 'select' ? (
                          <Input
                            {...form.register(`attributes.${i}.options`)}
                            aria-label={t('typeForm.options')}
                            placeholder={t('typeForm.optionsPlaceholder')}
                            className="mt-1.5 text-xs"
                          />
                        ) : null}
                      </td>
                      <td className="p-2">
                        <Select
                          aria-label={t('typeForm.type')}
                          value={kinds?.[i]?.type ?? 'text'}
                          onValueChange={(v) =>
                            form.setValue(
                              `attributes.${i}.type`,
                              v as (typeof ATTRIBUTE_TYPES)[number],
                            )
                          }
                          options={ATTRIBUTE_TYPES.map((k) => ({
                            value: k,
                            label: t(`attributeTypes.${k}`),
                          }))}
                        />
                      </td>
                      <td className="p-2 text-center">
                        <Switch
                          aria-label={t('typeForm.required')}
                          checked={kinds?.[i]?.required ?? false}
                          onCheckedChange={(v) => form.setValue(`attributes.${i}.required`, v)}
                          className="mt-2"
                        />
                      </td>
                      <td className="p-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('typeForm.removeAttribute')}
                          onClick={() => attributes.remove(i)}
                          className="mt-1 text-muted-foreground hover:text-danger"
                        >
                          <Trash2 />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <FormRootError referenceLabel={tc('reference')} />
      <FormActions>
        <Button type="button" variant="outline" onClick={onDone}>
          {tc('cancel')}
        </Button>
        <SubmitButton>{editing ? tc('save') : t('typeForm.create')}</SubmitButton>
      </FormActions>
    </Form>
  );
}
