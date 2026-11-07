import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import {
  InvalidResetLink,
  ResetPasswordForm,
} from '@/features/auth/components/reset-password-form';
import { appConfig } from '@/infrastructure/config/app.config';

// The token is in the URL: never send this address to other sites.
export const metadata: Metadata = { title: 'Choose a new password', referrer: 'no-referrer' };

const TOKEN = /^[A-Za-z0-9_-]{20,128}$/;

/** Self-service password reset, step 2: opened from the e-mailed link. */
export default async function ResetPasswordPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ token?: string }>;
}>) {
  const t = await getTranslations('auth.reset');
  const { token } = await searchParams;
  return (
    <>
      <h1 className="mb-3 text-center text-[22px] leading-tight font-bold">{t('title')}</h1>
      {token && TOKEN.test(token) ? (
        <ResetPasswordForm token={token} credentialStorage={appConfig.auth.credentialStorage} />
      ) : (
        <InvalidResetLink />
      )}
    </>
  );
}
