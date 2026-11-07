// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiFailure,
  envelope,
  mockApi,
  navigation,
  openMenu,
  page,
  renderApp,
  setLocation,
} from '@/testing/render';
import type { ReferenceDataItem, ReferenceDataType } from '../types';
import { ReferenceDataPage } from './reference-data-page';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());

const currencies: ReferenceDataType = {
  id: 't-1',
  code: 'currencies',
  name: 'Currencies',
  description: 'ISO 4217 currencies',
  isSystem: true,
  itemCount: 3,
  activeCount: 2,
  parentTypeCode: null,
  attributes: [
    { key: 'symbol', label: 'Symbol', type: 'text', required: true },
    { key: 'decimals', label: 'Decimals', type: 'number', required: false },
    { key: 'crypto', label: 'Crypto', type: 'boolean', required: false },
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  version: 1,
};

const branches: ReferenceDataType = {
  ...currencies,
  id: 't-2',
  code: 'branches',
  name: 'Branches',
  description: null,
  isSystem: false,
  itemCount: 0,
  activeCount: 0,
  parentTypeCode: 'regions',
  attributes: [],
};

const item = (overrides: Partial<ReferenceDataItem>): ReferenceDataItem => ({
  id: 'i-1',
  typeCode: 'currencies',
  code: 'ETB',
  label: 'Ethiopian Birr',
  labels: { am: 'ብር' },
  description: null,
  sortOrder: 1,
  active: true,
  effective: true,
  validFrom: null,
  validTo: null,
  parentCode: null,
  attributes: { symbol: 'Br', decimals: 2, crypto: false },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-02-01T00:00:00Z',
  version: 3,
  ...overrides,
});

const items = [
  item({}),
  item({
    id: 'i-2',
    code: 'USD',
    label: 'US Dollar',
    labels: {},
    active: false,
    attributes: { symbol: '' },
  }),
  item({
    id: 'i-3',
    code: 'XAU',
    label: 'Gold',
    effective: false,
    validFrom: '2999-01-01T00:00:00Z',
    attributes: { symbol: null, crypto: true },
  }),
  item({
    id: 'i-4',
    code: 'DEM',
    label: 'Mark',
    effective: false,
    validFrom: '2000-01-01T00:00:00Z',
  }),
];

function routes(extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/reference-data/types': envelope([currencies, branches]),
    'GET /api/reference-data/types/currencies/items': page(items),
    'GET /api/reference-data/types/branches/items': page([
      item({ id: 'b-1', code: 'HQ', label: 'Head office', typeCode: 'branches', parentCode: 'AA' }),
    ]),
    'GET /api/approvals/pending': { 'i-1': 'apr-1' },
    ...extra,
  });
}

describe('ReferenceDataPage', () => {
  beforeEach(() => {
    setLocation('/reference-data');
    navigation.replace.mockClear();
  });

  it('lists the managed lists and the first list’s items with their states', async () => {
    routes();
    renderApp(<ReferenceDataPage />, { permissions: ['reference-data:manage'] });

    expect(await screen.findByText('Ethiopian Birr')).toBeTruthy();
    expect(screen.getAllByText('Currencies').length).toBeGreaterThan(0);
    expect(screen.getByText('ISO 4217 currencies')).toBeTruthy();
    expect(screen.getAllByText('ብር').length).toBeGreaterThan(0);
    // Every item state: active, inactive, scheduled, expired.
    for (const state of ['Active', 'Inactive', 'Scheduled', 'Expired']) {
      expect(screen.getAllByText(new RegExp(`^${state}$`, 'i')).length).toBeGreaterThan(0);
    }
    // Attribute columns: text, number, boolean and empty values.
    expect(screen.getAllByText('Br').length).toBeGreaterThan(0);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    // The pending approval badge shows on the item that has one.
    await waitFor(() =>
      expect(document.querySelector('[data-approval-id], a[href*="apr-1"]')).toBeTruthy(),
    );
  });

  it('filters the lists and switches list through the URL', async () => {
    routes();
    renderApp(<ReferenceDataPage />, { permissions: ['reference-data:manage'] });
    await screen.findByText('Ethiopian Birr');

    const filter = screen.getAllByRole('textbox', { name: /filter/i })[0]!;
    fireEvent.change(filter, { target: { value: 'bran' } });
    expect(screen.queryByRole('button', { name: /Currencies/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Branches/ }));
    expect(navigation.replace).toHaveBeenCalledWith('/reference-data?list=branches', {
      scroll: false,
    });

    fireEvent.change(filter, { target: { value: 'nothing-matches' } });
    expect(screen.queryByRole('button', { name: /Branches/ })).toBeNull();
  });

  it('shows a child list with its parent column and lets an empty custom list be deleted', async () => {
    setLocation('/reference-data', 'list=branches');
    const api = routes({ 'DELETE /api/reference-data/types/branches': envelope(null) });
    renderApp(<ReferenceDataPage />, { permissions: ['reference-data:manage'] });

    expect(await screen.findByText('Head office')).toBeTruthy();
    expect(screen.getByText('AA')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /delete list/i }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /delete list/i }));
    await waitFor(() =>
      expect(
        api.calls.some((c) => c.method === 'DELETE' && c.path.endsWith('/types/branches')),
      ).toBe(true),
    );
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/reference-data'));
  });

  it('closes the delete-list dialog when the delete fails', async () => {
    setLocation('/reference-data', 'list=branches');
    routes({ 'DELETE /api/reference-data/types/branches': new ApiFailure(409, 'CONFLICT') });
    renderApp(<ReferenceDataPage />, { permissions: ['reference-data:manage'] });
    await screen.findByText('Head office');

    fireEvent.click(screen.getByRole('button', { name: /delete list/i }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /delete list/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('opens the list and item forms for managers', async () => {
    routes();
    renderApp(<ReferenceDataPage />, { permissions: ['reference-data:manage'] });
    await screen.findByText('Ethiopian Birr');

    fireEvent.click(screen.getByRole('button', { name: /edit list/i }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /new list/i }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /add item/i }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByText('US Dollar'));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('activates, deactivates and deletes items from the row menu', async () => {
    const api = routes({
      'PATCH /api/reference-data/items/i-1': envelope(item({ active: false })),
      'PATCH /api/reference-data/items/i-2': new ApiFailure(409, 'CONCURRENCY_CONFLICT'),
      'DELETE /api/reference-data/items/i-1': envelope(item({})),
      'DELETE /api/reference-data/items/i-2': new ApiFailure(409, 'CONFLICT'),
    });
    renderApp(<ReferenceDataPage />, { permissions: ['reference-data:manage'] });
    await screen.findByText('Ethiopian Birr');

    const menuFor = (code: string) =>
      openMenu(screen.getByRole('button', { name: `Actions for ${code}` }));

    fireEvent.click(within(await menuFor('ETB')).getByRole('menuitem', { name: /deactivate/i }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.method === 'PATCH' && c.path.endsWith('/i-1'))).toBe(true),
    );
    expect(api.calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({
      active: false,
      version: 3,
    });

    fireEvent.click(within(await menuFor('USD')).getByRole('menuitem', { name: /activate/i }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.method === 'PATCH' && c.path.endsWith('/i-2'))).toBe(true),
    );

    fireEvent.click(within(await menuFor('ETB')).getByRole('menuitem', { name: /delete/i }));
    let dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.method === 'DELETE' && c.path.endsWith('/i-1'))).toBe(true),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    fireEvent.click(within(await menuFor('USD')).getByRole('menuitem', { name: /delete/i }));
    dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    fireEvent.click(within(await menuFor('USD')).getByRole('menuitem', { name: /delete/i }));
    dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.method === 'DELETE' && c.path.endsWith('/i-2'))).toBe(true),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('updates the URL from the toolbar, sorting and paging', async () => {
    routes({
      'GET /api/reference-data/types/currencies/items': page(items, { pageSize: 2, total: 4 }),
    });
    renderApp(<ReferenceDataPage />, { permissions: ['reference-data:manage'] });
    await screen.findByText('Ethiopian Birr');

    const search = screen.getByPlaceholderText(/search code/i);
    fireEvent.change(search, { target: { value: 'birr' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /label/i })[0]!);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalled());
    const urls = navigation.replace.mock.calls.map(([url]) => String(url));
    expect(urls.some((u) => u.includes('search=birr'))).toBe(true);
    expect(urls.some((u) => u.includes('page=2'))).toBe(true);
  });

  it('is read-only without the manage permission, and shows load errors', async () => {
    routes({
      'GET /api/reference-data/types/currencies/items': new ApiFailure(
        500,
        'INTERNAL_ERROR',
        'Boom',
      ),
    });
    renderApp(<ReferenceDataPage />, { permissions: [] });
    expect(await screen.findByText(/corr-1/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /new list/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /edit list/i })).toBeNull();
  });

  it('says so when there are no lists', async () => {
    mockApi({ 'GET /api/reference-data/types': envelope([]) });
    renderApp(<ReferenceDataPage />);
    expect(await screen.findByText(/no reference lists|no lists/i)).toBeTruthy();
  });
});
