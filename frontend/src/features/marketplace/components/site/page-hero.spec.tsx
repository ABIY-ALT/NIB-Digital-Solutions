// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '@/testing/render';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());

const { PageHero } = await import('./site-shell');

const LONG =
  "NIB Digital Solutions is the product arm of NIB International Bank's digital transformation program. We build platforms for the institutions and businesses we serve.";

describe('Page header introduction on phones', () => {
  it('offers "Read more" for a long introduction and keeps the whole text in the page', () => {
    renderApp(<PageHero title="About" lead={LONG} />);
    const lead = screen.getByText(LONG);
    expect(lead.className).toContain('max-sm:line-clamp-3');

    const more = screen.getByRole('button', { name: 'Read more' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);

    expect(lead.className).not.toContain('line-clamp');
    expect(screen.getByRole('button', { name: 'Show less' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('shows a short introduction whole, without a button', () => {
    renderApp(<PageHero title="Products" lead="Search by product name or business need." />);
    expect(screen.queryByRole('button', { name: 'Read more' })).toBeNull();
  });
});
