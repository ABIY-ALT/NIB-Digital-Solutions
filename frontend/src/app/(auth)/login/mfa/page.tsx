import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getPendingMfa } from '@/features/auth/api/mfa-challenge';
import { MfaForm } from '@/features/auth/components/mfa-form';

export const metadata: Metadata = { title: 'Verify' };

export default async function MfaPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ callbackUrl?: string }>;
}>) {
  const t = await getTranslations('auth.mfa');
  const pending = await getPendingMfa();
  if (!pending) redirect('/login?reason=expired');
  const { callbackUrl } = await searchParams;
  return (
    <>
      <h1 className="mb-5 text-center text-[22px] leading-tight font-bold">{t('title')}</h1>
      {/* Only the method and a safe hint reach the browser — never the challenge id. */}
      <MfaForm method={pending.method} hint={pending.deliveryHint} callbackUrl={callbackUrl} />
    </>
  );
}
