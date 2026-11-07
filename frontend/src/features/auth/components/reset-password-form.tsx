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
import { usePasswordPolicy, useResetPassword } from '../hooks/use-auth';
import { BackToSignIn } from './forgot-password-form';

/**
 * Opened from the e-mailed link → POST /api/auth/password/reset (Next.js) →
 * NestJS /auth/password/reset. On success the user signs in normally with the
 * new password (no session is created here, so MFA still applies).
 */
export function ResetPasswordForm({
  token,
  credentialStorage,
}: Readonly<{
  token: string;
  credentialStorage: 'block' | 'allow';
}>) {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const router = useRouter();
  const reset = useResetPassword();
  const policy = usePasswordPolicy();
  const translateIssue = usePasswordIssueTranslator();
  const [invalid, setInvalid] = useState(false);

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

  if (invalid) return <InvalidResetLink />;

  const onSubmit = async (values: Values) => {
    try {
      await reset.mutateAsync({ token, newPassword: values.newPassword });
      form.reset({ newPassword: '', confirmPassword: '' });
      router.replace('/login?reason=password_reset');
    } catch (error) {
      if (isApiClientError(error) && error.code === 'AUTH_PASSWORD_RESET_INVALID') {
        setInvalid(true);
        return;
      }
      applyServerError(form, error, undefined, { translate: translateIssue });
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-center text-sm text-muted-foreground">{t('reset.intro')}</p>
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
        <SubmitButton className="h-10 w-full">{t('reset.submit')}</SubmitButton>
      </Form>
      <BackToSignIn label={t('passwordChange.backToSignIn')} />
    </div>
  );
}

/** The link is missing, was already used or has expired. */
export function InvalidResetLink() {
  const t = useTranslations('auth');
  return (
    <div className="space-y-5">
      <Alert tone="danger" title={t('reset.invalidTitle')}>
        {t('reset.invalidBody')}
      </Alert>
      <p className="text-center text-[13px]">
        <Link href="/forgot-password" className="font-semibold text-secondary hover:underline">
          {t('reset.requestNew')}
        </Link>
      </p>
      <BackToSignIn label={t('passwordChange.backToSignIn')} />
    </div>
  );
}
