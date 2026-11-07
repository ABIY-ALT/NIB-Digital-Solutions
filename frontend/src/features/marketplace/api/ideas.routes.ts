import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { parseWith, publicApiRoute, readJson } from '@/features/auth/api/api-route';
import { ApiClientError } from '@/shared/errors/api-client-error';
import type { PublicIdea } from '../types';

/**
 * "What should we build next?" BFF routes → NestJS /marketplace/ideas (public).
 *
 * Votes are counted once per visitor. The visitor is identified by an
 * anonymous random token in an httpOnly cookie, created on the first vote;
 * the backend only stores a keyed hash of it. No personal data is involved.
 */

const VOTER_COOKIE = 'nib_ds_voter';
const VOTER_TOKEN = /^[A-Za-z0-9_-]{20,100}$/;
const REFERENCE = /^IDEA-\d{6}-[A-Z0-9]{5}$/;

async function readVoter(): Promise<string | undefined> {
  const value = (await cookies()).get(VOTER_COOKIE)?.value;
  return value && VOTER_TOKEN.test(value) ? value : undefined;
}

async function ensureVoter(): Promise<string> {
  const existing = await readVoter();
  if (existing) return existing;
  const token = randomBytes(24).toString('base64url');
  (await cookies()).set(VOTER_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/marketplace/ideas',
    maxAge: 60 * 60 * 24 * 365,
  });
  return token;
}

const listQuery = z.object({
  sort: z.enum(['popular', 'newest']).catch('popular'),
  status: z.enum(['approved', 'in_development', 'completed']).optional().catch(undefined),
  category: z
    .string()
    .regex(/^[a-z0-9-]{1,60}$/)
    .optional()
    .catch(undefined),
  q: z.string().trim().max(80).optional().catch(undefined),
  limit: z.coerce.number().int().min(1).max(60).catch(30),
});

const meta = z.object({
  honeypot: z.string().max(200),
  elapsedMs: z.number().int().min(0).max(86_400_000),
});

const submitBody = z.object({
  title: z.string().max(160),
  problem: z.string().max(2000),
  categoryCode: z.string().max(60).nullish(),
  submitterName: z.string().max(120).nullish(),
  submitterEmail: z.string().max(160),
  meta,
});

/** Approved ideas, with this visitor's votes marked. */
export const listIdeas = publicApiRoute<PublicIdea[]>(async ({ req, api }) => {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const query = listQuery.parse(params);
  const voter = await readVoter();
  const res = await api.get<PublicIdea[]>('/marketplace/ideas', {
    query: {
      sort: query.sort,
      status: query.status,
      category: query.category,
      q: query.q || undefined,
      limit: String(query.limit),
      voter,
    },
  });
  return { data: res.data };
});

/** A new suggestion (moderated by staff before it is published). */
export const submitIdea = publicApiRoute<{ reference: string }>(async ({ req, api }) => {
  const body = await readJson(req, parseWith(submitBody));
  const res = await api.post<{ reference: string }>('/marketplace/ideas', body);
  return { data: res.data, message: res.message, status: 201 };
});

/** One vote per visitor and idea (a repeat vote is accepted but not counted). */
export const voteIdea = publicApiRoute<PublicIdea, { reference: string }>(
  async ({ api, params }) => {
    if (!REFERENCE.test(params.reference))
      throw new ApiClientError({ code: 'NOT_FOUND', message: 'Idea not found.', status: 404 });
    const voterToken = await ensureVoter();
    const res = await api.post<PublicIdea>(`/marketplace/ideas/${params.reference}/vote`, {
      voterToken,
    });
    return { data: res.data, message: res.message };
  },
);
