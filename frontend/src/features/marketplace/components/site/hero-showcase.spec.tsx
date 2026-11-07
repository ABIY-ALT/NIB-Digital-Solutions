// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
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
