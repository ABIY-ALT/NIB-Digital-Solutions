import { NextResponse } from 'next/server';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { apiRoute, parseWith, publicApiRoute, readJson } from '@/features/auth/api/api-route';
import { ApiClientError } from '@/shared/errors/api-client-error';
import type { AssistantReply, MarketplaceAnalytics, MarketplaceCatalog } from '../types';

/**
 * Marketplace BFF routes → NestJS /marketplace. The public routes serve the
 * Digital Solutions website (no session; CSRF + Origin checks on POST still
 * apply); bodies are bounded here and validated again by the backend.
 */

const meta = z.object({
  honeypot: z.string().max(200),
  elapsedMs: z.number().int().min(0).max(86_400_000),
});
const source = z
  .enum([
    'homepage',
    'product_card',
    'product_page',
    'assistant',
    'catalog',
    'contact_page',
    'navigation',
  ])
  .nullish();

const demoBody = z.object({
  fullName: z.string().max(120),
  organization: z.string().max(160),
  jobTitle: z.string().max(120),
  email: z.string().max(160),
  phone: z.string().max(40),
  productSlug: z.string().max(80),
  demoType: z.enum(['online', 'onsite', 'recorded', 'customized']),
  preferredDate: z.string().max(10).nullish(),
  preferredTime: z.string().max(5).nullish(),
  requirements: z.string().max(2000).nullish(),
  consent: z.literal(true),
  source,
  meta,
});

const inquiryBody = z.object({
  customerName: z.string().max(120),
  company: z.string().max(160).nullish(),
  email: z.string().max(160),
  phone: z.string().max(40).nullish(),
  productSlug: z.string().max(80).nullish(),
  inquiryType: z.enum([
    'product_information',
    'pricing',
    'customization',
    'integration',
    'partnership',
    'deployment',
    'technical_consultation',
  ]),
  message: z.string().max(2000),
  requirements: z.string().max(2000).nullish(),
  contactMethod: z.enum(['email', 'phone', 'whatsapp', 'telegram']),
  consent: z.literal(true),
  source,
  meta,
});

const eventBody = z.object({
  type: z.enum(['product_view', 'demo_play', 'assistant_query']),
  productSlug: z.string().max(80).nullish(),
});

const assistantBody = z.object({
  question: z.string().min(2).max(600),
  focusSlug: z.string().max(80).nullish(),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(4000) }))
    .max(16)
    .default([]),
});

const uuid = z.uuid();
const noteBody = z.object({ body: z.string().min(1).max(2000) });
/** Base64 of an image up to the backend limit (default 700 KB → ~950 KB encoded). */
const mediaBody = z.object({ data: z.string().min(1).max(1_400_000) });

// ── Public ──────────────────────────────────────────────────────────────────

export const catalog = publicApiRoute<MarketplaceCatalog>(async ({ api }) => {
  // Industries and needs in the reader's language (locale cookie, like the pages).
  const res = await api.get<MarketplaceCatalog>('/marketplace/catalog', {
    query: { locale: await getLocale() },
  });
  return { data: res.data };
});

export const submitDemoRequest = publicApiRoute<{ reference: string }>(async ({ req, api }) => {
  const body = await readJson(req, parseWith(demoBody));
  const res = await api.post<{ reference: string }>('/marketplace/demo-requests', body);
  return { data: res.data, message: res.message, status: 201 };
});

export const submitInquiry = publicApiRoute<{ reference: string }>(async ({ req, api }) => {
  const body = await readJson(req, parseWith(inquiryBody));
  const res = await api.post<{ reference: string }>('/marketplace/inquiries', body);
  return { data: res.data, message: res.message, status: 201 };
});

export const trackEvent = publicApiRoute<null>(async ({ req, api }) => {
  const body = await readJson(req, parseWith(eventBody));
  await api.post('/marketplace/events', body);
  return { data: null, status: 202 };
});

export const askAssistant = publicApiRoute<AssistantReply>(async ({ req, api }) => {
  const body = await readJson(req, parseWith(assistantBody));
  const res = await api.post<AssistantReply>('/marketplace/assistant', body);
  return { data: res.data };
});

/** Serves an uploaded product image as bytes (immutable: an id never changes content). */
export const media = publicApiRoute<never, { id: string }>(async ({ api, params }) => {
  const id = uuid.safeParse(params.id);
  if (!id.success)
    throw new ApiClientError({ code: 'NOT_FOUND', message: 'Media not found.', status: 404 });
  const res = await api.get<{ contentType: string; data: string; checksum: string }>(
    `/marketplace/media/${id.data}`,
  );
  const bytes = Buffer.from(res.data.data, 'base64');
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'content-type': res.data.contentType,
      'content-length': String(bytes.length),
      'cache-control': 'public, max-age=31536000, immutable',
      etag: `"${res.data.checksum}"`,
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'cross-origin-resource-policy': 'same-origin',
    },
  });
});

// ── Staff ───────────────────────────────────────────────────────────────────

export const analytics = apiRoute<MarketplaceAnalytics>(
  { requires: { permission: 'marketplace-analytics:read' } },
  async ({ req, api }) => {
    // Reporting period in days (the backend accepts 7, 30, 90 or 365).
    const days = new URL(req.url).searchParams.get('days') ?? undefined;
    const res = await api.get<MarketplaceAnalytics>('/marketplace/admin/analytics', {
      query: { days },
    });
    return { data: res.data };
  },
);

export const uploadMedia = apiRoute<{ id: string; url: string; contentType: string; size: number }>(
  // Product editors (screenshots) and hero-carousel editors (slide images).
  { requires: { anyOf: ['digital-products:update', 'hero-slides:create', 'hero-slides:update'] } },
  async ({ req, api }) => {
    const body = await readJson(req, parseWith(mediaBody));
    const res = await api.post<{ id: string; url: string; contentType: string; size: number }>(
      '/marketplace/admin/media',
      body,
    );
    return { data: res.data, message: res.message, status: 201 };
  },
);

const noteRoute = (resource: 'demo-requests' | 'product-inquiries') =>
  apiRoute<unknown, { id: string }>(
    { requires: { permission: `${resource}:update` } },
    async ({ req, api, params }) => {
      const id = uuid.safeParse(params.id);
      if (!id.success)
        throw new ApiClientError({ code: 'NOT_FOUND', message: 'Record not found.', status: 404 });
      const body = await readJson(req, parseWith(noteBody));
      const res = await api.post(`/${resource}/${id.data}/notes`, body);
      return { data: res.data, message: res.message, status: 201 };
    },
  );

export const addDemoRequestNote = noteRoute('demo-requests');
export const addInquiryNote = noteRoute('product-inquiries');
