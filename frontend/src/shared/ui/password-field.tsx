'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useWatch, useFormContext, type FieldPath, type FieldValues } from 'react-hook-form';
import type { PasswordRulesConfig } from '@/shared/lib/password-rules';
import { FormField } from './form';
import { PasswordChecklist } from './password-checklist';
import { SecretInput } from './secret-input';

/**
 * Password input bound to the surrounding <Form>: masked, never stored by the
 * browser, Caps Lock aware — with the live policy checklist for new passwords.
 *
 *   <PasswordField<Values> name="newPassword" label="New password" purpose="new"
 *     rules={policy.data} personal={[user.username, user.fullName]} />
 */
export function PasswordField<T extends FieldValues>({
  name,
  label,
  description,
  required,
  purpose = 'current',
  rules,
  personal,
  historyCount,
  storage = 'block',
  startAdornment,
  placeholder,
  autoFocus,
}: Readonly<{
  name: FieldPath<T>;
  label?: ReactNode;
  description?: ReactNode;
  required?: boolean;
  purpose?: 'current' | 'new';
  /** Show the checklist (new passwords) using these rules. */
  rules?: PasswordRulesConfig;
  personal?: Array<string | null | undefined>;
  historyCount?: number;
  storage?: 'block' | 'allow';
  startAdornment?: ReactNode;
  placeholder?: string;
  autoFocus?: boolean;
}>) {
  const t = useTranslations('secretInput');
  const { control } = useFormContext<T>();
  const value = (useWatch({ control, name }) as string | undefined) ?? '';
  return (
    <div className="space-y-2">
      <FormField<T>
        name={name}
        label={label}
        description={description}
        required={required}
        render={({ field, aria }) => (
          <SecretInput
            {...aria}
            ref={field.ref}
            name={field.name}
            value={(field.value as string | undefined) ?? ''}
            onChange={field.onChange}
            onBlur={field.onBlur}
            storage={storage}
            purpose={purpose}
            placeholder={placeholder}
            autoFocus={autoFocus}
            startAdornment={startAdornment}
            labels={{
              show: t('show'),
              hide: t('hide'),
              showPassword: t('showPassword'),
              hidePassword: t('hidePassword'),
              capsLock: t('capsLock'),
            }}
          />
        )}
      />
      {purpose === 'new' && rules ? (
        <PasswordChecklist
          value={value}
          rules={rules}
          personal={personal}
          historyCount={historyCount}
        />
      ) : null}
    </div>
  );
}
