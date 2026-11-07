'use client';

import { ArrowUpRight, Pause, Play, Quote, Star } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type CSSProperties, useMemo, useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { TESTIMONIALS, type Testimonial, visibleTestimonials } from '../../testimonials';
import { SectionHeader } from './home-sections';
import { useMarketplace } from './marketplace-provider';
import { Reveal } from './primitives';

// ─────────────────────────────────────────────────────────────────────────────
// Homepage testimonials: one or two rows of cards scrolling endlessly in
// opposite directions, faded at the edges. Hovering or focusing a card pauses
// the motion, and a Pause button stops it for good (WCAG 2.2.2). With reduced
// motion the rows don't move; each becomes a swipeable list instead.
// Content lives in ../../testimonials.ts. Hidden when there is none.
// ─────────────────────────────────────────────────────────────────────────────

/** Each copy of a row holds at least this many cards so the loop never shows a gap on wide screens. */
const MIN_CARDS_PER_COPY = 8;
/** From this many testimonials on, they are split over two rows. */
const TWO_ROWS_FROM = 6;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

function Stars({ rating }: { rating: number }) {
  const t = useTranslations('marketplace.home.testimonials');
  const value = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <p className="flex items-center gap-0.5" role="img" aria-label={t('rating', { rating: value })}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          aria-hidden
          className={cn('h-4 w-4', i < value ? 'fill-gold-500 text-gold-500' : 'text-line')}
        />
      ))}
    </p>
  );
}

function Avatar({ item, dark }: { item: Testimonial; dark: boolean }) {
  return (
    <span
      className={cn(
        'relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full font-display text-sm font-bold ring-2 ring-offset-2',
        dark
          ? 'bg-gold-500 text-brown-900 ring-gold-400/60 ring-offset-brown-800'
          : 'bg-gradient-to-br from-brown-600 to-brown-800 text-gold-200 ring-gold-200 ring-offset-white',
      )}
      aria-hidden
    >
      {item.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- small avatar, any origin
        <img src={item.photoUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        initials(item.name)
      )}
    </span>
  );
}

function TestimonialCard({ item, dark }: { item: Testimonial; dark: boolean }) {
  const t = useTranslations('marketplace.home.testimonials');
  const { products } = useMarketplace();
  const product = item.productSlug ? products.find((p) => p.slug === item.productSlug) : undefined;
  return (
    <figure
      className={cn(
        'group/card relative flex h-full flex-col overflow-hidden rounded-3xl p-6 transition-all duration-500 hover:-translate-y-1 sm:p-7',
        dark
          ? 'brand-band text-white shadow-card-hover'
          : 'border border-line bg-white shadow-tile hover:border-gold-200 hover:shadow-card-hover',
      )}
    >
      {dark ? (
        <div className="honeycomb-light pointer-events-none absolute inset-0" aria-hidden />
      ) : null}
      <Quote
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-2 -right-2 h-28 w-28 rotate-180 transition-transform duration-700 group-hover/card:scale-110 group-hover/card:-rotate-[170deg]',
          dark ? 'fill-white/10 text-transparent' : 'fill-gold-100 text-transparent',
        )}
      />

      <div className="relative flex items-center justify-between gap-3">
        {item.rating ? <Stars rating={item.rating} /> : <span />}
        {item.sample ? (
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-[0.12em] uppercase',
              dark ? 'bg-white/15 text-gold-100' : 'bg-gold-50 text-gold-800 ring-1 ring-gold-200',
            )}
          >
            {t('sample')}
          </span>
        ) : null}
      </div>

      <blockquote
        className={cn(
          'relative mt-5 flex-1 text-[15px] leading-relaxed sm:text-base',
          dark ? 'text-white/90' : 'text-ink',
        )}
      >
        <p>&ldquo;{item.quote}&rdquo;</p>
      </blockquote>

      <figcaption
        className={cn(
          'relative mt-6 flex items-center gap-4 border-t pt-5',
          dark ? 'border-white/15' : 'border-line',
        )}
      >
        <Avatar item={item} dark={dark} />
        <div className="min-w-0">
          <p
            className={cn(
              'truncate font-display font-bold',
              dark ? 'text-white' : 'text-brown-900',
            )}
          >
            {item.name}
          </p>
          <p className={cn('truncate text-xs', dark ? 'text-gold-100/80' : 'text-charcoal/70')}>
            {item.role} · {item.organization}
          </p>
        </div>
      </figcaption>

      {product ? (
        <Link
          href={`/products/${product.slug}`}
          className={cn(
            'relative mt-4 inline-flex w-fit items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition',
            dark
              ? 'bg-white/10 text-gold-100 ring-1 ring-white/20 hover:bg-white/20'
              : 'bg-mist text-brown-800 ring-1 ring-line hover:bg-gold-50 hover:ring-gold-300',
          )}
        >
          {t('about', { product: product.name })}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      ) : null}
    </figure>
  );
}

/**
 * One endless row. The track holds the cards twice (copy A, then the identical
 * copy B) and slides left by exactly one copy, so the loop is seamless. Only the
 * first occurrence of each testimonial is exposed to assistive technology and
 * keyboard focus; repeats are inert decoration.
 */
function MarqueeRow({
  items,
  reverse,
  paused,
  secondsPerCard,
  darkEvery,
}: {
  items: Testimonial[];
  reverse?: boolean;
  paused: boolean;
  secondsPerCard: number;
  darkEvery: number;
}) {
  const copy = useMemo(() => {
    const repeats = Math.max(1, Math.ceil(MIN_CARDS_PER_COPY / items.length));
    return Array.from({ length: repeats }, () => items).flat();
  }, [items]);
  const track = [...copy, ...copy];

  const style = {
    '--marquee-duration': `${copy.length * secondsPerCard}s`,
    animationDirection: reverse ? 'reverse' : undefined,
    animationPlayState: paused ? 'paused' : undefined,
  } as CSSProperties;

  return (
    <div
      className={cn(
        'overflow-hidden py-4',
        '[mask-image:linear-gradient(to_right,transparent,black_7%,black_93%,transparent)]',
        // Reduced motion: a still, swipeable list of the unique cards.
        'motion-reduce:snap-x motion-reduce:snap-mandatory motion-reduce:overflow-x-auto motion-reduce:[mask-image:none]',
      )}
    >
      <ul
        className="flex w-max transform-gpu animate-marquee hover:[animation-play-state:paused] focus-within:[animation-play-state:paused] motion-reduce:animate-none motion-reduce:px-4 sm:motion-reduce:px-6"
        style={style}
      >
        {track.map((item, i) => {
          const repeat = i >= items.length;
          return (
            <li
              key={`${item.id}-${i}`}
              aria-hidden={repeat || undefined}
              inert={repeat || undefined}
              className={cn(
                'w-[19rem] shrink-0 pr-5 sm:w-[25rem] sm:pr-6',
                'motion-reduce:snap-start',
                repeat && 'motion-reduce:hidden',
              )}
            >
              <TestimonialCard item={item} dark={i % darkEvery === darkEvery - 1} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Testimonials({ items = TESTIMONIALS }: { items?: readonly Testimonial[] }) {
  const t = useTranslations('marketplace.home.testimonials');
  const [paused, setPaused] = useState(false);
  const shown = useMemo(() => visibleTestimonials(items), [items]);
  const rows = useMemo(
    () =>
      shown.length >= TWO_ROWS_FROM
        ? [shown.filter((_, i) => i % 2 === 0), shown.filter((_, i) => i % 2 === 1)]
        : [shown],
    [shown],
  );
  if (!shown.length) return null;

  return (
    <section
      id="testimonials"
      aria-roledescription="carousel"
      aria-label={t('title')}
      className="relative scroll-mt-20 overflow-hidden bg-mist py-24 sm:py-32"
    >
      <div
        className="pointer-events-none absolute -top-40 right-[-10%] h-[420px] w-[420px] rounded-full bg-gold-200/40 blur-3xl motion-safe:animate-drift"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-40 left-[-8%] h-[360px] w-[360px] rounded-full bg-brown-200/40 blur-3xl motion-safe:animate-drift-slow"
        aria-hidden
      />

      <div className="container-x relative">
        <SectionHeader center eyebrow={t('eyebrow')} title={t('title')} lead={t('lead')} />
      </div>

      <Reveal className="relative mt-14 space-y-2 sm:space-y-4">
        {rows.map((row, i) => (
          <MarqueeRow
            key={i}
            items={row}
            reverse={i === 1}
            paused={paused}
            secondsPerCard={i === 1 ? 8 : 7}
            darkEvery={i === 1 ? 3 : 4}
          />
        ))}
      </Reveal>

      <div className="relative mt-8 flex justify-center motion-reduce:hidden">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-brown-800 shadow-tile transition hover:-translate-y-px hover:border-gold-400 hover:bg-gold-50 focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:outline-none"
        >
          {paused ? (
            <Play className="h-4 w-4 fill-current" aria-hidden />
          ) : (
            <Pause className="h-4 w-4 fill-current" aria-hidden />
          )}
          {paused ? t('play') : t('pause')}
        </button>
      </div>
    </section>
  );
}
