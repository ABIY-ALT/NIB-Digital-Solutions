'use client';

import { ImagePlus, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef } from 'react';
import { useForm, useWatch, type FieldPath } from 'react-hook-form';
import { Can } from '@/features/auth/components/can';
import { usePermissions } from '@/features/auth/components/permissions-provider';
import { isApiClientError } from '@/shared/errors/api-client-error';
import { formatMoneyWith, moneyFormatFrom } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardFooter } from '@/shared/ui/card';
import {
  Form,
  FormField,
  FormGrid,
  FormRootError,
  SubmitButton,
  TextField,
} from '@/shared/ui/form';
import { NumberField, SelectField, SwitchField, TextareaField } from '@/shared/ui/form-fields';
import { toast } from '@/shared/ui/toaster';
import { useUpdateSettings } from '../hooks/use-settings';
import type { SettingDefinition, SettingValue } from '../types';

/**
 * React Hook Form reads "company.name" as a path, so the form values are
 * nested by group: { company: { name: … } }. Keys are flattened again on save.
 */
type Values = Record<string, Record<string, SettingValue>>;
type Path = FieldPath<Values>;

const nest = (definitions: SettingDefinition[], values: Record<string, SettingValue>): Values => {
  const out: Values = {};
  for (const d of definitions) {
    const [group, ...rest] = d.key.split('.');
    const entries = out[group!] ?? {};
    entries[rest.join('.')] = values[d.key] ?? null;
    out[group!] = entries;
  }
  return out;
};

const read = (values: Values, key: string): SettingValue => {
  const [group, ...rest] = key.split('.');
  return values[group!]?.[rest.join('.')] ?? null;
};

/** The native input type of a free-text setting. */
const inputType = (type: SettingDefinition['type']) =>
  type === 'email' || type === 'url' ? type : 'text';

const MAX_IMAGE_BYTES = 200 * 1024;

export function SettingsGroupForm({
  group,
  definitions,
  values,
}: Readonly<{
  group: string;
  definitions: SettingDefinition[];
  values: Record<string, SettingValue>;
}>) {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const update = useUpdateSettings();
  const { can } = usePermissions();
  const readOnly = !can('settings:manage');

  const defaults = useMemo(() => nest(definitions, values), [definitions, values]);
  const form = useForm<Values>({ defaultValues: defaults });
  // Saved values (also from another administrator) replace the form's baseline.
  useEffect(() => form.reset(defaults), [defaults, form]);

  const label = (d: SettingDefinition) => (t.has(`keys.${d.key}`) ? t(`keys.${d.key}`) : d.label);
  const description = (d: SettingDefinition) =>
    t.has(`descriptions.${d.key}`) ? t(`descriptions.${d.key}`) : (d.description ?? undefined);
  /** Word-like option values ("before", "comma", "A4", "arrows-and-dots") are translated; symbols are shown as is. */
  const option = (value: string) =>
    /^[A-Za-z0-9-]+$/.test(value) && t.has(`options.${value}`) ? t(`options.${value}`) : value;

  const onSubmit = async (current: Values) => {
    const changed: Record<string, SettingValue> = {};
    for (const d of definitions) {
      const value = read(current, d.key);
      if (value !== read(defaults, d.key)) changed[d.key] = value;
    }
    if (Object.keys(changed).length === 0) return;
    try {
      await update.mutateAsync(changed);
      toast.success(t('saved'));
    } catch (error) {
      // Setting keys are paths in this form, so field issues are placed here.
      if (isApiClientError(error) && error.fieldIssues.length) {
        const known = error.fieldIssues.filter((i) => definitions.some((d) => d.key === i.field));
        known.forEach((i) =>
          form.setError(i.field as Path, { type: 'server', message: i.message }),
        );
        if (known.length === error.fieldIssues.length) return;
      }
      throw error;
    }
  };

  return (
    <Card>
      <Form form={form} onSubmit={onSubmit} className="space-y-0">
        <CardContent className="space-y-4">
          {group === 'format' ? <FormatPreview /> : null}
          <FormGrid columns={2}>
            {definitions.map((d) => {
              const common = {
                name: d.key as Path,
                label: label(d),
                description: description(d),
                required: d.required,
                disabled: readOnly,
              };
              switch (d.type) {
                case 'boolean':
                  return <SwitchField<Values> key={d.key} {...common} />;
                case 'number':
                  return (
                    <NumberField<Values>
                      key={d.key}
                      {...common}
                      min={d.min ?? undefined}
                      max={d.max ?? undefined}
                    />
                  );
                case 'select':
                  return (
                    <SelectField<Values>
                      key={d.key}
                      {...common}
                      options={(d.options ?? []).map((value) => ({ value, label: option(value) }))}
                    />
                  );
                case 'text':
                  return (
                    <TextareaField<Values>
                      key={d.key}
                      {...common}
                      className="col-span-full"
                      maxLength={d.max ?? undefined}
                    />
                  );
                case 'image':
                  return <ImageSetting key={d.key} {...common} className="col-span-full" />;
                case 'color':
                  return <ColorSetting key={d.key} {...common} />;
                default:
                  return (
                    <TextField<Values>
                      key={d.key}
                      {...common}
                      type={inputType(d.type)}
                      maxLength={d.max ?? undefined}
                    />
                  );
              }
            })}
          </FormGrid>
          <FormRootError referenceLabel={tc('reference')} />
        </CardContent>
        <Can permission="settings:manage">
          <CardFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={!form.formState.isDirty}
              onClick={() => form.reset(defaults)}
            >
              <RotateCcw /> {t('discard')}
            </Button>
            <SubmitButton disabled={!form.formState.isDirty}>{tc('save')}</SubmitButton>
          </CardFooter>
        </Can>
      </Form>
    </Card>
  );
}

/** Live example of an amount in the format being edited. */
function FormatPreview() {
  const t = useTranslations('settings');
  const format = useWatch<Values>({ name: 'format' }) as Record<string, SettingValue> | undefined;
  const flat = Object.fromEntries(
    Object.entries(format ?? {}).map(([key, value]) => [`format.${key}`, value]),
  );
  return (
    <p className="rounded-control border border-border bg-surface-muted px-3.5 py-2.5 text-sm">
      <span className="text-muted-foreground">{t('preview')}</span>{' '}
      <span className="font-semibold tabular">
        {formatMoneyWith(1234567.891, moneyFormatFrom(flat))}
      </span>
    </p>
  );
}

interface CustomFieldProps {
  name: Path;
  label: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

/** Hex colour: a text box with the native colour picker as its swatch. */
function ColorSetting({ disabled, ...props }: Readonly<CustomFieldProps>) {
  const value = useWatch<Values>({ name: props.name }) as unknown as string | null;
  const valid = typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <FormField<Values>
      {...props}
      render={({ field, aria }) => (
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={props.label}
            disabled={disabled}
            value={valid ? value : '#000000'}
            onChange={(e) => field.onChange(e.target.value.toUpperCase())}
            className="size-control shrink-0 cursor-pointer rounded-control border border-input bg-surface p-0.5 disabled:cursor-not-allowed"
          />
          <TextInput field={field} aria={aria} disabled={disabled} />
        </div>
      )}
    />
  );
}

function TextInput({
  field,
  aria,
  disabled,
}: Readonly<{
  field: { name: string; value: unknown; onChange: (v: string) => void; onBlur: () => void };
  aria: Record<string, unknown>;
  disabled?: boolean;
}>) {
  return (
    <input
      {...aria}
      name={field.name}
      disabled={disabled}
      value={typeof field.value === 'string' ? field.value : ''}
      onChange={(e) => field.onChange(e.target.value)}
      onBlur={field.onBlur}
      maxLength={7}
      spellCheck={false}
      className="h-control w-full min-w-0 rounded-control border border-input bg-surface px-3 font-mono text-sm uppercase outline-none hover:border-border-strong focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 aria-invalid:border-danger"
    />
  );
}

/** PNG / JPEG stored as a data URL (logos): preview, replace and remove. */
function ImageSetting({ disabled, ...props }: Readonly<CustomFieldProps>) {
  const t = useTranslations('settings');
  const input = useRef<HTMLInputElement>(null);
  return (
    <FormField<Values>
      {...props}
      render={({ field, aria }) => {
        const value = typeof field.value === 'string' ? field.value : null;
        const choose = (file: File | undefined) => {
          if (!file) return;
          if (!['image/png', 'image/jpeg'].includes(file.type)) {
            toast.error(t('image.type'));
            return;
          }
          if (file.size > MAX_IMAGE_BYTES) {
            toast.error(t('image.size'));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => field.onChange(reader.result as string);
          reader.readAsDataURL(file);
        };
        return (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-control border border-border bg-surface-muted">
              {value ? (
                // eslint-disable-next-line @next/next/no-img-element -- a data URL, not an optimisable asset
                <img src={value} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <ImagePlus className="size-5 text-subtle-foreground" aria-hidden />
              )}
            </div>
            <input
              ref={input}
              id={aria.id}
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              disabled={disabled}
              aria-describedby={aria['aria-describedby']}
              onChange={(e) => {
                choose(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => input.current?.click()}
            >
              <ImagePlus /> {value ? t('image.replace') : t('image.choose')}
            </Button>
            {value ? (
              <Button
                type="button"
                variant="ghost"
                disabled={disabled}
                onClick={() => field.onChange(null)}
              >
                <Trash2 /> {t('image.remove')}
              </Button>
            ) : null}
          </div>
        );
      }}
    />
  );
}
