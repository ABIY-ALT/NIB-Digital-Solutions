import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import shared from '@/shared/i18n/en.json';
import { DEFAULT_UI_SETTINGS, UiSettingsProvider, type UiSettings } from '@/shared/ui/ui-settings';
import am from '../i18n/am.json';
import en from '../i18n/en.json';
import { ButtonsPanel } from './buttons-panel';
import { FeedbackPanel } from './feedback-panel';
import { FieldsPanel } from './fields-panel';
import { SelectionPanel } from './selection-panel';

const render = (node: ReactElement, settings: UiSettings = DEFAULT_UI_SETTINGS) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale: 'en',
      messages: { ...shared, ...en },
      children: createElement(QueryClientProvider, {
        client: new QueryClient(),
        children: createElement(UiSettingsProvider, { settings, children: node }),
      }),
    }),
  );

const count = (html: string, text: string) => html.split(text).length - 1;

const keys = (value: unknown, prefix = ''): string[] =>
  value && typeof value === 'object'
    ? Object.entries(value).flatMap(([k, v]) => keys(v, `${prefix}${k}.`))
    : [prefix];

describe('component gallery', () => {
  it('shows every button appearance and marks the product default', () => {
    const html = render(createElement(ButtonsPanel), {
      ...DEFAULT_UI_SETTINGS,
      controls: { button: 'soft', field: 'outline' },
    });
    for (const name of ['solid', 'soft', 'outline', 'elevated']) {
      expect(html).toContain(`>${name}</code>`);
    }
    expect(count(html, 'Product default')).toBe(1);
    expect(html).toContain('ui.controls.button');
  });

  it('shows the fields in each appearance', () => {
    const html = render(createElement(FieldsPanel));
    for (const name of ['outline', 'filled', 'underline']) {
      expect(html).toContain(`>${name}</code>`);
    }
    // One of each sample per appearance.
    expect(count(html, 'data-slot="textarea"')).toBe(3);
    expect(count(html, 'data-slot="record-picker"')).toBe(3);
    expect(count(html, 'Product default')).toBe(1);
  });

  it('shows selection controls and feedback components', () => {
    expect(render(createElement(SelectionPanel))).toContain('data-slot="switch"');
    const html = render(createElement(FeedbackPanel));
    for (const name of ['ring', 'comet', 'dots', 'bars', 'orbit', 'pulse']) {
      expect(html).toContain(`>${name}</code>`);
    }
    // Loader variant and loader tone each mark their default.
    expect(count(html, 'Product default')).toBe(2);
  });

  it('has the same messages in every language', () => {
    expect(keys(am).sort()).toEqual(keys(en).sort());
  });
});
