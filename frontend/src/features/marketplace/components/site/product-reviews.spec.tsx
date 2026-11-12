// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, renderApp } from '@/testing/render';
import { testCategories, testProduct } from '../../testing/product';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());

const { ProductReviews } = await import('./product-reviews');
const { MarketplaceProvider } = await import('./marketplace-provider');

const product = testProduct('school', { name: 'School Management System' });
const PATH = '/api/marketplace/products/school/reviews';

const reviews = {
  summary: { average: 4.5, count: 2, distribution: [0, 0, 0, 1, 1] },
  reviews: [
    {
      reference: 'REV-261107-AAAAA',
      rating: 5,
      title: 'Fee collection in a day',
      body: 'Parents pay from their phones.',
      reviewerName: 'Selam T.',
      reviewerRole: 'Finance Head, private school',
      reply: 'Thank you, Selam!',
      createdAt: '2026-11-01T08:00:00.000Z',
    },
    {
      reference: 'REV-261107-BBBBB',
      rating: 4,
      title: null,
      body: 'Strong, with a short learning curve.',
      reviewerName: 'Hanna G.',
      reviewerRole: null,
      reply: null,
      createdAt: '2026-10-20T08:00:00.000Z',
    },
  ],
};

function renderReviews() {
  return renderApp(
    <MarketplaceProvider
      products={[product]}
      categories={testCategories}
      industries={[]}
      needs={[]}
    >
      <ProductReviews product={product} />
    </MarketplaceProvider>,
  );
}

describe('Product reviews', () => {
  it('shows the rating, the approved reviews and the team reply; filters by stars', async () => {
    const api = mockApi({
      [`GET ${PATH}`]: ({ url }: { url: URL }) =>
        url.searchParams.get('rating') === '5'
          ? { ...reviews, reviews: [reviews.reviews[0]] }
          : reviews,
    });
    renderReviews();
    expect(await screen.findByText('Fee collection in a day')).toBeTruthy();
    expect(screen.getByText('4.5')).toBeTruthy();
    expect(screen.getByText('Based on 2 reviews')).toBeTruthy();
    expect(screen.getByText('Thank you, Selam!')).toBeTruthy();
    expect(screen.getByText('Showing 2 of 2 reviews')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '5 stars: 1 review' }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.path === PATH && c.query.get('rating') === '5')).toBe(true),
    );
    expect(await screen.findByText('1 review with 5 stars')).toBeTruthy();
    // Star ratings without reviews cannot be chosen.
    expect(
      (screen.getByRole('button', { name: '1 star: 0 reviews' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('invites the first review when there is none', async () => {
    mockApi({ [`GET ${PATH}`]: { summary: null, reviews: [] } });
    renderReviews();
    expect(await screen.findByText('Be the first to rate School Management System.')).toBeTruthy();
  });

  it('asks for a rating, then sends the review for approval', async () => {
    const api = mockApi({
      [`GET ${PATH}`]: { summary: null, reviews: [] },
      [`POST ${PATH}`]: { reference: 'REV-261107-CCCCC' },
    });
    renderReviews();
    const form = (
      await screen.findByRole('heading', { name: 'Rate School Management System' })
    ).closest('form')!;
    fireEvent.submit(form);
    expect(await within(form).findByText('Please choose a rating from 1 to 5 stars.')).toBeTruthy();

    fireEvent.click(within(form).getByRole('button', { name: '4 stars' }));
    fireEvent.change(within(form).getByLabelText(/Your review/), {
      target: { value: 'It saved our finance office days every term.' },
    });
    fireEvent.change(within(form).getByLabelText(/Your name/), { target: { value: 'Dawit' } });
    fireEvent.change(within(form).getByLabelText(/E-mail/), {
      target: { value: 'Dawit@Example.org' },
    });
    fireEvent.submit(form);

    expect(await screen.findByText('Thank you for your review')).toBeTruthy();
    const post = api.calls.find((c) => c.method === 'POST' && c.path === PATH)!;
    expect(post.body).toMatchObject({
      rating: 4,
      body: 'It saved our finance office days every term.',
      reviewerName: 'Dawit',
      reviewerEmail: 'dawit@example.org',
      title: null,
      reviewerRole: null,
      meta: { honeypot: '' },
    });
  });

  it('accepts a star rating alone: review, name and e-mail are optional', async () => {
    const api = mockApi({
      [`GET ${PATH}`]: { summary: null, reviews: [] },
      [`POST ${PATH}`]: { reference: 'REV-261112-DDDDD' },
    });
    renderReviews();
    const form = (
      await screen.findByRole('heading', { name: 'Rate School Management System' })
    ).closest('form')!;
    expect(within(form).getByText(/Only your star rating is required/)).toBeTruthy();

    fireEvent.click(within(form).getByRole('button', { name: '5 stars' }));
    fireEvent.submit(form);

    expect(await screen.findByText('Thank you for your review')).toBeTruthy();
    const post = api.calls.find((c) => c.method === 'POST' && c.path === PATH)!;
    expect(post.body).toMatchObject({
      rating: 5,
      title: null,
      body: null,
      reviewerName: null,
      reviewerRole: null,
      reviewerEmail: null,
    });
  });

  it('still checks an e-mail address when one is given', async () => {
    const api = mockApi({ [`GET ${PATH}`]: { summary: null, reviews: [] } });
    renderReviews();
    const form = (
      await screen.findByRole('heading', { name: 'Rate School Management System' })
    ).closest('form')!;
    fireEvent.click(within(form).getByRole('button', { name: '3 stars' }));
    fireEvent.change(within(form).getByLabelText(/E-mail/), { target: { value: 'not-an-email' } });
    fireEvent.submit(form);
    expect(await within(form).findByText('Please check the highlighted fields.')).toBeTruthy();
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('shows a star-only review as "Customer", without an empty text block', async () => {
    mockApi({
      [`GET ${PATH}`]: {
        summary: { average: 4, count: 1, distribution: [0, 0, 0, 1, 0] },
        reviews: [
          {
            reference: 'REV-261112-EEEEE',
            rating: 4,
            title: null,
            body: null,
            reviewerName: null,
            reviewerRole: null,
            reply: null,
            createdAt: '2026-11-12T08:00:00.000Z',
          },
        ],
      },
    });
    renderReviews();
    expect(await screen.findByText('Customer')).toBeTruthy();
    expect(screen.getByText('Based on 1 review')).toBeTruthy();
  });
});
