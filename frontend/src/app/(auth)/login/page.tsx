import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { SignInErrorCode } from '@/features/auth/types';
import { LoginForm } from '@/features/auth/components/login-form';
import { appConfig } from '@/infrastructure/config/app.config';
import { env } from '@/infrastructure/config/env';

export const metadata: Metadata = { title: 'Sign in' };

const REASONS = ['idle', 'expired', 'signed_out', 'password_reset'] as const;

export default async function LoginPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | undefined>>;
}>) {
  const t = await getTranslations('auth');
  const sp = await searchParams;
  const reason = REASONS.find((r) => r === sp.reason);
  return (
    <>
      <div className="mb-5 text-center">
        <h1 className="text-[22px] leading-tight font-bold">{t('signInTitle')}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {t('subtitle', { app: appConfig.app.name })}
        </p>
      </div>
      <LoginForm
        callbackUrl={sp.callbackUrl}
        reason={reason}
        ssoEnabled={appConfig.auth.showSsoButton && env().oidcEnabled}
        ssoName={env().AUTH_OIDC_NAME}
        initialError={sp.error as SignInErrorCode | undefined}
        credentialStorage={appConfig.auth.credentialStorage}
        forgotPasswordUrl={appConfig.app.links.forgotPassword}
      />
    </>
  );
}
