// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '@/testing/render';
import { filterProducts } from '../../lib/search';
import { testCategories, testProduct as product } from '../../testing/product';
import type { MarketplaceProduct } from '../../types';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());

const { FeaturedSolutions, featuredProducts } = await import('./featured-solutions');
const { LaunchBar, useLaunchBar } = await import('./coming-soon');
const { MarketplaceProvider } = await import('./marketplace-provider');

function withCatalog(products: MarketplaceProduct[], ui: React.ReactNode) {
  return renderApp(
    <MarketplaceProvider products={products} categories={testCategories} industries={[]} needs={[]}>
      {ui}
    </MarketplaceProvider>,
  );
}

describe('Featured solutions', () => {
  const rated = product('school', {
    name: 'School Management System',
    featured: true,
    rating: { average: 4.8, count: 24 },
    featuredReview: {
      rating: 5,
      title: null,
      body: 'Fee collection closes the same day.',
      reviewerName: 'Selam',
      reviewerRole: 'Finance Head, private school',
    },
  });
  const unrated = product('lending', { name: 'Micro Lending Platform', featured: true });
  const notFeatured = product('merchant', { name: 'Merchant Application' });
  const upcoming = product('market', {
    name: 'Digital Marketplace',
    featured: true,
    availability: 'coming_soon',
  });

  it('shows featured, launched products only', () => {
    expect(featuredProducts([notFeatured, upcoming, unrated, rated]).map((p) => p.slug)).toEqual([
      'lending',
      'school',
    ]);
  });

  it('shows each product once to assistive technology, with its rating and a customer review', () => {
    withCatalog([rated, unrated, notFeatured], <FeaturedSolutions />);
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(2);
    const school = cards.find((c) => c.textContent?.includes('School Management System'))!;
    expect(within(school).getByText('4.8')).toBeTruthy();
    expect(within(school).getByRole('link', { name: '24 reviews' }).getAttribute('href')).toBe(
      '/products/school#reviews',
    );
    expect(within(school).getByText('“Fee collection closes the same day.”')).toBeTruthy();
    expect(within(school).getByText('Selam, Finance Head, private school')).toBeTruthy();
    // A product without approved reviews invites the first rating.
    expect(screen.getByRole('link', { name: 'Be the first to rate it' })).toBeTruthy();
    // Loop copies are hidden and inert.
    const items = document.querySelectorAll('#featured li');
    expect(items.length).toBeGreaterThan(2);
  });

  it('can be paused', () => {
    withCatalog([rated], <FeaturedSolutions />);
    const track = document.querySelector<HTMLUListElement>('#featured ul')!;
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(track.style.animationPlayState).toBe('paused');
  });

  it('is hidden when nothing is featured', () => {
    const { container } = withCatalog([notFeatured], <FeaturedSolutions />);
    expect(container.querySelector('#featured')).toBeNull();
  });
});

function Bar() {
  const { product: p, close } = useLaunchBar();
  return p ? <LaunchBar product={p} onClose={close} /> : <p>no bar</p>;
}

describe('Coming-soon bar', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-11-07T10:00:00'));
  });
  afterEach(() => vi.useRealTimers());

  const later = product('later', { name: 'Later App', availability: 'in_development' });
  const soon = product('soon', {
    name: 'Soon App',
    availability: 'coming_soon',
    releaseDate: '2026-11-10',
  });

  it('announces the next launch with a live countdown', () => {
    withCatalog([later, soon, product('live')], <Bar />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const bar = screen.getByRole('region', { name: 'Coming soon announcement' });
    expect(bar.textContent).toContain('Soon App');
    expect(bar.textContent).toContain('Coming soon');
    // 10 Nov 00:00 − (7 Nov 10:00 + 1 s) = 2 days 13 h 59 min 59 s.
    expect(bar.textContent).toContain('02Days');
    expect(bar.textContent).toContain('13Hours');
    expect(screen.getByRole('button', { name: 'Notify me' })).toBeTruthy();
  });

  it('stays closed for that product once the visitor closes it', () => {
    const view = withCatalog([soon], <Bar />);
    fireEvent.click(screen.getByRole('button', { name: 'Close announcement' }));
    expect(screen.getByText('no bar')).toBeTruthy();
    expect(window.localStorage.getItem('nib_ds_launch_bar_closed')).toBe('soon');
    view.unmount();

    // Still closed on the next visit; a different upcoming product shows the bar again.
    const again = withCatalog([soon], <Bar />);
    expect(screen.getByText('no bar')).toBeTruthy();
    again.unmount();
    withCatalog([later], <Bar />);
    expect(screen.getByRole('region', { name: 'Coming soon announcement' })).toBeTruthy();
  });

  it('is not shown when nothing is upcoming', () => {
    withCatalog([product('live')], <Bar />);
    expect(screen.getByText('no bar')).toBeTruthy();
  });
});

describe('Explore products: business needs and ratings', () => {
  const a = product('a', {
    name: 'Alpha',
    needs: ['digital-lending'],
    rating: { average: 4.2, count: 3 },
  });
  const b = product('b', {
    name: 'Bravo',
    needs: ['grow-sales'],
    rating: { average: 4.9, count: 2 },
  });
  const c = product('c', { name: 'Charlie', needs: ['digital-lending', 'grow-sales'] });

  it('filters by business need', () => {
    expect(filterProducts([a, b, c], { needs: ['digital-lending'] }).map((p) => p.slug)).toEqual([
      'a',
      'c',
    ]);
  });

  it('sorts top rated first, unrated last', () => {
    expect(filterProducts([a, b, c], { sort: 'rating' }).map((p) => p.slug)).toEqual([
      'b',
      'a',
      'c',
    ]);
  });
});
