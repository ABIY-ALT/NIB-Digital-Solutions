// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '@/testing/render';
import type { Testimonial } from '../../testimonials';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());

const { Testimonials } = await import('./testimonials');
const { MarketplaceProvider } = await import('./marketplace-provider');
const { visibleTestimonials } = await import('../../testimonials');

const quote = (id: string, overrides: Partial<Testimonial> = {}): Testimonial => ({
  id,
  quote: `Quote ${id}`,
  name: `Person ${id}`,
  role: 'Manager',
  organization: `Org ${id}`,
  rating: 5,
  ...overrides,
});

function renderSection(items: Testimonial[]) {
  return renderApp(
    <MarketplaceProvider products={[]} categories={[]} industries={[]} needs={[]}>
      <Testimonials items={items} />
    </MarketplaceProvider>,
  );
}

describe('Testimonials section', () => {
  it('is hidden when there is nothing to show', () => {
    const { container } = renderSection([]);
    expect(container.querySelector('#testimonials')).toBeNull();
  });

  it('exposes each testimonial once, keeping loop copies out of reach', () => {
    renderSection([quote('a'), quote('b')]);
    // Role queries skip aria-hidden content: what a screen reader would reach.
    const cards = screen.getAllByRole('figure');
    expect(cards.map((card) => card.querySelector('figcaption p')?.textContent)).toEqual([
      'Person a',
      'Person b',
    ]);
    // The track repeats the cards to fill the screen: the copies are hidden and inert.
    const items = document.querySelectorAll('#testimonials li');
    expect(items.length).toBeGreaterThan(2);
    expect([...items].filter((li) => li.getAttribute('aria-hidden') !== 'true')).toHaveLength(2);
  });

  it('splits many testimonials over two rows moving in opposite directions', () => {
    renderSection(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => quote(id)));
    const tracks = document.querySelectorAll<HTMLUListElement>('#testimonials ul');
    expect(tracks).toHaveLength(2);
    expect(tracks[1]!.style.animationDirection).toBe('reverse');
  });

  it('can be paused and resumed', () => {
    renderSection([quote('a')]);
    const track = document.querySelector<HTMLUListElement>('#testimonials ul')!;
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(track.style.animationPlayState).toBe('paused');
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(track.style.animationPlayState).toBe('');
  });

  it('never shows sample testimonials in production', () => {
    const list = [quote('real'), quote('demo', { sample: true })];
    expect(visibleTestimonials(list, true).map((x) => x.id)).toEqual(['real']);
    expect(visibleTestimonials(list, false)).toHaveLength(2);
  });
});
