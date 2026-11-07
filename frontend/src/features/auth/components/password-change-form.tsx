'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, Lock } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { isApiClientError } from '@/shared/errors/api-client-error';
import { Alert } from '@/shared/ui/feedback';
import { applyServerError, Form, FormField, FormRootError, SubmitButton } from '@/shared/ui/form';
import { PasswordChecklist, usePasswordIssueTranslator } from '@/shared/ui/password-checklist';
import { SecretInput } from '@/shared/ui/secret-input';
import { useCompletePasswordChange, usePasswordPolicy } from '../hooks/use-auth';

/**
 * Sign-in step for an expired or temporary password → POST /api/auth/password
 * (Next.js) → NestJS /auth/password/change. The live checklist follows the
 * backend policy; history / common-password rules are reported by the server.
 */
export function PasswordChangeForm({
  reason,
  callbackUrl,
  credentialStorage,
}: Readonly<{
  reason: 'EXPIRED' | 'RESET';
  callbackUrl?: string;
  credentialStorage: 'block' | 'allow';
}>) {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const router = useRouter();
  const change = useCompletePasswordChange();
  const policy = usePasswordPolicy();
  const translateIssue = usePasswordIssueTranslator();
  const [expired, setExpired] = useState(false);

  const schema = z
    .object({
      newPassword: z.string().min(1, t('passwordChange.required')).max(256),
      confirmPassword: z.string(),
    })
    .refine((v) => v.newPassword === v.confirmPassword, {
      path: ['confirmPassword'],
      message: t('passwordChange.mismatch'),
    });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });
  const value = useWatch({ control: form.control, name: 'newPassword' }) ?? '';
  const labels = {
    show: t('show'),
    hide: t('hide'),
    showPassword: t('showPassword'),
    hidePassword: t('hidePassword'),
    capsLock: t('capsLock'),
  };

  const onSubmit = async (values: Values) => {
    try {
      const outcome = await change.mutateAsync({ newPassword: values.newPassword, callbackUrl });
      form.reset({ newPassword: '', confirmPassword: '' });
      router.replace(outcome.redirectTo);
      router.refresh();
    } catch (error) {
      if (isApiClientError(error) && error.code === 'password_change_expired') {
        setExpired(true);
        setTimeout(() => router.replace('/login?reason=expired'), 2500);
        return;
      }
      applyServerError(form, error, undefined, { translate: translateIssue });
    }
  };

  return (
    <div className="space-y-5">
      <Alert
        tone="warning"
        title={reason === 'EXPIRED' ? t('passwordChange.expired') : t('passwordChange.reset')}
      />
      {expired ? <Alert tone="danger" title={t('errors.password_change_expired')} /> : null}

      <Form form={form} onSubmit={onSubmit} className="space-y-4">
        <FormField<Values>
          name="newPassword"
          label={t('passwordChange.newPassword')}
          render={({ field, aria }) => (
            <SecretInput
              {...aria}
              ref={field.ref}
              name={field.name}
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              storage={credentialStorage}
              purpose="new"
              labels={labels}
              autoFocus
              placeholder={t('passwordChange.newPasswordPlaceholder')}
              className="h-10 text-sm"
              startAdornment={<KeyRound className="text-secondary opacity-80" />}
            />
          )}
        />
        <PasswordChecklist
          value={value}
          rules={policy.data}
          historyCount={policy.data?.historyCount}
        />
        <FormField<Values>
          name="confirmPassword"
          label={t('passwordChange.confirmPassword')}
          render={({ field, aria }) => (
            <SecretInput
              {...aria}
              ref={field.ref}
              name={field.name}
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              storage={credentialStorage}
              purpose="new"
              labels={labels}
              placeholder={t('passwordChange.confirmPlaceholder')}
              className="h-10 text-sm"
              startAdornment={<Lock className="text-secondary opacity-80" />}
            />
          )}
        />
        <FormRootError referenceLabel={tc('reference')} />
        <SubmitButton className="h-10 w-full" disabled={expired}>
          {t('passwordChange.submit')}
        </SubmitButton>
      </Form>
      <p className="text-center text-[13px]">
        <Link href="/login" className="font-semibold text-secondary hover:underline">
          {t('passwordChange.backToSignIn')}
        </Link>
      </p>
    </div>
  );
}
