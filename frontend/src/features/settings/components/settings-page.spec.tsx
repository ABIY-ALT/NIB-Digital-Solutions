// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFailure, mockApi, navigation, renderApp, setLocation } from '@/testing/render';
import { SettingsPage } from './settings-page';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());

const def = (key: string, type: string, extra: Record<string, unknown> = {}) => ({
  key,
  group: key.split('.')[0],
  type,
  label: key,
  description: null,
  default: null,
  options: null,
  min: null,
  max: null,
  required: false,
  ...extra,
});

const settings = {
  groups: ['company', 'format', 'custom'],
  definitions: [
    def('company.name', 'string', { required: true, max: 120 }),
    def('company.email', 'email'),
    def('company.website', 'url'),
    def('company.address', 'text', { max: 500 }),
    def('company.logo', 'image'),
    def('company.brandColor', 'color'),
    def('format.decimals', 'number', { min: 0, max: 4 }),
    def('format.symbolPosition', 'select', { options: ['before', 'after'] }),
    def('format.thousands', 'select', { options: [',', '.'] }),
    def('format.grouping', 'boolean'),
    def('custom.flag', 'boolean', { description: 'A feature setting' }),
  ],
  values: {
    'company.name': 'NIB',
    'company.email': 'info@nib.et',
    'company.website': 'https://nib.et',
    'company.address': 'Addis Ababa',
    'company.logo': 'data:image/png;base64,iVBORw0KGgo=',
    'company.brandColor': '#AA5500',
    'format.decimals': 2,
    'format.symbolPosition': 'before',
    'format.thousands': ',',
    'format.grouping': true,
    'custom.flag': false,
  },
};

describe('SettingsPage', () => {
  beforeEach(() => {
    setLocation('/settings');
    navigation.replace.mockClear();
  });

  it('edits every kind of setting and saves only what changed', async () => {
    const api = mockApi({
      'GET /api/settings': settings,
      'PATCH /api/settings': ({ body }: { body: { values: Record<string, unknown> } }) => ({
        ...settings,
        values: { ...settings.values, ...body.values },
      }),
    });
    const { container } = renderApp(<SettingsPage />, {
      permissions: ['settings:read', 'settings:manage'],
    });
    const name = await screen.findByDisplayValue('NIB');
    fireEvent.change(name, { target: { value: 'NIB International Bank' } });
    fireEvent.change(screen.getByDisplayValue('Addis Ababa'), {
      target: { value: 'Addis Ababa, Ethiopia' },
    });
    const color = container.querySelector('input[type="color"]') as HTMLInputElement;
    fireEvent.change(color, { target: { value: '#112233' } });
    const hex = screen
      .getAllByDisplayValue('#112233')
      .find((i) => (i as HTMLInputElement).type !== 'color')!;
    fireEvent.change(hex, { target: { value: '#445566' } });
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));

    const file = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(file, {
      target: { files: [new File(['x'], 'logo.gif', { type: 'image/gif' })] },
    });
    fireEvent.change(file, {
      target: { files: [new File([new Uint8Array(3_000_000)], 'big.png', { type: 'image/png' })] },
    });
    fireEvent.change(file, {
      target: { files: [new File(['png'], 'logo.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(screen.getByRole('button', { name: /replace/i })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PATCH')).toBe(true));
    const sent = api.calls.find((c) => c.method === 'PATCH')!.body as {
      values: Record<string, unknown>;
    };
    expect(sent.values).toMatchObject({
      'company.name': 'NIB International Bank',
      'company.brandColor': '#445566',
    });
    expect(sent.values).not.toHaveProperty('company.email');
  });

  it('places field errors from the server and discards edits', async () => {
    mockApi({
      'GET /api/settings': settings,
      'PATCH /api/settings': new ApiFailure(400, 'VALIDATION_FAILED'),
    });
    renderApp(<SettingsPage />, { permissions: ['settings:read', 'settings:manage'] });
    const name = await screen.findByDisplayValue('NIB');
    fireEvent.change(name, { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: /discard/i }));
    expect(screen.getByDisplayValue('NIB')).toBeTruthy();
    fireEvent.change(name, { target: { value: 'Changed again' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
  });

  it('shows the format preview and other groups, read-only without the manage permission', async () => {
    setLocation('/settings', 'tab=format');
    mockApi({ 'GET /api/settings': settings });
    renderApp(<SettingsPage />, { permissions: ['settings:read'] });
    expect(await screen.findByText(/1,234,567|1234567/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Save$/ })).toBeNull();
    const tab = screen.getAllByRole('tab').at(-1)!;
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    fireEvent.focus(tab);
    const first = screen.getAllByRole('tab')[0]!;
    fireEvent.mouseDown(first);
    fireEvent.click(first);
    fireEvent.focus(first);
    expect(navigation.replace).toHaveBeenCalled();
  });

  it('retries when the settings fail to load', async () => {
    const api = mockApi({ 'GET /api/settings': new ApiFailure(400, 'BAD_REQUEST') });
    renderApp(<SettingsPage />);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    const before = api.calls.length;
    fireEvent.click(retry);
    await waitFor(() => expect(api.calls.length).toBeGreaterThan(before));
  });
});
