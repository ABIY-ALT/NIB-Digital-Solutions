import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bff, invoke, signedIn, withCsrf } from '@/testing/bff';

vi.mock('server-only', () => ({}));
vi.mock('@/infrastructure/logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() },
}));
vi.mock('next/headers', async () => (await import('@/testing/bff')).nextHeadersModule());
vi.mock('@/infrastructure/config/env', async () => (await import('@/testing/bff')).envModule());
vi.mock('@/infrastructure/api/backend', async () =>
  (await import('@/testing/bff')).backendModule(),
);

const { create, update } = await import('./digital-products.routes');

const ID = '01a1a5b9-be62-770e-b94c-4e7cb39821ad';
const DEV = [
  '0198a1b2-0000-7000-8000-000000000001',
  '0198a1b2-0000-7000-8000-000000000002',
  '0198a1b2-0000-7000-8000-000000000003',
];

/** What the product editor sends for launch planning and developer support. */
const support = {
  releaseDate: '2027-03-31',
  developerId: DEV[0],
  backupDeveloperId: DEV[1],
  thirdDeveloperId: DEV[2],
  supportStatus: 'limited',
};

describe('digital products BFF routes', () => {
  beforeEach(async () => {
    bff.reset();
    await signedIn(['digital-products:create', 'digital-products:update']);
    withCsrf();
  });

  it('forwards the release date, up to three developers and the support status on update', async () => {
    bff.reply(`PATCH /digital-products/${ID}`, { data: { id: ID } });
    const res = await invoke(update, {
      method: 'PATCH',
      url: `/api/digital-products/${ID}`,
      params: { id: ID },
      body: { version: 3, name: 'School Management System', ...support },
    });
    expect(res.status).toBe(200);
    expect(bff.calls.at(-1)?.body).toMatchObject(support);
  });

  it('forwards the same fields on create', async () => {
    bff.reply('POST /digital-products', { data: { id: ID }, status: 201 });
    await invoke(create, {
      method: 'POST',
      url: '/api/digital-products',
      body: {
        slug: 'new-product',
        name: 'New product',
        summary: 'A new product with a long enough summary.',
        categoryCode: 'business-management',
        status: 'draft',
        availability: 'coming_soon',
        featured: false,
        customizable: true,
        ...support,
      },
    });
    expect(bff.calls.at(-1)?.body).toMatchObject(support);
  });

  it('rejects a developer that is not an id', async () => {
    const res = await invoke(update, {
      method: 'PATCH',
      url: `/api/digital-products/${ID}`,
      params: { id: ID },
      body: { version: 3, developerId: '@hana_dev' },
    });
    expect(res.status).toBe(400);
    expect(bff.calls).toHaveLength(0);
  });
});
