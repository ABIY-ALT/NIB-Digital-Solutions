import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { siteUrl } from '@/features/marketplace/api/site-url';
import { SiteFrame } from './site-frame';

/** Rendered per request: products published in the admin portal appear immediately. */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('marketplace.meta');
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: t('title'), template: '%s · NIB Digital Solutions' },
    description: t('description'),
    // The staff app is noindex; the public marketplace is meant to be found.
    robots: { index: true, follow: true },
    openGraph: { siteName: 'NIB Digital Solutions', type: 'website' },
  };
}

/** NIB Digital Solutions marketplace (public, no session needed). */
export default function SiteLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <SiteFrame>{children}</SiteFrame>;
}
