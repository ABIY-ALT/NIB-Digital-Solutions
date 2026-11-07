'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert } from '@/shared/ui/feedback';
import { Form, FormRootError, SubmitButton, TextField } from '@/shared/ui/form';
import { useForgotPassword } from '../hooks/use-auth';

/**
 * "Forgot password" → POST /api/auth/password/forgot (Next.js) → NestJS
 * /auth/password/forgot. The answer is the same whether or not the account
 * exists, so the confirmation never says that an e-mail was actually sent.
 */
export function ForgotPasswordForm() {
  const t = useTranslations('auth.forgot');
  const tc = useTranslations('common');
  const forgot = useForgotPassword();
  const [sentTo, setSentTo] = useState<string | null>(null);

  const schema = z.object({ identifier: z.string().trim().min(1, t('required')).max(254) });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: '' },
  });

  if (sentTo) {
    return (
      <div className="space-y-5">
        <Alert tone="success" title={t('sentTitle')}>
          {t('sentBody', { identifier: sentTo })}
        </Alert>
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <MailCheck className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden />
          {t('sentHint')}
        </p>
        <BackToSignIn label={t('backToSignIn')} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-center text-sm text-muted-foreground">{t('intro')}</p>
      <Form
        form={form}
        onSubmit={async ({ identifier }) => {
          await forgot.mutateAsync({ identifier });
          setSentTo(identifier);
        }}
        className="space-y-4"
      >
        <TextField<Values>
          name="identifier"
          label={t('identifier')}
          placeholder={t('identifierPlaceholder')}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          className="[&_input]:h-10"
          startAdornment={<UserRound className="text-secondary opacity-80" />}
        />
        <FormRootError referenceLabel={tc('reference')} />
        <SubmitButton className="h-10 w-full">{t('submit')}</SubmitButton>
      </Form>
      <BackToSignIn label={t('backToSignIn')} />
    </div>
  );
}

export function BackToSignIn({ label }: Readonly<{ label: string }>) {
  return (
    <p className="text-center text-[13px]">
      <Link href="/login" className="font-semibold text-secondary hover:underline">
        {label}
      </Link>
    </p>
  );
}
