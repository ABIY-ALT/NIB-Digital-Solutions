'use client';

import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type TouchEvent,
} from 'react';
import { cn } from '@/shared/lib/cn';
import { useDocumentVisible, useInView, usePrefersReducedMotion } from '../../hooks/use-media';
import { responsiveImage } from '../../lib/responsive-image';
import type { PublicHeroCarousel, PublicHeroSlide } from '../../types';
import { useMarketplace } from './marketplace-provider';
import { SiteButton } from './primitives';
import { ProductScreen } from './product-screen';

// ─────────────────────────────────────────────────────────────────────────────
// Homepage hero: one headline over the image carousel. The headline is the
// site's own copy (i18n), rendered as real text, never inside an image. The
// images are managed by staff under Digital Solutions → Hero carousel and
// loaded on the server for every request.
//
// Large screens: the headline sits over the image's open upper-left area on a
// soft cream scrim, clear of the presenter and the floating product visuals.
// Tablets: the headline comes first, the whole wide image below it.
// Phones: a two-line headline, the picture as a 3:2 crop kept toward the right
// (where the presenter and product cards sit) or the slide's own portrait
// image, the slide controls under the picture, then "Explore our products".
//
// Loading: the first slide's image is preloaded at high priority in the size
// the screen needs (optimizer srcset); the next slide's image follows only
// after the page has loaded, and later ones as the visitor gets near them.
// ─────────────────────────────────────────────────────────────────────────────

/** Breakpoint where phones switch to the slide's portrait image (matches Tailwind `sm`). */
const PHONE = '(max-width: 639px)';
const NOT_PHONE = '(min-width: 640px)';
/** Rendered width of the picture: framed in the page gutter below lg, full-bleed from lg. */
const SIZES_WIDE =
  '(min-width: 1024px) 100vw, (min-width: 640px) calc(100vw - 48px), calc(100vw - 32px)';
const SIZES_PORTRAIT = 'calc(100vw - 32px)';

export function HeroShowcase({ carousel }: { carousel: PublicHeroCarousel }) {
  return carousel.slides.length ? <HeroCarousel carousel={carousel} /> : <HeroFallback />;
}

/** How quickly the light catches up with the pointer each frame (0–1; lower = softer trail). */
const GLOW_EASE = 0.16;

/**
 * A soft gold light that follows the mouse across its parent (which must be
 * positioned). It eases after the pointer for a smooth trail and fades out
 * when the pointer leaves. Mouse and pen only, never touch; off with reduced
 * motion. Position goes straight to CSS variables, so moving the mouse never
 * re-renders React.
 */
export function CursorGlow({ className }: { className?: string }) {
  const glowRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const glow = glowRef.current;
    const area = glow?.parentElement;
    if (!glow || !area || reducedMotion) return;

    let frame = 0;
    let started = false;
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };

    const paint = () => {
      current.x += (target.x - current.x) * GLOW_EASE;
      current.y += (target.y - current.y) * GLOW_EASE;
      glow.style.setProperty('--glow-x', `${current.x.toFixed(1)}px`);
      glow.style.setProperty('--glow-y', `${current.y.toFixed(1)}px`);
      const settled = Math.abs(target.x - current.x) < 0.5 && Math.abs(target.y - current.y) < 0.5;
      frame = settled ? 0 : requestAnimationFrame(paint);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const box = area.getBoundingClientRect();
      target.x = e.clientX - box.left;
      target.y = e.clientY - box.top;
      // First entry: appear under the pointer instead of sliding in from a corner.
      if (!started) {
        started = true;
        current.x = target.x;
        current.y = target.y;
      }
      glow.dataset.on = 'true';
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const onLeave = () => {
      glow.dataset.on = 'false';
      started = false;
    };

    area.addEventListener('pointermove', onMove, { passive: true });
    area.addEventListener('pointerleave', onLeave);
    return () => {
      area.removeEventListener('pointermove', onMove);
      area.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(frame);
      glow.dataset.on = 'false';
    };
  }, [reducedMotion]);

  return (
    <div
      ref={glowRef}
      aria-hidden
      data-on="false"
      data-testid="hero-glow"
      className={cn('hero-glow pointer-events-none absolute inset-0', className)}
    />
  );
}

/** Staggered entrance (CSS only; instant under reduced motion). */
const rise = (ms: number) => ({ animationDelay: `${ms}ms` }) as CSSProperties;

/**
 * The hero's only text: the headline. Each line rises out of a mask; a short
 * gold rule above it carries the brand accent. On phones the size follows the
 * content width: the longer line ("Real Business Impact.") is ~10.05 em wide,
 * so 9.6vw - 3px keeps each line whole from 320 px (28 px) to 639 px (44 px).
 */
function HeroCopy() {
  const t = useTranslations('marketplace.home.hero');
  return (
    <div>
      <span
        className="block h-[3px] w-14 origin-left animate-[site-rule_0.9s_cubic-bezier(0.22,1,0.36,1)_both] rounded-full bg-gradient-to-r from-gold-500 to-gold-300 sm:w-20"
        style={rise(80)}
        aria-hidden
      />
      <h1 className="mt-4 text-[clamp(1.75rem,calc(9.6vw-3px),2.75rem)] leading-[1.06] sm:mt-6 sm:text-[3.5rem] sm:leading-[1.04] lg:max-w-[9em] lg:text-[clamp(2.75rem,calc(5.2vw-4px),4.5rem)] font-extrabold tracking-[-0.04em] text-balance">
        <span className="block overflow-hidden pb-[0.08em]">
          <span
            className="block animate-[site-line-up_1s_cubic-bezier(0.22,1,0.36,1)_both]"
            style={rise(160)}
          >
            {t('headline1')}
          </span>
        </span>
        <span className="block overflow-hidden pb-[0.12em]">
          <span
            className="text-brand-gradient block animate-[site-line-up_1s_cubic-bezier(0.22,1,0.36,1)_both]"
            style={rise(300)}
          >
            {t('headline2')}
          </span>
        </span>
      </h1>
    </div>
  );
}

/**
 * Phones and tablets: the way into the catalogue right under the picture
 * ("Request a Demo" stays in the header). Large screens keep the headline alone.
 */
function HeroActions({ className }: { className?: string }) {
  const t = useTranslations('marketplace.home.hero');
  return (
    <div className={cn('flex justify-center lg:hidden', className)}>
      <SiteButton
        href="/products"
        variant="secondary"
        className="h-12 w-full text-[15px] sm:w-auto sm:px-7"
        iconRight={<ArrowRight className="h-4 w-4" aria-hidden />}
      >
        {t('explore')}
      </SiteButton>
    </div>
  );
}

/** When no slide is active: the headline beside a live product preview (never a placeholder photo). */
function HeroFallback() {
  const { products } = useMarketplace();
  const lead = products.find((p) => p.featured) ?? products[0];
  const shot = lead?.content.screenshots.find((s) => s.variant !== 'mobile');
  return (
    <section className="relative isolate overflow-hidden bg-cream pt-[var(--site-top,72px)]">
      <div
        className="honeycomb-bg absolute inset-0 -z-10 opacity-70 [mask-image:radial-gradient(ellipse_at_top_left,black_20%,transparent_70%)]"
        aria-hidden
      />
      <div
        className="absolute -top-32 right-[-10%] -z-10 h-[34rem] w-[34rem] rounded-full bg-gold-200/50 blur-3xl motion-safe:animate-drift"
        aria-hidden
      />
      {/* Above the background, below the copy and the product preview. */}
      <CursorGlow className="-z-[5]" />
      <div className="container-x grid grid-cols-1 items-center gap-8 py-8 sm:gap-12 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:py-24">
        <HeroCopy />
        {lead ? (
          <div className="animate-scale-up" style={rise(300)}>
            <div className="rounded-[1.75rem] bg-white/70 p-4 shadow-lift ring-1 ring-line backdrop-blur sm:p-6">
              <ProductScreen
                product={lead}
                variant={shot?.variant ?? 'dashboard'}
                imageUrl={shot?.imageUrl}
                alt={shot?.title}
                sizes="(min-width: 1024px) 560px, 100vw"
                className="rounded-xl shadow-tile"
              />
            </div>
            <HeroActions className="mt-6" />
          </div>
        ) : (
          <HeroActions />
        )}
      </div>
    </section>
  );
}

function HeroCarousel({ carousel }: { carousel: PublicHeroCarousel }) {
  const t = useTranslations('marketplace.home.hero');
  const { slides, settings } = carousel;
  const count = slides.length;

  const sectionRef = useRef<HTMLElement>(null);
  const touchX = useRef<number | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const pageVisible = useDocumentVisible();
  const inView = useInView(sectionRef, 0.35);

  const [index, setIndex] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  // Images load as their slide approaches, not all up front: only the first
  // slide's image is in the page as it loads (nothing competes with it); the
  // next one follows once the page has finished loading (effect below), and
  // every move to a slide also loads the one after it.
  const [seen, setSeen] = useState(() => new Set([0]));
  useEffect(() => {
    if (count < 2) return;
    let timer = 0;
    const warmNext = () => {
      timer = window.setTimeout(() => setSeen((s) => (s.has(1) ? s : new Set([...s, 1]))), 250);
    };
    if (document.readyState === 'complete') warmNext();
    else window.addEventListener('load', warmNext, { once: true });
    return () => {
      window.removeEventListener('load', warmNext);
      window.clearTimeout(timer);
    };
  }, [count]);

  const autoplay = settings.autoplay && !reducedMotion && count > 1;
  const running =
    autoplay &&
    !userPaused &&
    !(settings.pauseOnHover && hovering) &&
    !keyboardFocus &&
    inView &&
    pageVisible;
  const showArrows = count > 1 && settings.navigation !== 'dots';
  const showDots = count > 1 && settings.navigation !== 'arrows';
  // Portrait phone images only when every slide has one, so the height never jumps.
  const portraitOnPhones = slides.every((s) => s.mobileImageUrl);

  const goTo = useCallback(
    (i: number) => {
      const next = (i + count) % count;
      setIndex(next);
      setCycle((c) => c + 1);
      setSeen((s) =>
        s.has(next) && s.has((next + 1) % count) ? s : new Set([...s, next, (next + 1) % count]),
      );
    },
    [count],
  );

  const onTouchStart = (e: TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touchX.current;
    const end = e.changedTouches[0]?.clientX;
    touchX.current = null;
    if (count < 2 || start == null || end == null || Math.abs(end - start) < 48) return;
    goTo(end < start ? index + 1 : index - 1);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (count < 2) return;
    // Arrow keys inside form fields or links keep their usual meaning.
    if ((e.target as HTMLElement).closest('input, textarea, select')) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goTo(index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goTo(index - 1);
    }
  };

  const current = slides[index]!;
  const timing = { '--hero-ms': `${settings.transitionMs}ms` } as CSSProperties;

  return (
    <section
      ref={sectionRef}
      className="relative isolate overflow-hidden bg-cream pt-[var(--site-top,72px)]"
      style={timing}
      aria-roledescription="carousel"
      aria-label={t('label')}
      onFocus={(e) => setKeyboardFocus(e.target.matches(':focus-visible'))}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setKeyboardFocus(false);
      }}
      onKeyDown={onKeyDown}
    >
      <HeroPreload slide={slides[0]!} portraitOnPhones={portraitOnPhones} />

      {/* Phones and tablets: a soft honeycomb behind the copy. */}
      <div
        className="honeycomb-bg absolute inset-x-0 top-0 -z-10 h-[34rem] opacity-60 [mask-image:radial-gradient(ellipse_at_top_left,black_15%,transparent_70%)] lg:hidden"
        aria-hidden
      />

      <div
        className={cn(
          'relative flex flex-col',
          'lg:block lg:h-[min(56.25vw,calc(100svh-var(--site-top,72px)))] lg:min-h-[600px]',
        )}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* The image stage. Below lg it follows the copy as a framed picture. */}
        <div className="container-x order-2 lg:static lg:max-w-none lg:p-0">
          {/* Anchors the slide controls to the picture on tablets (phones: under it; lg: the hero). */}
          <div className="relative lg:static">
            <div
              className={cn(
                'relative overflow-hidden rounded-2xl bg-cream-deep shadow-lift ring-1 ring-line sm:rounded-3xl',
                portraitOnPhones ? 'aspect-[4/5] sm:aspect-video' : 'aspect-[3/2] sm:aspect-video',
                'lg:absolute lg:inset-0 lg:aspect-auto lg:rounded-none lg:shadow-none lg:ring-0',
              )}
            >
              {slides.map((slide, i) => (
                <Slide
                  key={slide.id}
                  slide={slide}
                  position={i}
                  total={count}
                  active={i === index}
                  load={seen.has(i)}
                  first={i === 0}
                  portraitOnPhones={portraitOnPhones}
                />
              ))}

              {/* Large screens: cream scrim over the open left side, so the copy reads cleanly. */}
              <div
                className="pointer-events-none absolute inset-y-0 left-0 hidden w-[64%] bg-gradient-to-r from-cream via-cream/80 to-transparent lg:block"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-24 bg-gradient-to-t from-cream/70 to-transparent lg:block"
                aria-hidden
              />
            </div>

            {/* Phones: under the picture, so nothing in it is covered. Tablets and up: over its foot. */}
            {count > 1 ? (
              <div className="z-20 mt-3 sm:absolute sm:inset-x-0 sm:bottom-5 sm:mt-0 lg:bottom-8">
                <div className="container-x flex max-w-[96rem] justify-center lg:justify-start">
                  <Controls
                    count={count}
                    index={index}
                    cycle={cycle}
                    slides={slides}
                    showArrows={showArrows}
                    showDots={showDots}
                    autoplay={autoplay}
                    running={running}
                    userPaused={userPaused}
                    intervalMs={settings.intervalSeconds * 1000}
                    onGo={goTo}
                    onTogglePause={() => setUserPaused((p) => !p)}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Phones and tablets: the way into the catalogue, under the picture. */}
        <div className="container-x order-3 pt-5 pb-10 sm:pt-7 sm:pb-14 lg:hidden">
          <HeroActions />
        </div>

        {/* Over the image and its scrim, under the copy (z-10) and the slide controls (z-20). */}
        <CursorGlow className="z-[5]" />

        {/* The copy: first on phones and tablets; over the image's left side on large screens. */}
        <div className="relative z-10 order-1 lg:pointer-events-none lg:absolute lg:inset-0 lg:flex lg:items-center">
          {/* Same width as the header row, so the headline lines up with the logo. */}
          <div className="container-x max-w-[96rem] pt-7 pb-6 sm:pt-16 sm:pb-12 lg:py-0">
            <div className="lg:pointer-events-auto lg:mb-[12vh] lg:max-w-[44vw]">
              <HeroCopy />
            </div>
          </div>
        </div>
      </div>

      <p className="sr-only" aria-live={running ? 'off' : 'polite'} aria-atomic="true">
        {t('live', { position: index + 1, total: count, title: current.title ?? '' })}
      </p>
    </section>
  );
}

function Slide({
  slide,
  position,
  total,
  active,
  load,
  first,
  portraitOnPhones,
}: {
  slide: PublicHeroSlide;
  position: number;
  total: number;
  active: boolean;
  load: boolean;
  first: boolean;
  portraitOnPhones: boolean;
}) {
  const t = useTranslations('marketplace.home.hero');
  const portrait = portraitOnPhones && slide.mobileImageUrl ? slide.mobileImageUrl : null;
  const wide = responsiveImage(slide.desktopImageUrl, SIZES_WIDE);
  const tall = portrait ? responsiveImage(portrait, SIZES_PORTRAIT) : null;
  return (
    <div
      className="hero-slide absolute inset-0"
      data-active={active}
      inert={!active}
      aria-hidden={!active}
      role="group"
      aria-roledescription="slide"
      aria-label={t('slide', { position: position + 1, total })}
    >
      {load ? (
        <picture>
          {tall ? (
            <source media={PHONE} srcSet={tall.srcSet ?? tall.src} sizes={tall.sizes} />
          ) : null}
          <img
            src={wide.src}
            srcSet={wide.srcSet}
            sizes={wide.sizes}
            alt={slide.altText ?? ''}
            loading={first ? 'eager' : 'lazy'}
            fetchPriority={first ? 'high' : 'low'}
            decoding={first ? undefined : 'async'}
            className={cn(
              'hero-slide-image h-full w-full object-cover lg:object-center',
              // Phones crop the wide picture to 3:2: keep the right-hand side, where
              // the presenter and the product cards sit (left ~14% is cut).
              tall
                ? 'object-center sm:object-[62%_center]'
                : 'object-[85%_center] sm:object-[62%_center]',
            )}
          />
        </picture>
      ) : null}
    </div>
  );
}

/**
 * Preloads the first slide's picture in the size this screen needs, at high
 * priority, so the browser fetches it with the HTML instead of after the
 * stylesheet and scripts. Only the first slide: later slides load on demand.
 * Phones and tablets also get the honeycomb texture behind the headline early:
 * it is the largest thing they paint first.
 */
function HeroPreload({
  slide,
  portraitOnPhones,
}: {
  slide: PublicHeroSlide;
  portraitOnPhones: boolean;
}) {
  const wide = responsiveImage(slide.desktopImageUrl, SIZES_WIDE);
  const tall =
    portraitOnPhones && slide.mobileImageUrl
      ? responsiveImage(slide.mobileImageUrl, SIZES_PORTRAIT)
      : null;
  return (
    <>
      {tall ? (
        <link
          rel="preload"
          as="image"
          href={tall.src}
          imageSrcSet={tall.srcSet}
          imageSizes={tall.sizes}
          media={PHONE}
          fetchPriority="high"
        />
      ) : null}
      <link
        rel="preload"
        as="image"
        href={wide.src}
        imageSrcSet={wide.srcSet}
        imageSizes={wide.sizes}
        media={tall ? NOT_PHONE : undefined}
        fetchPriority="high"
      />
      <link
        rel="preload"
        as="image"
        href="/brand/honeycomb.webp"
        type="image/webp"
        media="(max-width: 1023px)"
        fetchPriority="high"
      />
    </>
  );
}

/** Previous / dots with rotation progress / next / pause, in one frosted cluster. */
function Controls({
  count,
  index,
  cycle,
  slides,
  showArrows,
  showDots,
  autoplay,
  running,
  userPaused,
  intervalMs,
  onGo,
  onTogglePause,
}: {
  count: number;
  index: number;
  cycle: number;
  slides: PublicHeroSlide[];
  showArrows: boolean;
  showDots: boolean;
  autoplay: boolean;
  running: boolean;
  userPaused: boolean;
  intervalMs: number;
  onGo: (i: number) => void;
  onTogglePause: () => void;
}) {
  const t = useTranslations('marketplace.home.hero');
  return (
    <div className="flex items-center gap-1 rounded-full bg-white/85 p-1 shadow-tile ring-1 ring-white/60 backdrop-blur">
      {showArrows ? (
        <ControlButton label={t('previous')} onClick={() => onGo(index - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </ControlButton>
      ) : null}
      {showDots ? (
        <div className="flex items-center px-1">
          {slides.map((s, i) => {
            const active = i === index;
            return (
              // The dot stays 8px; the button around it is a 32px touch target.
              <button
                key={s.id}
                type="button"
                onClick={() => onGo(i)}
                aria-label={t('goTo', { position: i + 1, total: count })}
                aria-current={active ? 'true' : undefined}
                className="group flex h-8 min-w-8 items-center justify-center px-[3px]"
              >
                <span
                  className={cn(
                    'relative block h-2 overflow-hidden rounded-full transition-all duration-300',
                    active
                      ? 'w-8 bg-brown-900/15'
                      : 'w-2 bg-brown-900/30 group-hover:bg-brown-900/50',
                  )}
                >
                  {active ? (
                    <ProgressFill
                      key={`${index}-${cycle}`}
                      autoplay={autoplay}
                      running={running}
                      ms={intervalMs}
                      onDone={() => onGo(index + 1)}
                    />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : autoplay ? (
        // Arrows only: the timer still runs, without a visible indicator.
        <span className="sr-only">
          <ProgressFill
            key={`${index}-${cycle}`}
            autoplay
            running={running}
            ms={intervalMs}
            onDone={() => onGo(index + 1)}
          />
        </span>
      ) : null}
      {showArrows ? (
        <ControlButton label={t('next')} onClick={() => onGo(index + 1)}>
          <ChevronRight className="h-4 w-4" />
        </ControlButton>
      ) : null}
      {autoplay ? (
        <ControlButton label={userPaused ? t('play') : t('pause')} onClick={onTogglePause}>
          {userPaused ? (
            <Play className="h-3.5 w-3.5" fill="currentColor" />
          ) : (
            <Pause className="h-3.5 w-3.5" fill="currentColor" />
          )}
        </ControlButton>
      ) : null}
    </div>
  );
}

/** The rotation timer: a CSS animation whose end advances the slide (paused = paused). */
function ProgressFill({
  autoplay,
  running,
  ms,
  onDone,
}: {
  autoplay: boolean;
  running: boolean;
  ms: number;
  onDone: () => void;
}) {
  if (!autoplay) return <span className="absolute inset-0 rounded-full bg-gold-500" />;
  return (
    <span
      className="hero-fill absolute inset-0 rounded-full bg-gold-500"
      style={{ animationDuration: `${ms}ms`, animationPlayState: running ? 'running' : 'paused' }}
      onAnimationEnd={onDone}
    />
  );
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-full text-brown-900 transition hover:bg-gold-50 sm:h-9 sm:w-9"
    >
      {children}
    </button>
  );
}
