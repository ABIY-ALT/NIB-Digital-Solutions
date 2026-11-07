import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { IdeasPage } from '@/features/marketplace/components/site/ideas-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('marketplace.ideas');
  return { title: t('title'), description: t('meta'), alternates: { canonical: '/ideas' } };
}

export default function Page() {
  return <IdeasPage />;
}
