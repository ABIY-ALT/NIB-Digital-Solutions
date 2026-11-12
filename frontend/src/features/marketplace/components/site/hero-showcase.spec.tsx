// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '@/testing/render';
import type { PublicHeroCarousel } from '../../types';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());

const { HeroShowcase } = await import('./hero-showcase');
const { MarketplaceProvider } = await import('./marketplace-provider');

const noSlides = { slides: [], settings: {} } as unknown as PublicHeroCarousel;

function renderHero() {
  return renderApp(
    <MarketplaceProvider products={[]} categories={[]} industries={[]} needs={[]}>
      <HeroShowcase carousel={noSlides} />
    </MarketplaceProvider>,
  );
}

const media = (n: number) => `/api/marketplace/media/00000000-0000-4000-8000-00000000000${n}`;
const twoSlides = {
  settings: {
    autoplay: true,
    intervalSeconds: 7,
    transitionMs: 700,
    pauseOnHover: true,
    navigation: 'arrows-and-dots',
  },
  slides: [1, 2].map((n) => ({
    id: `s${n}`,
    title: null,
    description: null,
    ctaLabel: null,
    ctaHref: null,
    altText: `Slide ${n}`,
    desktopImageUrl: media(n),
    mobileImageUrl: null,
  })),
} as PublicHeroCarousel;

function renderCarousel() {
  return renderApp(
    <MarketplaceProvider products={[]} categories={[]} industries={[]} needs={[]}>
      <HeroShowcase carousel={twoSlides} />
    </MarketplaceProvider>,
  );
}

describe('Hero image loading', () => {
  it('loads only the first picture with the page, sized for the screen and at high priority', async () => {
    const { container } = renderCarousel();
    const imgs = () => container.querySelectorAll<HTMLImageElement>('.hero-slide img');
    expect(imgs()).toHaveLength(1);
    const first = imgs()[0]!;
    expect(first.getAttribute('loading')).toBe('eager');
    expect(first.getAttribute('fetchpriority')).toBe('high');
    expect(first.getAttribute('srcset')).toContain(encodeURIComponent(media(1)));
    expect(first.getAttribute('sizes')).toContain('calc(100vw - 32px)');
    expect(
      document.querySelector(
        `link[rel="preload"][as="image"][fetchpriority="high"][imagesrcset*="${encodeURIComponent(media(1))}"]`,
      ),
    ).not.toBeNull();
    // Only the first slide is preloaded.
    expect(
      document.querySelector(`link[imagesrcset*="${encodeURIComponent(media(2))}"]`),
    ).toBeNull();

    // The next slide's picture follows once the page has loaded, at low priority.
    await waitFor(() => expect(imgs()).toHaveLength(2));
    expect(imgs()[1]!.getAttribute('loading')).toBe('lazy');
    expect(imgs()[1]!.getAttribute('fetchpriority')).toBe('low');
  });

  it('offers the way into the catalogue under the picture (phones and tablets)', () => {
    renderCarousel();
    expect(screen.getByRole('link', { name: /explore our products/i }).getAttribute('href')).toBe(
      '/products',
    );
  });
});

function reducedMotion(on: boolean) {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    ...original(query),
    matches: on && query.includes('prefers-reduced-motion'),
  })) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

describe('Hero cursor light', () => {
  let restore: () => void = () => {};
  afterEach(() => restore());

  it('follows the mouse and fades out when it leaves', () => {
    renderHero();
    const glow = screen.getByTestId('hero-glow');
    const area = glow.parentElement!;
    expect(glow.dataset.on).toBe('false');

    fireEvent.pointerMove(area, { clientX: 120, clientY: 80, pointerType: 'mouse' });
    expect(glow.dataset.on).toBe('true');

    fireEvent.pointerLeave(area);
    expect(glow.dataset.on).toBe('false');
  });

  it('ignores touch', () => {
    renderHero();
    const glow = screen.getByTestId('hero-glow');
    fireEvent.pointerMove(glow.parentElement!, { clientX: 10, clientY: 10, pointerType: 'touch' });
    expect(glow.dataset.on).toBe('false');
  });

  it('stays off with reduced motion', () => {
    restore = reducedMotion(true);
    renderHero();
    const glow = screen.getByTestId('hero-glow');
    fireEvent.pointerMove(glow.parentElement!, { clientX: 10, clientY: 10, pointerType: 'mouse' });
    expect(glow.dataset.on).toBe('false');
  });
});
