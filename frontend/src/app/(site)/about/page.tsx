import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AboutPage } from '@/features/marketplace/components/site/info-pages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('marketplace.info.about');
  return { title: t('eyebrow'), description: t('meta'), alternates: { canonical: '/about' } };
}

export default function Page() {
  return <AboutPage />;
}
