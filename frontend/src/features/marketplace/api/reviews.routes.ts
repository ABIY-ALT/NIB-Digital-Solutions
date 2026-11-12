import { z } from 'zod';
import { parseWith, publicApiRoute, readJson } from '@/features/auth/api/api-route';
import { ApiClientError } from '@/shared/errors/api-client-error';
import type { PublicProductReviews } from '../types';

/**
 * Customer ratings BFF routes → NestJS /marketplace/products/:slug/reviews
 * (public). Reviews are moderated: a new one appears after staff approve it.
 */

const SLUG = /^[a-z0-9-]{1,160}$/;

const listQuery = z.object({
  rating: z.coerce.number().int().min(1).max(5).optional().catch(undefined),
});

const submitBody = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().max(160).nullish(),
  // Only the rating is required: a visitor may leave just stars.
  body: z.string().max(2000).nullish(),
  reviewerName: z.string().max(120).nullish(),
  reviewerRole: z.string().max(160).nullish(),
  reviewerEmail: z.string().max(160).nullish(),
  meta: z.object({
    honeypot: z.string().max(200),
    elapsedMs: z.number().int().min(0).max(86_400_000),
  }),
});

const productPath = (slug: string) => {
  if (!SLUG.test(slug))
    throw new ApiClientError({ code: 'NOT_FOUND', message: 'Product not found.', status: 404 });
  return `/marketplace/products/${slug}/reviews`;
};

/** A product's rating and approved reviews (optionally only one star rating). */
export const listReviews = publicApiRoute<PublicProductReviews, { slug: string }>(
  async ({ req, api, params }) => {
    const query = listQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
    const res = await api.get<PublicProductReviews>(productPath(params.slug), {
      query: { rating: query.rating },
    });
    return { data: res.data };
  },
);

/** A new rating (shown once staff approve it). */
export const submitReview = publicApiRoute<{ reference: string }, { slug: string }>(
  async ({ req, api, params }) => {
    const path = productPath(params.slug);
    const body = await readJson(req, parseWith(submitBody));
    const res = await api.post<{ reference: string }>(path, body);
    return { data: res.data, message: res.message, status: 201 };
  },
);
