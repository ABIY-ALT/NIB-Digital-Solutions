'use client';

import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { isApiClientError } from '@/shared/errors/api-client-error';
import { Button } from '@/shared/ui/button';
import { Alert } from '@/shared/ui/feedback';
import { OtpInput } from '@/shared/ui/otp-input';
import type { SignInErrorCode } from '../types';
import { useVerifyMfa } from '../hooks/use-auth';

/** MFA step → POST /api/auth/mfa (Next.js) → NestJS /auth/mfa/verify. */
export function MfaForm({
  method,
  hint,
  callbackUrl,
}: Readonly<{
  method: 'TOTP' | 'SMS';
  hint?: string;
  callbackUrl?: string;
}>) {
  const t = useTranslations('auth');
  const router = useRouter();
  const verify = useVerifyMfa();
  const [code, setCode] = useState('');
  const [error, setError] = useState<SignInErrorCode | null>(null);

  const submit = (value = code) => {
    if (!/^\d{6}$/.test(value)) {
      setError('mfa_invalid');
      return;
    }
    setError(null);
    verify.mutate(
      { code: value, callbackUrl },
      {
        onSuccess: (outcome) => {
          router.replace(outcome.redirectTo);
          router.refresh();
        },
        onError: (err) => {
          const next = (isApiClientError(err) ? err.code : 'unavailable') as SignInErrorCode;
          setCode('');
          setError(next);
          if (next === 'mfa_expired' || next === 'mfa_too_many')
            setTimeout(() => router.replace('/login'), 2500);
        },
      },
    );
  };

  return (
    <form
      // POST: before hydration a native GET would put the code in the URL (see shared/ui/form.tsx).
      method="post"
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary-text">
          <ShieldCheck className="size-6" aria-hidden />
        </span>
        <p className="text-sm text-muted-foreground">
          {method === 'SMS' ? t('mfa.smsInstructions') : t('mfa.totpInstructions')}
        </p>
        {hint && method === 'SMS' ? <p className="text-xs font-medium">{hint}</p> : null}
      </div>

      {error ? <Alert tone="danger" title={t(`errors.${error}`)} /> : null}

      <OtpInput
        value={code}
        onChange={setCode}
        onComplete={(v) => submit(v)}
        disabled={verify.isPending}
        invalid={!!error}
        autoFocus
        aria-label={t('mfa.codeLabel')}
      />

      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={verify.isPending}
        disabled={code.length !== 6}
      >
        {t('mfa.verify')}
      </Button>
      <p className="text-center text-xs">
        <Link href="/login" className="text-primary-text hover:underline">
          {t('mfa.backToSignIn')}
        </Link>
      </p>
    </form>
  );
}
