import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DataTable, type DataTableExpansion, type DataTableLabels } from './data-table';
import { DetailPanel, SubTable } from './data-table-detail';
import {
  DEFAULT_UI_SETTINGS,
  UiSettingsProvider,
  type TableExpansionSettings,
} from './ui-settings';

interface Order {
  id: string;
  customer: string;
  lines: string[];
}

const orders: Order[] = [
  { id: 'A', customer: 'Abebe', lines: ['Cards', 'Support'] },
  { id: 'B', customer: 'Selam', lines: ['Cheque books'] },
  { id: 'C', customer: 'Tana', lines: [] },
];

const labels: DataTableLabels = {
  actions: 'Actions',
  loading: 'Loading',
  emptyTitle: 'Nothing',
  showing: () => '',
  perPage: 'page',
  first: 'First',
  previous: 'Previous',
  next: 'Next',
  last: 'Last',
  page: (p) => `Page ${p}`,
  sortBy: (c) => `Sort by ${c}`,
  expandRow: 'Show details',
  collapseRow: 'Hide details',
  expandAll: 'Show all',
  collapseAll: 'Hide all',
};

const table = (
  expansion: Partial<DataTableExpansion<Order>> = {},
  extra: Record<string, unknown> = {},
): ReactElement =>
  createElement(DataTable<Order>, {
    columns: [{ id: 'customer', header: 'Customer', cell: (o) => o.customer }],
    data: orders,
    getRowId: (o) => o.id,
    labels,
    expansion: {
      render: (o) => createElement('p', null, `detail of ${o.id}: ${o.lines.join(', ')}`),
      ...expansion,
    },
    ...extra,
  });

const render = (node: ReactElement, defaults?: Partial<TableExpansionSettings>) =>
  renderToStaticMarkup(
    defaults
      ? createElement(UiSettingsProvider, {
          settings: {
            ...DEFAULT_UI_SETTINGS,
            tables: { expansion: { ...DEFAULT_UI_SETTINGS.tables.expansion, ...defaults } },
          },
          children: node,
        })
      : node,
  );

const count = (html: string, text: string) => html.split(text).length - 1;

describe('DataTable expansion (master–detail)', () => {
  it('adds a disclosure button per row and renders nothing of the detail while collapsed', () => {
    const html = render(table());
    expect(count(html, 'aria-label="Show details"')).toBe(3);
    expect(count(html, 'aria-expanded="false"')).toBe(4); // 3 rows + expand all
    expect(html).toContain('aria-label="Show all"');
    expect(html).not.toContain('detail of');
  });

  it('renders the detail of expanded rows under them, linked to the button', () => {
    const html = render(table({ defaultExpandedIds: ['B'] }));
    expect(html).toContain('detail of B: Cheque books');
    expect(html).not.toContain('detail of A');
    const panel = /aria-controls="([^"]+)"/.exec(html)?.[1];
    expect(panel).toBeTruthy();
    expect(html).toContain(`<tr id="${panel}"`);
    expect(html).toContain('aria-label="Hide details"');
    // The detail spans every column: chevron + customer.
    expect(html).toContain('colSpan="2"');
  });

  it('gives rows without detail no button', () => {
    const html = render(table({ canExpand: (o) => o.lines.length > 0, defaultExpandedIds: ['C'] }));
    expect(count(html, 'aria-label="Show details"')).toBe(2);
    expect(html).not.toContain('detail of C');
  });

  it('follows controlled state and shows "collapse all" when the whole page is open', () => {
    const html = render(table({ expandedIds: ['A', 'B', 'C'], onChange: () => undefined }));
    expect(count(html, 'detail of')).toBe(3);
    expect(html).toContain('aria-label="Hide all"');
  });

  it('takes its defaults from the product settings, and the table can override them', () => {
    expect(render(table(), { mode: 'single' })).not.toContain('aria-label="Show all"');
    expect(render(table({ mode: 'multiple' }), { mode: 'single' })).toContain(
      'aria-label="Show all"',
    );
    expect(render(table(), { expandAll: false })).not.toContain('aria-label="Show all"');
    expect(render(table(), { expandOnRowClick: true })).toContain('cursor-pointer');
    expect(render(table())).not.toContain('cursor-pointer');
  });

  it('is switched off for virtualized tables', () => {
    const html = render(table({ defaultExpandedIds: ['A'] }, { virtualizeHeight: 300 }));
    expect(html).not.toContain('aria-expanded');
    expect(html).not.toContain('detail of A');
  });
});

describe('SubTable', () => {
  const sub = (props: Record<string, unknown> = {}) =>
    render(
      createElement(
        DetailPanel,
        { title: 'Lines', children: null },
        createElement(SubTable<string>, {
          caption: 'Lines of A',
          columns: [{ id: 'item', header: 'Item', cell: (line) => line }],
          data: ['Cards', 'Support'],
          getRowId: (line) => line,
          emptyText: 'No lines.',
          footer: 'Total: 2',
          ...props,
        }),
      ),
    );

  it('renders rows, the caption and the footer', () => {
    const html = sub();
    expect(html).toContain('<caption class="sr-only">Lines of A</caption>');
    expect(html).toContain('Cards');
    expect(html).toContain('Total: 2');
  });

  it('shows the empty text, and hides the footer while loading', () => {
    expect(sub({ data: [] })).toContain('No lines.');
    const loading = sub({ loading: true });
    expect(loading).toContain('aria-busy="true"');
    expect(loading).not.toContain('Total: 2');
    expect(loading).not.toContain('Cards');
  });
});
