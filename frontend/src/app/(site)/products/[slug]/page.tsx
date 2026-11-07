import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublishedProduct } from '@/features/marketplace/api/catalog.server';
import { ProductPage } from '@/features/marketplace/components/site/product-page';
import { EN } from '@/features/marketplace/taxonomy';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getPublishedProduct((await params).slug);
  if (!product) return { title: 'Product not found', robots: { index: false } };
  return {
    title: `${product.name} — ${product.tagline}`,
    description: product.summary,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: { title: product.name, description: product.summary, type: 'website' },
  };
}

export default async function Page({ params }: Props) {
  const product = await getPublishedProduct((await params).slug);
  if (!product) notFound();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: product.name,
    description: product.summary,
    applicationCategory: 'BusinessApplication',
    operatingSystem: product.platforms.map((p) => EN.platform[p]).join(', '),
    featureList: product.keyFeatures,
    provider: { '@type': 'Organization', name: 'NIB International Bank' },
  };
  return (
    <>
      {/* Structured data (not executable, so the CSP nonce does not apply). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\u003c') }}
      />
      <ProductPage product={product} />
    </>
  );
}
