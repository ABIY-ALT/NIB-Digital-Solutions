'use client';

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, type ReactNode } from 'react';
import { Select } from '@/shared/ui/choice';
import { Input, Label, Textarea, type FieldAppearance } from '@/shared/ui/input';
import { OtpInput } from '@/shared/ui/otp-input';
import { RecordPicker } from '@/shared/ui/record-picker';
import { UiSettingsProvider, useUiSettings } from '@/shared/ui/ui-settings';
import { optionsOf, Section, Specimen, SpecimenGrid } from './specimen';

const APPEARANCES = optionsOf<FieldAppearance>({ outline: true, filled: true, underline: true });

export function FieldsPanel() {
  const settings = useUiSettings();
  return (
    <Section id="fieldAppearance" config="ui.controls.field" prop="appearance">
      <SpecimenGrid min="17rem">
        {APPEARANCES.map((appearance) => (
          <Specimen
            key={appearance}
            name={appearance}
            isDefault={appearance === settings.controls.field}
            align="stretch"
          >
            {/* Same effect as setting `ui.controls.field`: every field inside follows it. */}
            <UiSettingsProvider
              settings={{ ...settings, controls: { ...settings.controls, field: appearance } }}
            >
              <FieldSamples />
            </UiSettingsProvider>
          </Specimen>
        ))}
      </SpecimenGrid>
    </Section>
  );
}

function FieldSamples() {
  const t = useTranslations('componentGallery.sample');
  const id = useId();
  const [branch, setBranch] = useState<string[]>(['head']);
  const [code, setCode] = useState('123');
  const branches = (['head', 'bole', 'piassa'] as const).map((value) => ({
    value,
    label: t(`branches.${value}`),
  }));
  return (
    <>
      <Field id={`${id}-name`} label={t('name')}>
        <Input id={`${id}-name`} placeholder={t('namePlaceholder')} />
      </Field>
      <Field id={`${id}-search`} label={t('search')}>
        <Input
          id={`${id}-search`}
          placeholder={t('searchPlaceholder')}
          startAdornment={<Search aria-hidden />}
        />
      </Field>
      <Field id={`${id}-notes`} label={t('notes')}>
        <Textarea id={`${id}-notes`} placeholder={t('notesPlaceholder')} />
      </Field>
      <Field id={`${id}-branch`} label={t('branch')}>
        <Select id={`${id}-branch`} options={branches} placeholder={t('branchPlaceholder')} />
      </Field>
      <Field id={`${id}-roles`} label={t('roles')}>
        <RecordPicker
          id={`${id}-roles`}
          source={branches}
          multiple
          value={branch}
          onChange={setBranch}
        />
      </Field>
      <Field id={`${id}-invalid`} label={t('invalid')}>
        <Input
          id={`${id}-invalid`}
          defaultValue={t('invalidValue')}
          aria-invalid
          aria-describedby={`${id}-invalid-error`}
        />
        <p id={`${id}-invalid-error`} className="text-xs font-medium text-danger">
          {t('invalidMessage')}
        </p>
      </Field>
      <Field id={`${id}-disabled`} label={t('disabled')}>
        <Input id={`${id}-disabled`} defaultValue={t('person')} disabled />
      </Field>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold">{t('code')}</p>
        <OtpInput value={code} onChange={setCode} length={4} aria-label={t('code')} />
      </div>
    </>
  );
}

function Field({
  id,
  label,
  children,
}: Readonly<{ id: string; label: string; children: ReactNode }>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
