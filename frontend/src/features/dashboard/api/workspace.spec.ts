import { describe, expect, it, vi } from 'vitest';
import type { BoundBackendClient } from '@/infrastructure/api/backend-client';
import { ApiClientError } from '@/shared/errors/api-client-error';
import { WAITING_AFTER_MS } from '../types';
import { loadWorkspace } from './workspace';

const NOW = Date.parse('2026-11-07T12:00:00Z');

type Query = Record<string, string | number>;

/** A backend that answers counts by path + filters, and lists for the latest leads. */
function fakeApi(counts: Record<string, number>, lists: Record<string, unknown[]> = {}) {
  const get = vi.fn(async (path: string, init: { query?: Query } = {}) => {
    const query = init.query ?? {};
    if (query.pageSize !== 1) return { data: lists[path] ?? [] };
    const filters = Object.entries(query)
      .filter(([k]) => k.startsWith('filter['))
      .map(([k, v]) => `${k.slice(7, -1)}=${v}`)
      .sort()
      .join('&');
    const key = filters ? `${path}?${filters}` : path;
    return { data: [], meta: { pagination: { totalItems: counts[key] ?? 0 } } };
  });
  return { api: { get } as unknown as BoundBackendClient, get };
}

const waitingBefore = new Date(NOW - WAITING_AFTER_MS).toISOString();

describe('loadWorkspace: failures', () => {
  const failing = (status: number, failPath: string) => {
    const get = vi.fn(async (path: string) => {
      if (path === failPath) throw new ApiClientError({ code: 'X', message: 'Failed', status });
      return { data: [], meta: { pagination: { totalItems: 3 } } };
    });
    return { get } as unknown as BoundBackendClient;
  };

  it('leaves out a section that fails and keeps the others', async () => {
    const ws = await loadWorkspace(
      failing(400, '/demo-requests'),
      ['demo-requests:read', 'product-ideas:read'],
      NOW,
    );
    expect(ws?.demoRequests).toBeNull();
    expect(ws?.latestLeads).toBeNull();
    expect(ws?.ideas).toEqual({ submitted: 3, underReview: 3 });
  });

  it('still ends the page when the session has ended', async () => {
    await expect(
      loadWorkspace(failing(401, '/product-ideas'), ['product-ideas:read'], NOW),
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe('loadWorkspace', () => {
  it('is null for staff without any Digital Solutions permission', async () => {
    const { api, get } = fakeApi({});
    expect(await loadWorkspace(api, ['users:read', 'audit:read'], NOW)).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it('counts what needs attention, including new leads waiting over 24 hours', async () => {
    const { api } = fakeApi({
      '/demo-requests?status=new': 6,
      [`/demo-requests?createdAt=lt:${waitingBefore}&status=new`]: 2,
      '/product-inquiries?status=new': 4,
      [`/product-inquiries?createdAt=lt:${waitingBefore}&status=new`]: 1,
      '/product-ideas?status=submitted': 2,
      '/product-ideas?status=under_review': 1,
      '/product-questions?status=open': 2,
      '/product-questions?status=in_progress': 3,
    });
    const ws = await loadWorkspace(
      api,
      [
        'demo-requests:read',
        'product-inquiries:read',
        'product-ideas:read',
        'product-questions:read',
      ],
      NOW,
    );
    expect(ws).toMatchObject({
      demoRequests: { new: 6, waiting: 2 },
      inquiries: { new: 4, waiting: 1 },
      ideas: { submitted: 2, underReview: 1 },
      questions: { open: 2, inProgress: 3 },
      catalogue: null,
    });
  });

  it('merges the latest demo requests and inquiries, newest first, at most six', async () => {
    const demo = (n: number, day: number) => ({
      id: `d${n}`,
      reference: `DEMO-${n}`,
      fullName: `Demo ${n}`,
      organization: 'Org',
      productSlug: 'school',
      demoType: 'online',
      status: 'new',
      assignedTo: null,
      createdAt: `2026-11-0${day}T08:00:00Z`,
    });
    const inquiry = (n: number, day: number) => ({
      id: `i${n}`,
      reference: `INQ-${n}`,
      customerName: `Inquiry ${n}`,
      company: '',
      productSlug: '',
      inquiryType: 'pricing',
      status: 'contacted',
      assignedTo: 'u-2',
      createdAt: `2026-11-0${day}T09:00:00Z`,
    });
    const { api, get } = fakeApi(
      {},
      {
        '/demo-requests': [demo(1, 7), demo(2, 5), demo(3, 3), demo(4, 1)],
        '/product-inquiries': [inquiry(1, 6), inquiry(2, 4), inquiry(3, 2)],
      },
    );
    const ws = await loadWorkspace(api, ['demo-requests:read', 'product-inquiries:read'], NOW);
    expect(ws?.latestLeads?.map((l) => l.reference)).toEqual([
      'DEMO-1',
      'INQ-1',
      'DEMO-2',
      'INQ-2',
      'DEMO-3',
      'INQ-3',
    ]);
    expect(ws?.latestLeads?.[1]).toMatchObject({
      kind: 'inquiry',
      name: 'Inquiry 1',
      organization: null,
      productSlug: null,
      type: 'pricing',
      assignedTo: 'u-2',
    });
    expect(get).toHaveBeenCalledWith('/demo-requests', {
      query: { pageSize: 6, sort: 'createdAt:desc' },
    });
  });

  it('describes the catalogue, with hero slides only for those who may read them', async () => {
    const counts = {
      '/digital-products': 14,
      '/digital-products?status=published': 12,
      '/digital-products?availability=in:coming_soon,in_development&status=published': 2,
      '/digital-products?availability=pilot&status=published': 3,
      '/hero-slides?active=true': 4,
    };
    let ws = await loadWorkspace(fakeApi(counts).api, ['digital-products:read'], NOW);
    expect(ws?.catalogue).toEqual({
      published: 12,
      total: 14,
      comingSoon: 2,
      pilot: 3,
      heroSlides: null,
    });
    ws = await loadWorkspace(
      fakeApi(counts).api,
      ['digital-products:read', 'hero-slides:read'],
      NOW,
    );
    expect(ws?.catalogue?.heroSlides).toBe(4);
    // Nothing the user may not read is requested.
    expect(ws?.demoRequests).toBeNull();
    expect(ws?.latestLeads).toBeNull();
  });
});
