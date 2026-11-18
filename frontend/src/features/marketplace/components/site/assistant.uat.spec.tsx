// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFailure, mockApi, navigation, renderApp } from '@/testing/render';
import { readBackendFile, seedTaxonomy } from '../../testing/seed-taxonomy';
import type { AssistantReply, MarketplaceProduct } from '../../types';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());

const { AssistantChat } = await import('./assistant');
const { MarketplaceProvider } = await import('./marketplace-provider');

// ─────────────────────────────────────────────────────────────────────────────
// UAT — the chat widget in the browser, with no AI key configured: the
// server answers "not configured" (503) and the on-device assistant replies.
// The answers themselves are accepted in assistant/assistant.uat.spec.ts.
// ─────────────────────────────────────────────────────────────────────────────

const seed = JSON.parse(readBackendFile('prisma/seed-marketplace.json')) as {
  products: Omit<MarketplaceProduct, 'id' | 'updatedAt'>[];
};
const products: MarketplaceProduct[] = seed.products.map(
  (p, i) => ({ ...p, id: `p${i}`, updatedAt: p.createdAt }) as MarketplaceProduct,
);
const taxonomy = seedTaxonomy();
const ASSISTANT = 'POST /api/marketplace/assistant';
const NOT_CONFIGURED = new ApiFailure(
  503,
  'SERVICE_UNAVAILABLE',
  'The hosted assistant is not configured.',
);

function server(assistant: unknown = NOT_CONFIGURED) {
  return mockApi({ [ASSISTANT]: assistant, 'POST /api/marketplace/events': {} });
}

function renderChat(focusSlug?: string) {
  const focus = focusSlug ? products.find((p) => p.slug === focusSlug) : undefined;
  return renderApp(
    <MarketplaceProvider
      products={products}
      categories={[]}
      industries={taxonomy.industries}
      needs={taxonomy.needs}
    >
      <AssistantChat focusProduct={focus} variant="embedded" />
    </MarketplaceProvider>,
  );
}

const input = () => screen.getByRole('textbox', { name: 'Your question' });
function type(text: string) {
  fireEvent.change(input(), { target: { value: text } });
  fireEvent.keyDown(input(), { key: 'Enter' });
}
const assistantCalls = (api: ReturnType<typeof server>) =>
  api.calls.filter((c) => c.method === 'POST' && c.path === '/api/marketplace/assistant');

beforeEach(() => {
  navigation.push.mockClear();
});

describe('UAT-UI · Digital Solutions Assistant chat (no AI key)', () => {
  it('UAT-UI01 · opens with the greeting and six suggested questions', () => {
    server();
    renderChat();
    expect(screen.getByText(/Not sure which solution is right for your business/)).toBeTruthy();
    for (const q of [
      'What products do you have for schools?',
      'Which product can automate building management?',
      'Do you have a digital lending solution?',
      'Can your products be customized?',
      'Which products support mobile applications?',
      'Can your products integrate with existing systems?',
    ])
      expect(screen.getByRole('button', { name: q })).toBeTruthy();
  });

  it('UAT-UI02 · a suggested question is answered from the catalog', async () => {
    const api = server();
    renderChat();
    fireEvent.click(screen.getByRole('button', { name: 'What products do you have for schools?' }));
    expect(await screen.findByText(/I'd recommend/)).toBeTruthy();
    expect(screen.getAllByText('School Management System').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Request a demo' })).toBeTruthy();
    // The hosted assistant was tried first, and the question is counted in the analytics.
    expect(assistantCalls(api)).toHaveLength(1);
    await waitFor(() =>
      expect(
        api.calls.some(
          (c) =>
            c.path === '/api/marketplace/events' &&
            (c.body as { type: string }).type === 'assistant_query',
        ),
      ).toBe(true),
    );
  });

  it('UAT-UI03 · a typed question is sent with Enter and the box is cleared', async () => {
    server();
    renderChat();
    type('Which products are in pilot?');
    expect(await screen.findByText(/These products are in our pilot program/)).toBeTruthy();
    expect((input() as HTMLTextAreaElement).value).toBe('');
  });

  it('UAT-UI04 · product cards in an answer open the product page', async () => {
    server();
    renderChat();
    type('Which products have USSD?');
    await screen.findByText(/These products are available on USSD/);
    const card = screen
      .getAllByRole('button')
      .find((b) => b.textContent?.trim() === 'SACCOS Automation');
    expect(card).toBeTruthy();
    fireEvent.click(card!);
    expect(navigation.push).toHaveBeenCalledWith('/products/saccos-automation');
  });

  it('UAT-UI05 · "Request a demo" opens the demo request form', async () => {
    server();
    renderChat();
    type('I want a demo of the school system');
    fireEvent.click(await screen.findByRole('button', { name: 'Request a demo' }));
    expect(await screen.findByRole('dialog', { name: 'Request a demo' })).toBeTruthy();
  });

  it('UAT-UI06 · "Request pricing" opens a pricing inquiry, and no price is shown', async () => {
    server();
    renderChat();
    type('How much does the SACCOS system cost?');
    expect(await screen.findByText(/Pricing isn't published/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Request pricing' }));
    expect(await screen.findByRole('dialog', { name: 'Pricing inquiry' })).toBeTruthy();
  });

  it('UAT-UI07 · an answer the catalog cannot confirm is highlighted and offers the team', async () => {
    server();
    renderChat();
    type('Does the bus ticket platform support GPS tracking with drones?');
    const text = await screen.findByText(/so I can't confirm it/);
    expect(text.closest('.bg-amber-50')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ask the product team' })).toBeTruthy();
  });

  it('UAT-UI08 · an account number is never sent to the server, now or later', async () => {
    const api = server();
    renderChat();
    type('my account number is 1000123456789');
    expect(await screen.findByText(/please don't share account numbers/)).toBeTruthy();
    expect(assistantCalls(api)).toHaveLength(0);

    type('Which products are in pilot?');
    await screen.findByText(/These products are in our pilot program/);
    const calls = assistantCalls(api);
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls[0]!.body)).not.toContain('1000123456789');
  });

  it('UAT-UI09 · a phone number is not sent to the server; the contact form is offered', async () => {
    const api = server();
    renderChat();
    type('call me on 0911223344');
    expect(await screen.findByText(/through the contact form/)).toBeTruthy();
    expect(assistantCalls(api)).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Contact the team' })).toBeTruthy();
  });

  it('UAT-UI10 · when an AI key is configured later, its answer is shown instead', async () => {
    const hosted: AssistantReply = {
      text: 'Answer from the hosted assistant.',
      products: ['school-management-system'],
      actions: [{ kind: 'demo', slug: 'school-management-system', label: 'Request a demo' }],
      sources: ['School Management System · FAQ'],
      grounded: true,
    };
    server(hosted);
    renderChat();
    type('Tell me about the school system');
    expect(await screen.findByText('Answer from the hosted assistant.')).toBeTruthy();
  });

  it('UAT-UI11 · too many questions: asks the visitor to wait or contact the team', async () => {
    server(new ApiFailure(429, 'RATE_LIMITED', 'Too many requests', 30));
    renderChat();
    type('Tell me about the school system');
    expect(await screen.findByText(/asked a lot of questions in a short time/)).toBeTruthy();
  });

  it('UAT-UI12 · "Start a new conversation" clears the chat', async () => {
    server();
    renderChat();
    type('hello');
    await screen.findByText(/Tell me about your business/);
    fireEvent.click(screen.getByRole('button', { name: 'Start a new conversation' }));
    expect(screen.queryByText(/Tell me about your business/)).toBeNull();
    expect(
      screen.getByRole('button', { name: 'What products do you have for schools?' }),
    ).toBeTruthy();
  });

  it('UAT-UI13 · a one-letter question cannot be sent', () => {
    server();
    renderChat();
    fireEvent.change(input(), { target: { value: 'a' } });
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('UAT-UI14 · on a product page, the suggestions and answers are about that product', async () => {
    server();
    renderChat('loan-origination-system');
    expect(screen.getByText(/Ask me anything about Loan Origination System/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Is there a mobile app?' }));
    const reply = await screen.findByText(/is a web application/);
    expect(within(reply.closest('div')!).getByText('Loan Origination System')).toBeTruthy();
  });
});
