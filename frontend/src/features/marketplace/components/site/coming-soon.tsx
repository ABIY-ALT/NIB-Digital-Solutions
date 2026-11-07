'use client';

import { ArrowUpRight, BellRing, CalendarClock, Hammer, Rocket, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { isUpcoming } from '../../taxonomy';
import type { MarketplaceProduct } from '../../types';
import { SectionHeader } from './home-sections';
import { useMarketplace } from './marketplace-provider';
import { Reveal, SiteButton } from './primitives';
import { AvailabilityBadge, ProductIcon } from './product-card';
import { ProductScreen } from './product-screen';

// ─────────────────────────────────────────────────────────────────────────────
// Homepage "Coming soon": products the team is building (Coming soon or In
// development), kept apart from launched products. The soonest one is the
// launch spotlight (live countdown, sneak-peek preview); the rest follow as
// cards. Admins switch a product to Available in the product editor and it
// moves to the launched lists. Hidden when nothing is upcoming.
// ─────────────────────────────────────────────────────────────────────────────

/** Release dates are calendar days; count down to the start of that day (visitor's time). */
const releaseMoment = (day: string) => new Date(`${day}T00:00:00`).getTime();

interface Remaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * Time left until the expected release date. Computed on the client only
 * (null during server render) so it never causes a hydration mismatch; null
 * as well once the date has passed.
 */
function useCountdown(day: string | null, everyMs: number): Remaining | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!day) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, everyMs);
    return () => clearInterval(timer);
  }, [day, everyMs]);
  if (!day || now === null) return null;
  const left = releaseMoment(day) - now;
  if (!(left > 0)) return null;
  const seconds = Math.floor(left / 1000);
  return {
    days: Math.floor(seconds / 86_400),
    hours: Math.floor((seconds % 86_400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
  };
}

const releaseDate = (format: ReturnType<typeof useFormatter>, day: string) =>
  format.dateTime(new Date(`${day}T00:00:00`), { dateStyle: 'long' });

/** One countdown digit tile; the number re-animates whenever it changes. */
function Tile({ value, label, dark }: { value: number | null; label: string; dark?: boolean }) {
  // null: not computed yet (server render): a neutral placeholder, never a wrong number.
  const text = value === null ? '--' : String(value).padStart(2, '0');
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-2xl px-2 py-3 text-center',
        dark
          ? 'bg-white/10 ring-1 ring-white/20 backdrop-blur sm:py-4'
          : 'border border-gold-200/70 bg-gold-50/70',
      )}
    >
      <dd className="overflow-hidden">
        <span
          key={text}
          className={cn(
            'block animate-[site-line-up_0.45s_cubic-bezier(0.22,1,0.36,1)_both] font-display font-extrabold tabular-nums',
            dark ? 'text-3xl text-white sm:text-4xl' : 'text-xl text-brown-900',
          )}
        >
          {text}
        </span>
      </dd>
      <dt
        className={cn(
          'mt-1 text-[10px] font-semibold tracking-[0.14em] uppercase',
          dark ? 'text-gold-200' : 'text-charcoal/60',
        )}
      >
        {label}
      </dt>
    </div>
  );
}

/** Small countdown for the secondary cards (updates every 30 s). */
function CompactCountdown({ product }: { product: MarketplaceProduct }) {
  const t = useTranslations('marketplace.home.upcoming');
  const format = useFormatter();
  const left = useCountdown(product.releaseDate, 30_000);
  if (!product.releaseDate)
    return (
      <p className="flex items-center gap-2 text-xs font-medium text-charcoal/60">
        <Hammer className="h-3.5 w-3.5 text-gold-700" aria-hidden /> {t('noDate')}
      </p>
    );
  const date = releaseDate(format, product.releaseDate);
  return (
    <div>
      <p className="flex items-center gap-2 text-xs font-medium text-charcoal/70">
        <CalendarClock className="h-3.5 w-3.5 text-gold-700" aria-hidden />
        {t('expected', { date })}
      </p>
      {left ? (
        <dl className="mt-3 grid grid-cols-3 gap-2" aria-label={t('countdownLabel', { date })}>
          <Tile value={left.days} label={t('units.days')} />
          <Tile value={left.hours} label={t('units.hours')} />
          <Tile value={left.minutes} label={t('units.minutes')} />
        </dl>
      ) : null}
    </div>
  );
}

/** A blurred glimpse of the product: its first screenshot (or the generated preview). */
function SneakPeek({ product, large }: { product: MarketplaceProduct; large?: boolean }) {
  const t = useTranslations('marketplace.home.upcoming');
  const shot = product.content.screenshots[0];
  return (
    <div
      className={cn(
        'relative overflow-hidden',
        large
          ? 'rounded-[1.5rem] bg-white/90 p-3 shadow-[0_30px_80px_-30px_rgb(39_22_11/0.7)] ring-1 ring-white/30 sm:p-4'
          : 'rounded-2xl border border-line bg-mist',
      )}
    >
      <div className={cn('relative overflow-hidden', large && 'rounded-xl')}>
        <div
          className={cn(
            'scale-110 saturate-[0.85] transition duration-700',
            large ? 'blur-[7px] group-hover:blur-[4px]' : 'blur-[6px] group-hover:blur-[3px]',
          )}
          aria-hidden
        >
          <ProductScreen
            product={product}
            variant={shot?.variant ?? 'dashboard'}
            imageUrl={shot?.imageUrl}
            alt=""
            className="rounded-none"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-white/70 via-white/10 to-transparent" />
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent motion-safe:animate-shimmer"
          aria-hidden
        />
        {large ? (
          // The product's own icon, sharp, over the blurred screen.
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-white shadow-lift ring-1 ring-line">
              <span
                className="absolute inset-0 rounded-3xl ring-2 ring-gold-400/70 motion-safe:animate-ping"
                aria-hidden
              />
              <ProductIcon product={product} size="lg" className="bg-transparent!" />
            </span>
          </div>
        ) : null}
      </div>
      <span
        className={cn(
          'absolute inline-flex items-center gap-1.5 rounded-full bg-brown-700/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow-tile backdrop-blur',
          large ? 'top-6 left-6' : 'top-3 left-3',
        )}
      >
        <Sparkles className="h-3.5 w-3.5 text-gold-300" aria-hidden /> {t('preview')}
      </span>
    </div>
  );
}

function useNotify() {
  const t = useTranslations('marketplace');
  const { openInquiry } = useMarketplace();
  return (p: MarketplaceProduct) =>
    openInquiry({
      productSlug: p.slug,
      inquiryType: 'product_information',
      source: 'homepage',
      message: t('home.upcoming.notifyMessage', { name: p.name }),
    });
}

/** The next launch: a large NIB-brown card with a live countdown and a sneak peek. */
function Spotlight({ product: p }: { product: MarketplaceProduct }) {
  const t = useTranslations('marketplace');
  const format = useFormatter();
  const { categoryName } = useMarketplace();
  const notify = useNotify();
  const left = useCountdown(p.releaseDate, 1000);
  const [ticked, setTicked] = useState(false);
  useEffect(() => setTicked(true), []);
  const date = p.releaseDate ? releaseDate(format, p.releaseDate) : null;
  // Past (or today) only once the client has checked: the countdown then stays null.
  const passed = !!p.releaseDate && left === null && ticked;

  return (
    <Reveal variant="scale">
      <article className="brand-band group relative overflow-hidden rounded-[2rem] p-6 text-white shadow-card-hover sm:p-10 lg:p-12">
        <div className="honeycomb-light pointer-events-none absolute inset-0" aria-hidden />
        <div
          className="pointer-events-none absolute -top-24 -right-16 h-80 w-80 rounded-full bg-gold-400/30 blur-3xl motion-safe:animate-drift"
          aria-hidden
        />
        <div className="relative grid items-center gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-500 px-3 py-1 text-xs font-bold text-brown-900 shadow-glow">
                <Rocket className="h-3.5 w-3.5" aria-hidden /> {t('home.upcoming.next')}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-gold-100 ring-1 ring-white/20">
                {t(`availability.${p.availability}`)}
              </span>
            </div>
            <p className="mt-6 text-xs font-semibold tracking-[0.14em] text-gold-300 uppercase">
              {categoryName(p.categoryCode)}
            </p>
            <h3 className="mt-2 text-3xl leading-tight font-extrabold tracking-[-0.03em] text-white! sm:text-5xl">
              {p.name}
            </h3>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-white/80">
              {p.tagline || p.summary}
            </p>

            <div className="mt-8">
              {date && !passed ? (
                <>
                  <p className="flex items-center gap-2 text-sm font-semibold text-gold-200">
                    <CalendarClock className="h-4 w-4" aria-hidden />{' '}
                    {t('home.upcoming.launchesIn')}
                  </p>
                  <dl
                    className="mt-3 grid max-w-md grid-cols-4 gap-2 sm:gap-3"
                    aria-label={t('home.upcoming.countdownLabel', { date })}
                  >
                    <Tile dark value={left?.days ?? null} label={t('home.upcoming.units.days')} />
                    <Tile dark value={left?.hours ?? null} label={t('home.upcoming.units.hours')} />
                    <Tile
                      dark
                      value={left?.minutes ?? null}
                      label={t('home.upcoming.units.minutes')}
                    />
                    <Tile
                      dark
                      value={left?.seconds ?? null}
                      label={t('home.upcoming.units.seconds')}
                    />
                  </dl>
                  <p className="mt-3 text-sm text-white/60">
                    {t('home.upcoming.expected', { date })}
                  </p>
                </>
              ) : (
                <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white/85 ring-1 ring-white/15">
                  <Hammer className="h-4 w-4 text-gold-300" aria-hidden />
                  {passed ? t('home.upcoming.anyDay') : t('home.upcoming.noDate')}
                </p>
              )}
            </div>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <SiteButton
                size="lg"
                onClick={() => notify(p)}
                iconLeft={<BellRing className="h-5 w-5" />}
              >
                {t('home.upcoming.interest')}
              </SiteButton>
              <SiteButton
                size="lg"
                variant="light"
                href={`/products/${p.slug}`}
                iconRight={<ArrowUpRight className="h-5 w-5" />}
              >
                {t('card.viewDetails')}
              </SiteButton>
            </div>
          </div>
          <div className="motion-safe:animate-float">
            <SneakPeek product={p} large />
          </div>
        </div>
      </article>
    </Reveal>
  );
}

function UpcomingCard({ product: p }: { product: MarketplaceProduct }) {
  const t = useTranslations('marketplace');
  const { categoryName } = useMarketplace();
  const notify = useNotify();
  return (
    <article className="card-accent group relative flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-white p-5 transition-all duration-500 hover:-translate-y-1 hover:border-gold-200 hover:shadow-card-hover sm:p-6">
      <SneakPeek product={p} />
      <div className="mt-5 flex items-start justify-between gap-3">
        <ProductIcon product={p} />
        <AvailabilityBadge product={p} always />
      </div>
      <p className="mt-4 text-[11px] font-semibold tracking-[0.1em] text-gold-700 uppercase">
        {categoryName(p.categoryCode)}
      </p>
      <h3 className="mt-1 text-xl leading-snug font-bold">
        <Link
          href={`/products/${p.slug}`}
          className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
        >
          {p.name}
        </Link>
      </h3>
      <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-charcoal/75">
        {p.tagline || p.summary}
      </p>
      <div className="mt-5">
        <CompactCountdown product={p} />
      </div>
      <div className="relative z-10 mt-5 flex flex-wrap gap-2">
        <SiteButton
          size="sm"
          variant="secondary"
          onClick={() => notify(p)}
          iconLeft={<BellRing className="h-4 w-4" />}
        >
          {t('home.upcoming.interest')}
        </SiteButton>
        <SiteButton
          size="sm"
          variant="ghost"
          href={`/products/${p.slug}`}
          iconRight={<ArrowUpRight className="h-4 w-4" />}
        >
          {t('card.viewDetails')}
        </SiteButton>
      </div>
    </article>
  );
}

/** Upcoming products in launch order: dated releases first (soonest first), then the newest listings. */
export function upcomingInOrder(products: readonly MarketplaceProduct[]): MarketplaceProduct[] {
  return products.filter(isUpcoming).sort((a, b) => {
    if (a.releaseDate && b.releaseDate) return a.releaseDate.localeCompare(b.releaseDate);
    if (a.releaseDate || b.releaseDate) return a.releaseDate ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function UpcomingProducts() {
  const t = useTranslations('marketplace');
  const { products } = useMarketplace();
  const upcoming = useMemo(() => upcomingInOrder(products), [products]);
  if (!upcoming.length) return null;
  const [next, ...rest] = upcoming as [MarketplaceProduct, ...MarketplaceProduct[]];
  return (
    <section
      id="upcoming"
      className="relative scroll-mt-20 overflow-hidden bg-cream py-24 sm:py-32"
    >
      <div
        className="absolute -top-32 left-[-10%] h-[380px] w-[380px] rounded-full bg-gold-200/40 blur-3xl motion-safe:animate-drift-slow"
        aria-hidden
      />
      <div className="container-x relative">
        <SectionHeader
          center
          eyebrow={t('home.upcoming.eyebrow')}
          title={t('home.upcoming.title')}
          lead={t('home.upcoming.lead')}
        />
        <div className="mt-14">
          <Spotlight product={next} />
        </div>
        {rest.length ? (
          <>
            <p className="mt-16 flex items-center gap-3 text-sm font-semibold text-brown-800">
              <span className="h-px w-8 bg-gold-500" aria-hidden />
              {t('home.upcoming.more')}
            </p>
            <ul className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {rest.slice(0, 6).map((p, i) => (
                <Reveal as="li" key={p.slug} variant="scale" delay={(i % 3) * 90}>
                  <UpcomingCard product={p} />
                </Reveal>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Announcement bar at the very top of every page while a product is Coming
// soon or In development: the next launch, its live countdown (when dated),
// "Notify me" and a link to the product. Visitors can close it; it stays
// closed for that product (a new upcoming product shows it again).
// ─────────────────────────────────────────────────────────────────────────────

/** Height of the bar; the fixed header and page offsets add it (`--site-top`). */
export const LAUNCH_BAR_HEIGHT = 40;
const DISMISS_KEY = 'nib_ds_launch_bar_closed';

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

/**
 * The product the bar announces (null when nothing is upcoming or the visitor
 * closed the bar for it) and how to close it.
 */
export function useLaunchBar(): { product: MarketplaceProduct | null; close: () => void } {
  const { products } = useMarketplace();
  const next = useMemo(() => upcomingInOrder(products)[0] ?? null, [products]);
  const [closedFor, setClosedFor] = useState<string | null>(null);
  // Read after mount: the server render never knows what this visitor closed.
  useEffect(() => setClosedFor(readDismissed()), []);
  const close = () => {
    if (!next) return;
    setClosedFor(next.slug);
    try {
      window.localStorage.setItem(DISMISS_KEY, next.slug);
    } catch {
      // Private browsing: closed for this page view only.
    }
  };
  return { product: next && closedFor !== next.slug ? next : null, close };
}

function BarTile({ value, unit }: { value: number; unit: string }) {
  return (
    <span className="inline-flex h-7 min-w-8 flex-col items-center justify-center rounded-md bg-brown-950 px-1 leading-none text-gold-200 tabular-nums">
      <span key={value} className="text-[13px] font-bold motion-safe:animate-fade-in">
        {String(value).padStart(2, '0')}
      </span>
      <span className="mt-px text-[8px] font-semibold tracking-wider text-brown-200">{unit}</span>
    </span>
  );
}

export function LaunchBar({
  product: p,
  onClose,
}: {
  product: MarketplaceProduct;
  onClose: () => void;
}) {
  const t = useTranslations('marketplace');
  const format = useFormatter();
  const notify = useNotify();
  const left = useCountdown(p.releaseDate, 1000);
  const [ticked, setTicked] = useState(false);
  useEffect(() => setTicked(true), []);
  const passed = !!p.releaseDate && left === null && ticked;

  return (
    <div
      role="region"
      aria-label={t('launchBar.label')}
      className="relative overflow-hidden bg-[linear-gradient(90deg,var(--color-gold-500),var(--color-gold-400)_50%,var(--color-gold-500))] text-brown-950"
      style={{ height: LAUNCH_BAR_HEIGHT }}
    >
      <span
        className="pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/45 to-transparent motion-safe:animate-shimmer"
        aria-hidden
      />
      <div className="container-x relative flex h-full max-w-[96rem] items-center justify-center gap-2.5 pe-12 text-[13px] whitespace-nowrap sm:gap-3.5">
        <span className="hidden items-center gap-1.5 rounded-full bg-brown-950 px-2.5 py-0.5 text-[10.5px] font-extrabold tracking-[0.12em] text-gold-300 uppercase sm:inline-flex">
          <span
            className="h-1.5 w-1.5 rounded-full bg-gold-300 motion-safe:animate-pulse"
            aria-hidden
          />
          {t(`availability.${p.availability}`)}
        </span>
        <Link
          href={`/products/${p.slug}`}
          className="min-w-0 truncate font-extrabold underline-offset-4 hover:underline"
        >
          {p.name}
        </Link>
        {p.releaseDate && !passed ? (
          <span
            className="inline-flex items-center gap-1"
            aria-label={
              left
                ? t('home.upcoming.countdownLabel', { date: releaseDate(format, p.releaseDate) })
                : undefined
            }
          >
            <span className="hidden font-semibold lg:inline">{t('home.upcoming.launchesIn')}</span>
            <BarTile value={left?.days ?? 0} unit={t('home.upcoming.units.days')} />
            <BarTile value={left?.hours ?? 0} unit={t('home.upcoming.units.hours')} />
            <span className="hidden sm:inline-flex">
              <BarTile value={left?.minutes ?? 0} unit={t('home.upcoming.units.minutes')} />
            </span>
            <span className="hidden md:inline-flex">
              <BarTile value={left?.seconds ?? 0} unit={t('home.upcoming.units.seconds')} />
            </span>
          </span>
        ) : (
          <span className="hidden font-semibold md:inline">
            {passed ? t('home.upcoming.anyDay') : t('home.upcoming.noDate')}
          </span>
        )}
        <button
          type="button"
          onClick={() => notify(p)}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-brown-950 px-3 text-xs font-bold text-white transition hover:bg-brown-800 focus-visible:ring-2 focus-visible:ring-brown-950 focus-visible:ring-offset-2 focus-visible:ring-offset-gold-400 focus-visible:outline-none"
        >
          <BellRing className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden min-[400px]:inline">{t('home.upcoming.interest')}</span>
        </button>
        <Link
          href={`/products/${p.slug}`}
          className="hidden font-bold underline underline-offset-4 xl:inline"
        >
          {t('launchBar.look')}
        </Link>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t('launchBar.close')}
        className="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-brown-950 transition hover:bg-brown-950/10 focus-visible:ring-2 focus-visible:ring-brown-950 focus-visible:outline-none"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
