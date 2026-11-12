'use client';

import { ArrowUpRight, Pause, Play, PlayCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState, type CSSProperties } from 'react';
import { cn } from '@/shared/lib/cn';
import { FEATURED_STORIES } from '../../showcase';
import { isUpcoming } from '../../taxonomy';
import type { MarketplaceProduct } from '../../types';
import { SectionHeader } from './home-sections';
import { useMarketplace } from './marketplace-provider';
import { SiteButton } from './primitives';
import { AvailabilityBadge, ProductIcon } from './product-card';
import { ProductScreen } from './product-screen';
import { RatingLine } from './ratings';

// ─────────────────────────────────────────────────────────────────────────────
// Homepage "Featured solutions": every featured, launched product as a card in
// an endless horizontal row (the product's screen, demo, customer rating and
// one approved review). Hover or keyboard focus pauses it, a Pause button stops
// it; with reduced motion it is a still, swipeable list. Featured products are
// chosen in the product editor; FEATURED_STORIES only sets their order.
// ─────────────────────────────────────────────────────────────────────────────

/** Each copy of the row holds at least this many cards, so the loop has no gap on wide screens. */
const MIN_CARDS_PER_COPY = 6;
/** Scroll speed: seconds per card. */
const SECONDS_PER_CARD = 9;

const shortName = (p: MarketplaceProduct) => p.name.split(/ [–-] /)[0] ?? p.name;

/** Featured, launched products: the storytelling order first, then by name. */
export function featuredProducts(products: readonly MarketplaceProduct[]): MarketplaceProduct[] {
  const rank = (p: MarketplaceProduct) => {
    const i = (FEATURED_STORIES as readonly string[]).indexOf(p.slug);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return products
    .filter((p) => p.featured && !isUpcoming(p))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

function FeaturedCard({ product: p }: { product: MarketplaceProduct }) {
  const t = useTranslations('marketplace');
  const { categoryName, openVideo, openDemoRequest } = useMarketplace();
  const shot =
    p.content.screenshots.find((s) => s.variant !== 'mobile') ?? p.content.screenshots[0];
  const demo = p.content.demo;
  const review = p.featuredReview;

  return (
    <article className="group/card flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-line bg-white shadow-tile transition-[transform,box-shadow] duration-500 hover:-translate-y-1.5 hover:shadow-card-hover">
      <div
        className="relative h-52 overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${p.accent}, ${p.accent}b3)` }}
      >
        <div
          className="absolute inset-0 bg-[radial-gradient(60%_80%_at_85%_0%,rgb(255_255_255/0.3),transparent_60%)]"
          aria-hidden
        />
        <div className="absolute inset-x-6 top-6 transition-transform duration-700 group-hover/card:-translate-y-1.5 group-hover/card:scale-[1.02]">
          <ProductScreen
            product={p}
            variant={shot?.variant ?? 'dashboard'}
            imageUrl={shot?.imageUrl}
            alt={shot?.title ?? p.name}
            className="rounded-xl shadow-[0_24px_50px_-20px_rgb(0_0_0/0.55)]"
          />
        </div>
        {demo ? (
          <button
            type="button"
            onClick={() => openVideo(p)}
            className="absolute bottom-3.5 left-4 inline-flex h-9 items-center gap-2 rounded-full bg-white/95 pr-3.5 pl-1.5 text-xs font-bold text-brown-900 shadow-lift transition hover:bg-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
          >
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full text-white"
              style={{ background: p.accent }}
            >
              <PlayCircle className="h-4 w-4" aria-hidden />
            </span>
            {t('home.stories.watch', { duration: demo.duration })}
          </button>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-center gap-3">
          <ProductIcon product={p} />
          <p className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-[0.1em] text-gold-700 uppercase">
            {categoryName(p.categoryCode)}
          </p>
          <AvailabilityBadge product={p} />
        </div>
        <h3 className="mt-4 text-xl leading-snug font-extrabold tracking-[-0.02em]">{p.name}</h3>
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-charcoal/80">
          {p.tagline || p.summary}
        </p>
        <RatingLine product={p} invite className="mt-4" />
        {review ? (
          <figure className="mt-3.5 rounded-2xl border border-gold-100 bg-gold-50/50 px-4 py-3">
            <blockquote className="line-clamp-3 text-sm leading-relaxed text-brown-900 italic">
              “{review.body}”
            </blockquote>
            <figcaption className="mt-1.5 truncate text-xs text-charcoal/60">
              {[review.reviewerName ?? t('reviews.anonymous'), review.reviewerRole]
                .filter(Boolean)
                .join(', ')}
            </figcaption>
          </figure>
        ) : null}
        <div className="mt-auto flex flex-wrap gap-2 pt-5">
          <SiteButton
            href={`/products/${p.slug}`}
            size="sm"
            variant="secondary"
            iconRight={<ArrowUpRight className="h-4 w-4" />}
          >
            {t('home.stories.explore', { name: shortName(p) })}
          </SiteButton>
          <SiteButton
            size="sm"
            variant="outline"
            onClick={() => openDemoRequest({ productSlug: p.slug, source: 'homepage' })}
          >
            {t('card.requestDemo')}
          </SiteButton>
        </div>
      </div>
    </article>
  );
}

export function FeaturedSolutions() {
  const t = useTranslations('marketplace.home.stories');
  const { products } = useMarketplace();
  const [paused, setPaused] = useState(false);
  const featured = useMemo(() => featuredProducts(products), [products]);
  // One copy, repeated until it is wide enough; the track holds it twice for a seamless loop.
  const copy = useMemo(() => {
    if (!featured.length) return [];
    const repeats = Math.max(1, Math.ceil(MIN_CARDS_PER_COPY / featured.length));
    return Array.from({ length: repeats }, () => featured).flat();
  }, [featured]);
  if (!featured.length) return null;
  const track = [...copy, ...copy];

  const style = {
    '--marquee-duration': `${copy.length * SECONDS_PER_CARD}s`,
    animationPlayState: paused ? 'paused' : undefined,
  } as CSSProperties;

  return (
    <section
      id="featured"
      aria-labelledby="featured-title"
      className="relative scroll-mt-20 overflow-hidden bg-gradient-to-b from-white to-cream py-14 sm:py-32"
    >
      <div
        className="pointer-events-none absolute -top-36 right-[-6%] h-[460px] w-[460px] rounded-full bg-gold-200/40 blur-3xl motion-safe:animate-drift"
        aria-hidden
      />
      <div className="container-x relative">
        <SectionHeader center eyebrow={t('eyebrow')} title={t('title')} lead={t('lead')} />
      </div>

      <div
        className={cn(
          'relative mt-14 overflow-hidden py-3',
          '[mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]',
          'motion-reduce:snap-x motion-reduce:snap-mandatory motion-reduce:overflow-x-auto motion-reduce:[mask-image:none]',
        )}
      >
        <ul
          className="flex w-max transform-gpu animate-marquee pb-6 hover:[animation-play-state:paused] focus-within:[animation-play-state:paused] motion-reduce:animate-none motion-reduce:px-4"
          style={style}
        >
          {track.map((p, i) => {
            const repeat = i >= featured.length;
            return (
              <li
                key={`${p.slug}-${i}`}
                aria-hidden={repeat || undefined}
                inert={repeat || undefined}
                className={cn(
                  'w-[20rem] shrink-0 pr-5 sm:w-[26rem] sm:pr-6 motion-reduce:snap-start',
                  repeat && 'motion-reduce:hidden',
                )}
              >
                <FeaturedCard product={p} />
              </li>
            );
          })}
        </ul>
      </div>

      <div className="relative mt-4 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => setPaused((v) => !v)}
          aria-pressed={paused}
          className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-brown-800 shadow-tile transition hover:-translate-y-px hover:border-gold-400 hover:bg-gold-50 focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:outline-none motion-reduce:hidden"
        >
          {paused ? (
            <Play className="h-4 w-4 fill-current" aria-hidden />
          ) : (
            <Pause className="h-4 w-4 fill-current" aria-hidden />
          )}
          {paused ? t('play') : t('pause')}
        </button>
        <SiteButton
          href="/products"
          variant="ghost"
          iconRight={<ArrowUpRight className="h-4 w-4" />}
        >
          {t('all')}
        </SiteButton>
      </div>
    </section>
  );
}
