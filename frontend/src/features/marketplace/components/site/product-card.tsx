'use client';

import { ArrowUpRight, Check, PlayCircle } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { iconFor } from '../../icons';
import { AVAILABILITIES } from '../../taxonomy';
import type { MarketplaceProduct } from '../../types';
import { useMarketplace } from './marketplace-provider';
import { SiteButton } from './primitives';
import { ProductScreen, tint } from './product-screen';
import { RatingLine } from './ratings';

export function ProductIcon({
  product,
  size = 'md',
  className,
}: {
  product: Pick<MarketplaceProduct, 'icon' | 'accent'>;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const Icon = iconFor(product.icon);
  const s = {
    sm: 'h-9 w-9 rounded-xl [&>svg]:h-4.5 [&>svg]:w-4.5',
    md: 'h-11 w-11 rounded-xl [&>svg]:h-5.5 [&>svg]:w-5.5',
    lg: 'h-14 w-14 rounded-2xl [&>svg]:h-7 [&>svg]:w-7',
  }[size];
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center', s, className)}
      style={{ background: tint(product.accent, 0.12), color: product.accent }}
    >
      <Icon aria-hidden />
    </span>
  );
}

/** Brand-toned availability styles; unknown future states fall back to the neutral style. */
const AVAILABILITY_STYLE: Record<string, string> = {
  available: 'bg-white text-brown-800 ring-1 ring-line [&>span]:bg-emerald-500',
  pilot: 'bg-gold-50 text-gold-800 ring-1 ring-gold-200 [&>span]:bg-gold-500',
  coming_soon: 'bg-brown-50 text-brown-700 ring-1 ring-brown-200 [&>span]:bg-brown-400',
  in_development: 'bg-sky-50 text-sky-800 ring-1 ring-sky-200 [&>span]:bg-sky-500',
  temporarily_unavailable:
    'bg-slate-100 text-slate-700 ring-1 ring-slate-200 [&>span]:bg-slate-400',
};

/**
 * Availability of a product. By default only non-standard states are shown
 * (pilot, coming soon); `always` also labels products that are available now.
 */
export function AvailabilityBadge({
  product,
  always = false,
  className,
}: {
  product: MarketplaceProduct;
  always?: boolean;
  className?: string;
}) {
  const t = useTranslations('marketplace');
  if (product.availability === 'available' && !always) return null;
  const known = AVAILABILITIES.includes(product.availability);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap',
        AVAILABILITY_STYLE[product.availability] ?? AVAILABILITY_STYLE.coming_soon,
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full" aria-hidden />
      {known ? t(`availability.${product.availability}`) : product.availability.replace(/_/g, ' ')}
    </span>
  );
}

export function ProductCard({
  product,
  layout = 'showcase',
  source = 'catalog',
}: {
  product: MarketplaceProduct;
  layout?: 'showcase' | 'compact';
  source?: 'homepage' | 'catalog';
}) {
  const t = useTranslations('marketplace');
  const { openVideo, openDemoRequest, categoryName, industry: industryOf } = useMarketplace();
  const industry = product.industries[0];
  const shot = product.content.screenshots[0];
  const href = `/products/${product.slug}`;
  const demo = product.content.demo;
  const category = categoryName(product.categoryCode);

  return (
    <article className="card-accent group relative flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-line bg-white shadow-tile transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1.5 hover:border-gold-200 hover:shadow-card-hover">
      {layout === 'showcase' && (
        <Link
          href={href}
          className="relative block overflow-hidden bg-gradient-to-br from-cream to-brown-50 px-5 pt-5"
          tabIndex={-1}
          aria-hidden
        >
          <div
            className="honeycomb-bg absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_top_right,black_10%,transparent_65%)]"
            aria-hidden
          />
          <div
            className="absolute -right-10 -bottom-16 h-40 w-40 rounded-full opacity-25 blur-2xl transition-opacity duration-500 group-hover:opacity-50"
            style={{ background: product.accent }}
            aria-hidden
          />
          <ProductScreen
            product={product}
            variant={shot?.variant ?? 'dashboard'}
            imageUrl={shot?.imageUrl}
            className="relative translate-y-3 rounded-t-xl shadow-[0_-6px_28px_-10px_rgb(61_35_18/0.35)] transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-y-0 group-hover:scale-[1.02]"
          />
          <div className="absolute top-3.5 left-3.5 flex flex-wrap gap-1.5">
            <AvailabilityBadge product={product} always className="shadow-tile" />
          </div>
          {demo && (
            <span className="absolute top-3.5 right-3.5 inline-flex items-center gap-1.5 rounded-full bg-brown-700/85 px-2.5 py-1 text-[11px] font-semibold text-white shadow-tile backdrop-blur">
              <PlayCircle className="h-3.5 w-3.5 text-gold-300" />{' '}
              {t('card.demoBadge', { duration: demo.duration })}
            </span>
          )}
        </Link>
      )}
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-start gap-3.5">
          <ProductIcon product={product} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold tracking-[0.1em] text-gold-700 uppercase">
              <span>{category ?? t('common.business')}</span>
            </p>
            <h3 className="mt-1 text-lg leading-snug font-bold">
              <Link
                href={href}
                className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
              >
                {product.name}
              </Link>
            </h3>
            {industry && industryOf(industry) ? (
              <p className="mt-0.5 text-xs text-charcoal/55">{industryOf(industry)?.short}</p>
            ) : null}
          </div>
          {layout === 'compact' && (
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <AvailabilityBadge product={product} />
              {demo && (
                <span className="inline-flex items-center gap-1 rounded-full bg-gold-50 px-2 py-0.5 text-[11px] font-semibold text-gold-800 ring-1 ring-gold-200">
                  <PlayCircle className="h-3 w-3" /> {t('card.demo')}
                </span>
              )}
            </div>
          )}
        </div>
        {/* Fixed two-line summary keeps cards in a row the same height. */}
        <p className="mt-3.5 line-clamp-2 min-h-[2.75rem] text-sm leading-relaxed text-charcoal/80">
          {product.summary}
        </p>
        {/* Reserved height, so rated and unrated cards in a row line up. */}
        <div className="mt-3 min-h-5">
          <RatingLine product={product} />
        </div>
        {product.keyFeatures.length > 0 && (
          <div className="mt-4 rounded-2xl bg-cream/70 p-3.5 ring-1 ring-line/70">
            <p className="sr-only">{t('card.keyFeatures')}</p>
            <ul className="space-y-1.5">
              {product.keyFeatures.slice(0, 3).map((f) => (
                <li
                  key={f}
                  className="flex items-start gap-2 text-[13px] leading-snug text-charcoal"
                >
                  <span className="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gold-500/20">
                    <Check className="h-3 w-3 text-brown-700" aria-hidden strokeWidth={3} />
                  </span>
                  <span className="line-clamp-1">{f}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-auto pt-6">
          <div className="relative z-10 flex flex-wrap items-center gap-2">
            <SiteButton
              href={href}
              size="sm"
              variant="secondary"
              iconRight={<ArrowUpRight className="h-4 w-4" />}
            >
              {t('card.viewDetails')}
            </SiteButton>
            <SiteButton
              size="sm"
              variant="outline"
              onClick={() =>
                openDemoRequest({
                  productSlug: product.slug,
                  source: source === 'homepage' ? 'homepage' : 'product_card',
                })
              }
            >
              {t('card.requestDemo')}
            </SiteButton>
            {demo ? (
              <SiteButton
                size="icon"
                variant="ghost"
                className="ml-auto h-9 w-9"
                onClick={() => openVideo(product)}
                aria-label={`${t('card.watchDemo')}: ${product.name}`}
                title={t('card.watchDemo')}
              >
                <PlayCircle className="h-5 w-5 text-gold-700" />
              </SiteButton>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
