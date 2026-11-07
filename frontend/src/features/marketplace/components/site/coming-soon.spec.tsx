// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '@/testing/render';
import type { MarketplaceProduct } from '../../types';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());

const { UpcomingProducts } = await import('./coming-soon');
const { MarketplaceProvider } = await import('./marketplace-provider');

function product(slug: string, overrides: Partial<MarketplaceProduct> = {}): MarketplaceProduct {
  return {
    id: `id-${slug}`,
    slug,
    name: `Product ${slug}`,
    tagline: `Tagline of ${slug}`,
    summary: `Summary of ${slug}, long enough to read.`,
    overview: '',
    problem: '',
    categoryCode: 'business-management',
    availability: 'available',
    releaseDate: null,
    featured: false,
    customizable: true,
    icon: 'Package',
    accent: '#8A4D1F',
    industries: [],
    needs: [],
    deployment: ['cloud'],
    platforms: ['web'],
    keyFeatures: ['One', 'Two', 'Three'],
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z',
    content: {
      benefits: [],
      modules: [],
      screenshots: [{ id: 's1', title: 'Dashboard', caption: '', variant: 'dashboard' }],
      demo: null,
      targetCustomers: [],
      integrations: [],
      integrationNotes: '',
      faqs: [],
      screenLabels: {
        kpis: [
          { label: 'A', value: '1' },
          { label: 'B', value: '2' },
          { label: 'C', value: '3' },
        ],
        rows: ['Row 1', 'Row 2', 'Row 3'],
        mobileTitle: 'Home',
      },
    },
    ...overrides,
  } as MarketplaceProduct;
}

function renderSection(products: MarketplaceProduct[]) {
  return renderApp(
    <MarketplaceProvider
      products={products}
      categories={[
        {
          code: 'business-management',
          name: 'Business Management',
          description: '',
          icon: 'Briefcase',
          sortOrder: 1,
        },
      ]}
      industries={[]}
      needs={[]}
    >
      <UpcomingProducts />
    </MarketplaceProvider>,
  );
}

describe('Coming soon section', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-11-06T10:00:00'));
  });
  afterEach(() => vi.useRealTimers());

  it('is not shown when no product is coming soon or in development', () => {
    const { container } = renderSection([
      product('live'),
      product('pilot', { availability: 'pilot' }),
    ]);
    expect(container.querySelector('#upcoming')).toBeNull();
  });

  it('puts the soonest dated product in the spotlight with a live countdown', () => {
    renderSection([
      product('later', { availability: 'in_development' as never }),
      product('soon', { availability: 'coming_soon', releaseDate: '2026-11-18' }),
      product('live'),
    ]);
    const spotlight = screen.getByText('Next launch').closest('article')!;
    expect(within(spotlight).getByRole('heading', { name: 'Product soon' })).toBeTruthy();
    // 2026-11-06 10:00 → 2026-11-18 00:00 = 11 days 14 hours 0 minutes.
    const countdown = within(spotlight).getByLabelText(/Time left until/);
    expect(countdown.textContent).toMatch(/11Days14Hours00Min00Sec/);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(countdown.textContent).toMatch(/59Sec/);

    // The other upcoming product follows as a card; launched products are not listed.
    expect(screen.getByText('Also on the way')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Product later' })).toBeTruthy();
    expect(screen.queryByText('Product live')).toBeNull();
  });

  it('explains a missing or passed release date instead of counting down', () => {
    const { unmount } = renderSection([product('undated', { availability: 'coming_soon' })]);
    expect(screen.getByText('Release date to be announced')).toBeTruthy();
    unmount();
    renderSection([product('overdue', { availability: 'coming_soon', releaseDate: '2026-11-01' })]);
    expect(screen.getByText('Launching any day now')).toBeTruthy();
  });

  it('"Notify me" opens the inquiry form for that product', () => {
    renderSection([product('soon', { availability: 'coming_soon', releaseDate: '2026-11-18' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Notify me' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(
      (
        screen.getByDisplayValue(
          'Please let me know when Product soon is available.',
        ) as HTMLElement
      ).tagName,
    ).toBe('TEXTAREA');
  });
});
