import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getPendingPasswordChange } from '@/features/auth/api/password-change';
import { PasswordChangeForm } from '@/features/auth/components/password-change-form';
import { appConfig } from '@/infrastructure/config/app.config';

export const metadata: Metadata = { title: 'Choose a new password' };

/** Sign-in step shown when the password expired or was set by an administrator. */
export default async function PasswordChangePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ callbackUrl?: string }>;
}>) {
  const t = await getTranslations('auth.passwordChange');
  const pending = await getPendingPasswordChange();
  if (!pending) redirect('/login?reason=expired');
  const { callbackUrl } = await searchParams;
  return (
    <>
      <h1 className="mb-5 text-center text-[22px] leading-tight font-bold">{t('title')}</h1>
      {/* Only the reason reaches the browser — never the change token. */}
      <PasswordChangeForm
        reason={pending.reason}
        callbackUrl={callbackUrl}
        credentialStorage={appConfig.auth.credentialStorage}
      />
    </>
  );
}
