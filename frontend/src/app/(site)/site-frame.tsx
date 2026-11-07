import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { getCatalog } from '@/features/marketplace/api/catalog.server';
import { MarketplaceProvider } from '@/features/marketplace/components/site/marketplace-provider';
import { SiteChrome } from '@/features/marketplace/components/site/site-shell';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

/**
 * The public website frame (fonts, catalogue, header, footer, assistant): used
 * by the (site) layout and by the page-not-found screen, so both look the same.
 * The catalogue never throws (it returns an "unavailable" state instead).
 */
export async function SiteFrame({ children }: { children: ReactNode }) {
  const { products, categories, industries, needs } = await getCatalog();
  return (
    <div className={`${inter.variable} ${jakarta.variable}`}>
      <MarketplaceProvider
        products={products}
        categories={categories}
        industries={industries}
        needs={needs}
      >
        <SiteChrome>{children}</SiteChrome>
      </MarketplaceProvider>
    </div>
  );
}
