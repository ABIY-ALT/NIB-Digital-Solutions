import { hasPermission } from '@/features/auth/permissions';
import type { DemoRequest } from '@/features/demo-requests/types';
import type { ProductInquiry } from '@/features/product-inquiries/types';
import type { BoundBackendClient } from '@/infrastructure/api/backend-client';
import { logger } from '@/infrastructure/logging/logger';
import { isApiClientError } from '@/shared/errors/api-client-error';
import { WAITING_AFTER_MS, type DigitalSolutionsWorkspace, type WorkspaceLead } from '../types';

/** Rows in "Latest demo requests and inquiries". */
export const LATEST_LEADS = 6;

/** Permissions any of which gives a user the Digital Solutions home page. */
export const WORKSPACE_PERMISSIONS = [
  'demo-requests:read',
  'product-inquiries:read',
  'product-ideas:read',
  'product-questions:read',
  'digital-products:read',
  'marketplace-analytics:read',
  'product-reviews:read',
] as const;

type Filters = Record<string, string>;

/**
 * One section of the home page. A failure leaves that section out (and is
 * logged) instead of breaking the whole page; an ended session still ends it.
 */
async function section<T>(name: string, load: Promise<T>): Promise<T | null> {
  try {
    return await load;
  } catch (error) {
    if (isApiClientError(error) && (error.status === 401 || error.status === 403)) throw error;
    logger.warn(
      { section: name, err: error instanceof Error ? error.message : String(error) },
      'Staff home: a section could not be loaded',
    );
    return null;
  }
}

/** Number of records matching the filters (one row fetched; the total comes from the pagination). */
async function count(
  api: BoundBackendClient,
  path: string,
  filters: Filters = {},
): Promise<number> {
  const query: Record<string, string | number> = { pageSize: 1 };
  for (const [field, value] of Object.entries(filters)) query[`filter[${field}]`] = value;
  const res = await api.get<unknown[]>(path, { query });
  return res.meta?.pagination?.totalItems ?? 0;
}

async function newLeads(api: BoundBackendClient, path: string, now: number) {
  const before = new Date(now - WAITING_AFTER_MS).toISOString();
  const [fresh, waiting] = await Promise.all([
    count(api, path, { status: 'new' }),
    count(api, path, { status: 'new', createdAt: `lt:${before}` }),
  ]);
  return { new: fresh, waiting };
}

async function latestLeads(
  api: BoundBackendClient,
  demos: boolean,
  inquiries: boolean,
): Promise<WorkspaceLead[]> {
  const query = { pageSize: LATEST_LEADS, sort: 'createdAt:desc' };
  const [demoRows, inquiryRows] = await Promise.all([
    demos
      ? api.get<DemoRequest[]>('/demo-requests', { query }).then((r) => r.data)
      : Promise.resolve([]),
    inquiries
      ? api.get<ProductInquiry[]>('/product-inquiries', { query }).then((r) => r.data)
      : Promise.resolve([]),
  ]);
  const leads: WorkspaceLead[] = [
    ...demoRows.map((d): WorkspaceLead => ({
      kind: 'demo',
      id: d.id,
      reference: d.reference,
      name: d.fullName,
      organization: d.organization || null,
      productSlug: d.productSlug || null,
      type: d.demoType || null,
      status: d.status,
      assignedTo: d.assignedTo ?? null,
      createdAt: d.createdAt,
    })),
    ...inquiryRows.map((i): WorkspaceLead => ({
      kind: 'inquiry',
      id: i.id,
      reference: i.reference,
      name: i.customerName,
      organization: i.company || null,
      productSlug: i.productSlug || null,
      type: i.inquiryType || null,
      status: i.status,
      assignedTo: i.assignedTo ?? null,
      createdAt: i.createdAt,
    })),
  ];
  return leads.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, LATEST_LEADS);
}

async function catalogue(api: BoundBackendClient, heroSlides: boolean) {
  const [published, total, comingSoon, pilot, slides] = await Promise.all([
    count(api, '/digital-products', { status: 'published' }),
    count(api, '/digital-products'),
    count(api, '/digital-products', {
      status: 'published',
      availability: 'in:coming_soon,in_development',
    }),
    count(api, '/digital-products', { status: 'published', availability: 'pilot' }),
    heroSlides ? count(api, '/hero-slides', { active: 'true' }) : Promise.resolve(null),
  ]);
  return { published, total, comingSoon, pilot, heroSlides: slides };
}

/**
 * The NIB Digital Solutions sections of the staff home page, each loaded only
 * when the user may read it. null when the user has none of them.
 */
export async function loadWorkspace(
  api: BoundBackendClient,
  permissions: readonly string[],
  now = Date.now(),
): Promise<DigitalSolutionsWorkspace | null> {
  const can = (p: string) => hasPermission(permissions, p);
  if (!WORKSPACE_PERMISSIONS.some(can)) return null;

  const demos = can('demo-requests:read');
  const inquiries = can('product-inquiries:read');
  const [demoRequests, newInquiries, ideas, questions, reviews, latest, products] =
    await Promise.all([
      demos ? section('demoRequests', newLeads(api, '/demo-requests', now)) : null,
      inquiries ? section('inquiries', newLeads(api, '/product-inquiries', now)) : null,
      can('product-ideas:read')
        ? section(
            'ideas',
            Promise.all([
              count(api, '/product-ideas', { status: 'submitted' }),
              count(api, '/product-ideas', { status: 'under_review' }),
            ]).then(([submitted, underReview]) => ({ submitted, underReview })),
          )
        : null,
      can('product-questions:read')
        ? section(
            'questions',
            Promise.all([
              count(api, '/product-questions', { status: 'open' }),
              count(api, '/product-questions', { status: 'in_progress' }),
            ]).then(([open, inProgress]) => ({ open, inProgress })),
          )
        : null,
      can('product-reviews:read')
        ? section(
            'reviews',
            count(api, '/product-reviews', { status: 'pending' }).then((pending) => ({ pending })),
          )
        : null,
      demos || inquiries ? section('latestLeads', latestLeads(api, demos, inquiries)) : null,
      can('digital-products:read')
        ? section('catalogue', catalogue(api, can('hero-slides:read')))
        : null,
    ]);

  return {
    demoRequests,
    inquiries: newInquiries,
    ideas,
    questions,
    reviews,
    latestLeads: latest,
    catalogue: products,
  };
}
