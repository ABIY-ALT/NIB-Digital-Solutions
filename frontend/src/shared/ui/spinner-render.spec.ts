import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LoadingOverlay, PageLoader, ProgressBar, Spinner } from './spinner';

const render = (node: ReactElement) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale: 'en',
      messages: { common: { loading: 'Loading…' } },
      children: node,
    }),
  );

describe('loading kit (server render)', () => {
  it.each(['ring', 'comet', 'dots', 'bars', 'orbit', 'pulse'] as const)(
    'renders the %s spinner as an announced status',
    (variant) => {
      const html = render(createElement(Spinner, { variant }));
      expect(html).toContain('role="status"');
      expect(html).toContain('data-motion="essential"');
      expect(html).toContain('Loading…');
    },
  );

  it('uses a safe gradient id for the brand ring', () => {
    const html = render(createElement(Spinner, { variant: 'ring', tone: 'brand' }));
    const id = /<linearGradient id="([^"]+)"/.exec(html)?.[1];
    expect(id).toMatch(/^loader-[A-Za-z0-9_-]+$/);
    expect(html).toContain(`url(#${id})`);
  });

  it('hides decorative spinners and shows visible labels on request', () => {
    expect(render(createElement(Spinner, { decorative: true }))).toContain('aria-hidden="true"');
    expect(render(createElement(Spinner, { decorative: true }))).not.toContain('role="status"');
    expect(render(createElement(Spinner, { showLabel: true, label: 'Saving…' }))).toContain(
      'text-sm text-muted-foreground">Saving…',
    );
  });

  it('waits before appearing when delayed', () => {
    expect(render(createElement(Spinner, { delay: 300 }))).toBe('');
  });

  it('renders overlays only while active and wraps children', () => {
    const idle = render(createElement(LoadingOverlay, { active: false }, 'content'));
    expect(idle).toContain('content');
    expect(idle).not.toContain('role="status"');
    const busy = render(
      createElement(LoadingOverlay, { active: true, delayMs: 0, title: 'Saving…' }, 'content'),
    );
    expect(busy).toContain('aria-busy="true"');
    expect(busy).toContain('Saving…');
  });

  it('renders a page loader with a centred mark', () => {
    const html = render(
      createElement(PageLoader, {
        delayMs: 0,
        title: 'Preparing',
        mark: createElement('b', null, 'NIB'),
      }),
    );
    expect(html).toContain('<b>NIB</b>');
    expect(html).toContain('Preparing');
  });

  it('renders determinate and indeterminate progress bars', () => {
    const determinate = render(createElement(ProgressBar, { value: 42, showValue: true }));
    expect(determinate).toContain('<progress');
    expect(determinate).toContain('value="42"');
    expect(determinate).toContain('42%');
    const indeterminate = render(createElement(ProgressBar, {}));
    expect(indeterminate).toContain('<progress');
    expect(indeterminate).not.toContain('value=');
  });
});
