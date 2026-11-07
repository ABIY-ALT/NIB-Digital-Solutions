import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ForgotPasswordForm } from '@/features/auth/components/forgot-password-form';
import { appConfig } from '@/infrastructure/config/app.config';

export const metadata: Metadata = { title: 'Forgot password' };

/** Self-service password reset, step 1: ask for a reset link by e-mail. */
export default async function ForgotPasswordPage() {
  // Off unless the product links to it (app.links.forgotPassword).
  if (!appConfig.app.links.forgotPassword) notFound();
  const t = await getTranslations('auth.forgot');
  return (
    <>
      <h1 className="mb-3 text-center text-[22px] leading-tight font-bold">{t('title')}</h1>
      <ForgotPasswordForm />
    </>
  );
}
