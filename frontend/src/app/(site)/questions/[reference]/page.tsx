import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { QuestionPage } from '@/features/marketplace/components/site/question-page';

const REFERENCE = /^QST-\d{6}-[A-Z0-9]{5}$/;
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('marketplace.questions');
  // Private conversation: never indexed, and the token must not leak via Referer.
  return {
    title: t('metaTitle'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const { reference } = await params;
  const { t } = await searchParams;
  const ref = reference.toUpperCase();
  const token = typeof t === 'string' && TOKEN.test(t) ? t : null;
  return (
    <QuestionPage
      reference={REFERENCE.test(ref) ? ref : reference}
      token={REFERENCE.test(ref) ? token : null}
    />
  );
}
