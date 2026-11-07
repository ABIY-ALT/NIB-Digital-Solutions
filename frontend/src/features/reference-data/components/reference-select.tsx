'use client';

import { useTranslations } from 'next-intl';
import type { FieldValues } from 'react-hook-form';
import type { FieldBaseProps } from '@/shared/ui/form-fields';
import { RecordPicker, RecordPickerField } from '@/shared/ui/record-picker';

export interface ReferenceSelectProps {
  /** Reference list code, e.g. "branches", "currencies". */
  type: string;
  value: string | null | undefined;
  onChange: (code: string | null) => void;
  /** Only items of this parent (e.g. branches of region "AA"). */
  parent?: string | null;
  /** Allow clearing the value (no selection). */
  allowEmpty?: boolean;
  /** Show codes next to labels ("Bole Branch  ADD01"). */
  showCode?: boolean;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
  'aria-label'?: string;
}

/**
 * Searchable, paginated picker bound to a reference list (translated labels,
 * effective items only) — a RecordPicker over the "refdata.<type>" source. A
 * current value that was deactivated stays visible (marked inactive) so
 * records never "lose" their value silently.
 */
export function ReferenceSelect({
  type,
  value,
  onChange,
  parent,
  allowEmpty,
  showCode = true,
  placeholder,
  disabled,
  id,
  invalid,
  ...aria
}: Readonly<ReferenceSelectProps>) {
  const t = useTranslations('referenceData.select');
  return (
    <RecordPicker
      source={`refdata.${type}`}
      parent={parent}
      id={id}
      invalid={invalid}
      aria-label={aria['aria-label']}
      placeholder={placeholder ?? t('placeholder')}
      disabled={disabled}
      clearable={allowEmpty}
      showHint={showCode}
      value={value || null}
      onChange={(code) => onChange(code)}
    />
  );
}

/** ReferenceSelect bound to the surrounding <Form> (React Hook Form). */
export function ReferenceSelectField<T extends FieldValues>({
  type,
  parent,
  allowEmpty,
  placeholder,
  showCode = true,
  ...field
}: FieldBaseProps<T> &
  Pick<ReferenceSelectProps, 'type' | 'parent' | 'allowEmpty' | 'placeholder' | 'showCode'>) {
  const t = useTranslations('referenceData.select');
  return (
    <RecordPickerField<T>
      {...field}
      source={`refdata.${type}`}
      parent={parent}
      placeholder={placeholder ?? t('placeholder')}
      clearable={allowEmpty}
      showHint={showCode}
    />
  );
}
