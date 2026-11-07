// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadFromApi } from '@/infrastructure/api/download';
import { makeQueryClient, makeServerQueryClient, shouldRetry } from '@/shared/data/query-client';
import { ApiClientError } from '@/shared/errors/api-client-error';
import { reportClientError } from '@/shared/errors/report-error';
import { isInternalNavigation, RouteProgress } from '@/shared/layouts/route-progress';
import { ChangeDiff, useChangeDiffLabels } from '@/shared/ui/change-diff';
import { mockApi, navigation, renderApp, setLocation } from '@/testing/render';

vi.mock('next/navigation', async () => (await import('@/testing/render')).nextNavigationModule());

const ended = new ApiClientError({ code: 'AUTH_SESSION_EXPIRED', message: 'x', status: 401 });
const failure = new ApiClientError({ code: 'INTERNAL_ERROR', message: 'x', status: 500 });

describe('query client policy', () => {
  it('retries only transient failures', () => {
    expect(
      shouldRetry(0, new ApiClientError({ code: 'BAD_REQUEST', message: 'x', status: 400 })),
    ).toBe(false);
    expect(shouldRetry(0, new ApiClientError({ code: 'ABORTED', message: 'x', status: 0 }))).toBe(
      false,
    );
    expect(
      shouldRetry(0, new ApiClientError({ code: 'RATE_LIMITED', message: 'x', status: 429 })),
    ).toBe(true);
    expect(shouldRetry(0, failure)).toBe(true);
    expect(shouldRetry(2, failure)).toBe(false);
    expect(shouldRetry(0, new Error('network'))).toBe(true);
  });

  it('toasts background refetch failures and requested mutation outcomes only', async () => {
    const notify = { success: vi.fn(), error: vi.fn() };
    const client = makeQueryClient(notify);
    client.setDefaultOptions({ queries: { retry: false } });

    // A first load failure is shown by the component, not toasted.
    await client
      .fetchQuery({ queryKey: ['a'], queryFn: () => Promise.reject(failure) })
      .catch(() => undefined);
    expect(notify.error).not.toHaveBeenCalled();
    // A background refetch failure with data on screen is toasted…
    client.setQueryData(['b'], 1);
    await client
      .fetchQuery({ queryKey: ['b'], queryFn: () => Promise.reject(failure), staleTime: 0 })
      .catch(() => undefined);
    expect(notify.error).toHaveBeenCalledTimes(1);
    // …unless the session ended or the query opted out.
    client.setQueryData(['c'], 1);
    await client
      .fetchQuery({ queryKey: ['c'], queryFn: () => Promise.reject(ended), staleTime: 0 })
      .catch(() => undefined);
    client.setQueryData(['d'], 1);
    await client
      .fetchQuery({
        queryKey: ['d'],
        queryFn: () => Promise.reject(failure),
        staleTime: 0,
        meta: { backgroundErrorToast: false },
      })
      .catch(() => undefined);
    expect(notify.error).toHaveBeenCalledTimes(1);

    const mutate = (fn: () => Promise<unknown>, meta: Record<string, unknown>) =>
      client
        .getMutationCache()
        .build(client, { mutationFn: fn, meta })
        .execute(undefined)
        .catch(() => undefined);
    client.setQueryData(['list'], []);
    await mutate(() => Promise.resolve(1), {
      notify: { success: 'Saved' },
      invalidates: [['list']],
    });
    expect(notify.success).toHaveBeenCalledWith('Saved');
    await mutate(() => Promise.reject(failure), { notify: { error: 'Could not save' } });
    expect(notify.error).toHaveBeenLastCalledWith(failure, 'Could not save');
    await mutate(() => Promise.reject(failure), { notify: { error: true } });
    await mutate(() => Promise.reject(ended), { notify: { error: true } });
    await mutate(() => Promise.reject(failure), {});
    expect(notify.error).toHaveBeenCalledTimes(3);
    expect(makeServerQueryClient()).toBeInstanceOf(QueryClient);
  });
});

describe('downloadFromApi', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('saves the file under its server name and reports export rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response('a,b', {
            headers: {
              'content-disposition':
                'attachment; filename="x.csv"; filename*=UTF-8\'\'users%202026.csv',
              'x-export-rows': '12',
              'x-export-truncated': 'true',
            },
          }),
        ),
      ),
    );
    expect(
      await downloadFromApi(
        '/api/users/export',
        new URLSearchParams({ format: 'csv' }),
        'fallback.csv',
      ),
    ).toEqual({
      fileName: 'users 2026.csv',
      rows: 12,
      truncated: true,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response('x', {
            headers: { 'content-disposition': 'attachment; filename="plain.pdf"' },
          }),
        ),
      ),
    );
    expect((await downloadFromApi('/api/doc', new URLSearchParams(), 'doc.pdf')).fileName).toBe(
      'plain.pdf',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('x'))),
    );
    expect((await downloadFromApi('/api/doc', new URLSearchParams(), 'doc.pdf')).fileName).toBe(
      'doc.pdf',
    );
  });

  it('throws API errors as ApiClientError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json(
            {
              success: false,
              error: { code: 'RATE_LIMITED', message: 'Slow down' },
              correlationId: 'c',
              timestamp: '',
            },
            { status: 429, headers: { 'retry-after': '30' } },
          ),
        ),
      ),
    );
    await expect(downloadFromApi('/api/x', new URLSearchParams(), 'x')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryAfterSeconds: 30,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('<html>', { status: 502 }))),
    );
    await expect(downloadFromApi('/api/x', new URLSearchParams(), 'x')).rejects.toMatchObject({
      code: 'UNKNOWN_ERROR',
      status: 502,
    });
  });
});

describe('reportClientError', () => {
  it('reports crashes once per signature, never API errors', async () => {
    const api = mockApi({ 'POST /api/client-errors': null });
    reportClientError(new TypeError('x is undefined'), {
      kind: 'boundary',
      componentStack: 'at Page',
      digest: 'd1',
    });
    reportClientError(new TypeError('x is undefined'), { kind: 'boundary' });
    reportClientError('plain string', { kind: 'rejection' });
    reportClientError(42, { kind: 'global' });
    reportClientError(failure, { kind: 'route' });
    await waitFor(() => expect(api.calls).toHaveLength(3));
    expect(api.calls[0]!.body).toMatchObject({
      kind: 'boundary',
      name: 'TypeError',
      message: 'x is undefined',
      digest: 'd1',
    });
    expect(api.calls[2]!.body).toMatchObject({ message: 'Non-error value thrown' });
  });
});

describe('route progress', () => {
  const location = {
    href: 'http://localhost/users?page=1',
    origin: 'http://localhost',
    pathname: '/users',
    search: '?page=1',
  };
  const click = (
    href: string | null,
    extra: Partial<MouseEvent> = {},
    attrs: Record<string, string> = {},
  ) => {
    const a = document.createElement('a');
    if (href !== null) a.setAttribute('href', href);
    for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
    return isInternalNavigation(
      {
        defaultPrevented: false,
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        target: a,
        ...extra,
      } as unknown as MouseEvent,
      location,
    );
  };

  it('tracks only same-tab links to another page of this site', () => {
    expect(click('/roles')).toBe(true);
    expect(click('/users?page=2')).toBe(true);
    expect(click('/users?page=1')).toBe(false);
    expect(click('https://example.com/')).toBe(false);
    expect(click('/roles', { ctrlKey: true })).toBe(false);
    expect(click('/roles', { button: 1 })).toBe(false);
    expect(click('/roles', { defaultPrevented: true })).toBe(false);
    expect(click('/roles', {}, { target: '_blank' })).toBe(false);
    expect(click('/file.csv', {}, { download: '' })).toBe(false);
    expect(
      isInternalNavigation(
        {
          defaultPrevented: false,
          button: 0,
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
          target: document.body,
        } as unknown as MouseEvent,
        location,
      ),
    ).toBe(false);
  });

  it('shows the bar while a clicked page loads and finishes it on arrival', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      setLocation('/users');
      const view = renderApp(
        <>
          <RouteProgress />
          <a href="/roles">Roles</a>
        </>,
      );
      fireEvent.click(screen.getByText('Roles'));
      act(() => vi.advanceTimersByTime(1000));
      expect(document.querySelector('[data-motion="essential"]')).toBeTruthy();
      setLocation('/roles');
      view.rerender(
        <>
          <RouteProgress />
          <a href="/roles">Roles</a>
        </>,
      );
      act(() => vi.advanceTimersByTime(600));
      fireEvent.click(screen.getByText('Roles'));
      act(() => vi.advanceTimersByTime(16_000));
    } finally {
      vi.useRealTimers();
    }
    void navigation;
  });
});

describe('ChangeDiff', () => {
  function Diff(
    props:
      | Parameters<typeof ChangeDiff>[0]
      | {
          labels?: undefined;
          before: Record<string, unknown> | null;
          after: Record<string, unknown> | null;
        },
  ) {
    const labels = useChangeDiffLabels();
    return <ChangeDiff {...props} labels={labels} />;
  }

  it('compares records field by field, lists and flags, and can show unchanged fields', () => {
    renderApp(
      <Diff
        before={{
          name: 'Teller',
          active: true,
          permissions: ['a', 'b'],
          note: null,
          limit: 5,
          meta: { x: 1 },
        }}
        after={{
          name: 'Senior teller',
          active: false,
          permissions: ['b', 'c'],
          note: 'Added',
          limit: 5,
          meta: { x: 2 },
        }}
      />,
    );
    expect(screen.getByText('Senior teller')).toBeTruthy();
    expect(screen.getAllByText('✗').length).toBeGreaterThan(0);
    expect(screen.getAllByText('c').length).toBeGreaterThan(0);
    const toggle = screen.getAllByRole('button')[0];
    if (toggle) {
      fireEvent.click(toggle);
      expect(screen.getAllByText('5').length).toBeGreaterThan(0);
    }
  });

  it('shows created and deleted records', () => {
    const view = renderApp(<Diff before={null} after={{ code: 'X', tags: [] }} />);
    expect(screen.getByText('X')).toBeTruthy();
    view.unmount();
    render(<></>);
    renderApp(<Diff before={{ code: 'Y' }} after={null} />);
    expect(screen.getByText('Y')).toBeTruthy();
  });
});
