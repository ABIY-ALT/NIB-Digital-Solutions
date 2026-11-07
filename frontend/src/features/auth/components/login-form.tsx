'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, CircleHelp, KeyRound, Lock, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn as startSso } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { isApiClientError } from '@/shared/errors/api-client-error';
import { Button } from '@/shared/ui/button';
import { Alert } from '@/shared/ui/feedback';
import { Form, FormField, SubmitButton } from '@/shared/ui/form';
import { Input } from '@/shared/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { SecretInput } from '@/shared/ui/secret-input';
import { LoadingOverlay } from '@/shared/ui/spinner';
import { useLogin } from '../hooks/use-auth';
import type { SignInErrorCode } from '../types';

type Reason = 'idle' | 'expired' | 'signed_out' | 'password_reset';

const SIGN_IN_CODES: ReadonlySet<string> = new Set([
  'invalid_credentials',
  'account_locked',
  'account_disabled',
  'mfa_invalid',
  'mfa_expired',
  'mfa_too_many',
  'password_change_expired',
  'rate_limited',
  'unavailable',
]);

/** Seconds left until `until` (ms timestamp), ticking every second; 0 when elapsed. */
function useCountdown(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Every sign-in attempt shows the loader at least this long, however fast the backend answers. */
const MIN_SIGN_IN_MS = 2000;

/**
 * Sign-in form → POST /api/auth/login (Next.js) → NestJS /auth/login.
 *
 * Banking behaviours (NIB IB parity):
 *   • credentialStorage="block": browsers/password managers never capture or
 *     autofill credentials — the password is masked via -webkit-text-security
 *     instead of type="password" (Chromium only offers to save type=password or
 *     *-password autocomplete fields), autofill hints are off, copy/cut are
 *     blocked and the value is wiped after every attempt;
 *   • Caps Lock warning; Show/Hide toggle; lock-out / rate-limit countdown;
 *   • "Forgot password?" → reset page when configured, otherwise help-desk guidance.
 */
export function LoginForm({
  callbackUrl,
  reason,
  ssoEnabled,
  ssoName,
  initialError,
  credentialStorage,
  forgotPasswordUrl,
}: Readonly<{
  callbackUrl?: string;
  reason?: Reason;
  ssoEnabled: boolean;
  ssoName: string;
  initialError?: SignInErrorCode;
  credentialStorage: 'block' | 'allow';
  forgotPasswordUrl?: string;
}>) {
  const t = useTranslations('auth');
  const router = useRouter();
  const login = useLogin();
  const block = credentialStorage === 'block';
  const [error, setError] = useState<SignInErrorCode | null>(
    initialError && SIGN_IN_CODES.has(initialError) ? initialError : null,
  );
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const waitSeconds = useCountdown(retryAt);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const [ssoPending, startSsoTransition] = useTransition();
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (retryAt && waitSeconds === 0) setRetryAt(null);
  }, [retryAt, waitSeconds]);

  const schema = z.object({
    username: z.string().trim().min(1, t('validation.usernameRequired')).max(64),
    password: z.string().min(1, t('validation.passwordRequired')).max(256),
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '' },
  });

  /** Wipe the secret from React state AND the DOM node (before any navigation). */
  const wipePassword = () => {
    if (passwordRef.current) passwordRef.current.value = '';
    form.resetField('password');
  };

  const onSubmit = async (values: Values) => {
    setError(null);
    setSigningIn(true);
    const minWait = new Promise<void>((resolve) => setTimeout(resolve, MIN_SIGN_IN_MS));
    try {
      const outcome = await login.mutateAsync({ ...values, callbackUrl });
      wipePassword();
      // The loader stays up through the navigation below (this form unmounts).
      await minWait;
      if (outcome.status !== 'AUTHENTICATED') {
        // Next step of sign-in: second factor, or a new password (expired / temporary).
        router.push(outcome.redirectTo);
        return;
      }
      router.replace(outcome.redirectTo);
      router.refresh();
    } catch (err) {
      wipePassword();
      await minWait;
      setSigningIn(false);
      const code =
        isApiClientError(err) && SIGN_IN_CODES.has(err.code)
          ? (err.code as SignInErrorCode)
          : 'unavailable';
      setError(code);
      if (isApiClientError(err) && err.retryAfterSeconds) {
        setRetryAt(Date.now() + err.retryAfterSeconds * 1000);
      }
      passwordRef.current?.focus();
    }
  };

  const noStorageProps = block
    ? { 'data-lpignore': 'true', 'data-1p-ignore': 'true', 'data-form-type': 'other' }
    : {};
  const locked = waitSeconds > 0;
  const reasonTone = reason === 'signed_out' || reason === 'password_reset' ? 'success' : 'warning';
  let submitLabel: ReactNode;
  if (locked) {
    submitLabel = t('retryIn', { time: mmss(waitSeconds) });
  } else if (signingIn) {
    submitLabel = t('signingIn');
  } else {
    submitLabel = (
      <>
        {t('signIn')}
        <ArrowRight className="rtl:rotate-180" />
      </>
    );
  }

  return (
    <div className="space-y-5">
      <LoadingOverlay
        active={signingIn}
        fullscreen
        variant="orbit"
        size="xl"
        delayMs={0}
        label={t('signingIn')}
      />
      {reason && !error ? <Alert tone={reasonTone} title={t(`reasons.${reason}`)} /> : null}
      {error ? (
        <Alert tone="danger" title={t(`errors.${error}`)}>
          {locked ? t('retryIn', { time: mmss(waitSeconds) }) : null}
        </Alert>
      ) : null}

      <Form form={form} onSubmit={onSubmit} className="space-y-4">
        <FormField<Values>
          name="username"
          label={t('username')}
          render={({ field, aria }) => (
            <Input
              {...aria}
              {...noStorageProps}
              ref={field.ref}
              name={field.name}
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              autoComplete={block ? 'off' : 'username'}
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              placeholder={t('usernamePlaceholder')}
              className="h-10 text-sm"
              startAdornment={<User className="text-secondary opacity-80" />}
            />
          )}
        />
        <FormField<Values>
          name="password"
          label={t('password')}
          render={({ field, aria }) => (
            <SecretInput
              {...aria}
              ref={(el) => {
                field.ref(el);
                passwordRef.current = el;
              }}
              name={field.name}
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              storage={credentialStorage}
              purpose="current"
              labels={{
                show: t('show'),
                hide: t('hide'),
                showPassword: t('showPassword'),
                hidePassword: t('hidePassword'),
                capsLock: t('capsLock'),
              }}
              placeholder={t('passwordPlaceholder')}
              className="h-10 text-sm"
              startAdornment={<Lock className="text-secondary opacity-80" />}
            />
          )}
        />

        <div>
          {forgotPasswordUrl ? (
            <Link
              href={forgotPasswordUrl}
              className="text-[13px] font-semibold text-secondary hover:underline"
            >
              {t('forgotPassword')}
            </Link>
          ) : (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="rounded-item text-[13px] font-semibold text-secondary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t('forgotPassword')}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3.5 text-xs leading-relaxed text-muted-foreground">
                <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <CircleHelp className="size-4 text-secondary" aria-hidden />
                  {t('forgotTitle')}
                </p>
                {t('forgotHelp')}
              </PopoverContent>
            </Popover>
          )}
        </div>

        <SubmitButton className="h-10 w-full" disabled={locked}>
          {submitLabel}
        </SubmitButton>
      </Form>

      {ssoEnabled ? (
        <>
          <div className="flex items-center gap-3 text-xs text-subtle-foreground">
            <span className="h-px flex-1 bg-border" />
            {t('or')}
            <span className="h-px flex-1 bg-border" />
          </div>
          {/* Auth.js OIDC flow via its Next.js API route (/api/auth/signin/oidc). */}
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            loading={ssoPending}
            onClick={() =>
              startSsoTransition(() =>
                startSso('oidc', { redirectTo: callbackUrl ?? '/dashboard' }),
              )
            }
          >
            <KeyRound />
            {t('ssoButton', { provider: ssoName })}
          </Button>
        </>
      ) : null}
    </div>
  );
}
