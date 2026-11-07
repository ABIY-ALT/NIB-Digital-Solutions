// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '@/testing/render';
import type { PublicIdea } from '../../types';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());

const { IdeaCard } = await import('./ideas-page');
const { MarketplaceProvider } = await import('./marketplace-provider');

const idea = (overrides: Partial<PublicIdea> = {}): PublicIdea =>
  ({
    reference: 'IDEA-1',
    title: 'Clinic queue management',
    problem: 'Patients wait for hours without knowing their turn.',
    status: 'approved',
    categoryCode: null,
    suggestedBy: 'Abiy',
    voteCount: 2,
    votable: true,
    voted: false,
    createdAt: '2026-11-06T08:00:00.000Z',
    ...overrides,
  }) as PublicIdea;

function renderCard(value: PublicIdea) {
  return renderApp(
    <MarketplaceProvider products={[]} categories={[]} industries={[]} needs={[]}>
      <IdeaCard idea={value} />
    </MarketplaceProvider>,
  );
}

describe('Idea vote button', () => {
  it('invites a vote with a clear "Vote" label', () => {
    renderCard(idea());
    const button = screen.getByRole('button', { name: 'Vote for “Clinic queue management”' });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.textContent).toBe('2Vote');
  });

  it('shows "Voted" once this visitor has voted', () => {
    renderCard(idea({ voted: true, voteCount: 3 }));
    const button = screen.getByRole('button', {
      name: 'You voted for “Clinic queue management”',
    });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.textContent).toBe('3Voted');
  });

  it('only shows the count when voting is closed', () => {
    renderCard(idea({ votable: false, status: 'completed', voteCount: 1 }));
    const button = screen.getByRole('button', { name: '1vote' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.hasAttribute('aria-pressed')).toBe(false);
  });
});
