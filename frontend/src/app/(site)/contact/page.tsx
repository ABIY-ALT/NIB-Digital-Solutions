import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ContactPage } from '@/features/marketplace/components/site/info-pages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('marketplace.info.contact');
  return { title: t('eyebrow'), description: t('meta'), alternates: { canonical: '/contact' } };
}

export default function Page() {
  return <ContactPage />;
}
