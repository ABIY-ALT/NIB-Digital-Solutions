import { describe, expect, it } from 'vitest';
import type { FilterCondition } from '#core/domain/pagination.js';
import type { PrismaService } from '#core/infrastructure/prisma/prisma.service.js';
import { PrismaProductInquiryRepository } from '#modules/product-inquiries/infrastructure/prisma-product-inquiry.repository.js';
import { PrismaDemoRequestRepository } from './prisma-demo-request.repository.js';

type WithFilters = { buildFilterWhere(filters: FilterCondition[]): unknown };

/**
 * Leads can be filtered by the date they were received: the lists' "Received"
 * filter and the staff home's "waiting over 24 hours" count rely on it.
 */
describe.each([
  ['demo requests', PrismaDemoRequestRepository],
  ['product inquiries', PrismaProductInquiryRepository],
])('%s: received-date filter', (_name, Repository) => {
  it('filters new leads received before a moment', () => {
    const repo = new Repository({} as PrismaService) as unknown as WithFilters;
    const where = repo.buildFilterWhere([
      { field: 'status', operator: 'eq', value: 'new' },
      { field: 'createdAt', operator: 'lt', value: '2026-11-06T10:00:00.000Z' },
    ] as FilterCondition[]);
    expect(JSON.stringify(where)).toContain('"createdAt":{"lt":"2026-11-06T10:00:00.000Z"}');
  });
});
