// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '@/testing/render';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());

const { PageHero } = await import('./site-shell');

const LEAD =
  'Suggest a digital product for your business or sector, and vote for the ideas you want.';

describe('Page header on phones', () => {
  it('opens on a compact title: the eyebrow is dropped and the lead is for screen readers only', () => {
    renderApp(
      <PageHero eyebrow="Idea board" title="What should we build next?" lead={LEAD}>
        <a href="#suggest">Suggest an idea</a>
      </PageHero>,
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'What should we build next?' }),
    ).toBeTruthy();
    // Still in the page (screen readers, search engines); hidden on phones only.
    expect(screen.getByText(LEAD).className).toContain('max-sm:sr-only');
    expect(screen.getByText('Idea board').className).toContain('max-sm:hidden');
    // The page's own controls stay visible.
    expect(
      screen.getByRole('link', { name: 'Suggest an idea' }).closest('[class*="sr-only"]'),
    ).toBeNull();
  });
});
