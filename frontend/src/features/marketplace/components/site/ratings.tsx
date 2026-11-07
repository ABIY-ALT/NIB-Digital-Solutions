'use client';

import { Star } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import type { MarketplaceProduct } from '../../types';

const SIZES = { xs: 'h-3.5 w-3.5', sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-6 w-6' } as const;

/**
 * Five stars filled to `value` (fractions shown as a partly filled star). The
 * stars are decoration: the accessible text is the label.
 */
export function Stars({
  value,
  size = 'sm',
  className,
}: {
  value: number;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const t = useTranslations('marketplace.reviews');
  const clamped = Math.max(0, Math.min(5, value));
  return (
    <span
      role="img"
      aria-label={t('stars', { rating: clamped.toFixed(1) })}
      className={cn('relative inline-flex shrink-0', className)}
    >
      <span className="flex gap-0.5 text-line" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} className={cn(SIZES[size], 'fill-current')} />
        ))}
      </span>
      <span
        className="absolute inset-y-0 left-0 flex gap-0.5 overflow-hidden text-gold-500"
        style={{ width: `${(clamped / 5) * 100}%` }}
        aria-hidden
      >
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} className={cn(SIZES[size], 'shrink-0 fill-current')} />
        ))}
      </span>
    </span>
  );
}

/**
 * "★★★★★ 4.8 · 24 reviews" for a product, linking to its reviews. Products
 * without an approved review show nothing, or an invitation to be the first.
 */
export function RatingLine({
  product,
  invite = false,
  dark = false,
  className,
}: {
  product: MarketplaceProduct;
  /** Without reviews, show "Be the first to rate" instead of nothing. */
  invite?: boolean;
  dark?: boolean;
  className?: string;
}) {
  const t = useTranslations('marketplace.reviews');
  const locale = useLocale();
  const href = `/products/${product.slug}#reviews`;
  const linkClass = cn(
    'relative z-10 underline-offset-4 hover:underline',
    dark ? 'text-gold-100' : 'text-brown-700',
  );
  if (!product.rating) {
    return invite ? (
      <p className={cn('flex items-center gap-2 text-sm', className)}>
        <Stars value={0} size="sm" />
        <Link href={href} className={linkClass}>
          {t('beFirst')}
        </Link>
      </p>
    ) : null;
  }
  return (
    <p className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-sm', className)}>
      <Stars value={product.rating.average} size="sm" />
      <span className={cn('font-bold', dark ? 'text-white' : 'text-brown-900')}>
        {product.rating.average.toLocaleString(locale, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })}
      </span>
      <Link href={href} className={linkClass}>
        {t('count', { count: product.rating.count })}
      </Link>
    </p>
  );
}
