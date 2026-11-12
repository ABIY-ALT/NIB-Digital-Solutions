'use client';

import { apiFetch } from '@/infrastructure/api/api-fetch';
import { isApiClientError } from '@/shared/errors/api-client-error';
import { answer } from './assistant/engine';
import type {
  AssistantReply,
  ChatTurn,
  IdeaSort,
  IdeaStatus,
  MarketplaceProduct,
  PublicConversation,
  PublicIdea,
  PublicProductReviews,
  Taxonomy,
} from './types';

/**
 * Browser → BFF calls of the public marketplace site. The BFF forwards them to
 * NestJS with its service identity; nothing here talks to the backend directly.
 */

export interface SubmissionMeta {
  honeypot: string;
  openedAt: number;
}

export interface SubmissionError {
  message: string;
  code: string;
  fields: Record<string, string>;
}

/** Normalises any failure into a message plus per-field errors (server validation maps onto fields). */
export function submissionError(error: unknown, fallback: string): SubmissionError {
  if (isApiClientError(error)) {
    const fields: Record<string, string> = {};
    if (Array.isArray(error.details))
      for (const d of error.details) if (d.field && !fields[d.field]) fields[d.field] = d.message;
    return { message: error.message || fallback, code: error.code, fields };
  }
  return { message: fallback, code: 'UNKNOWN', fields: {} };
}

const meta = (m: SubmissionMeta) => ({
  honeypot: m.honeypot,
  elapsedMs: Math.max(0, Date.now() - m.openedAt),
});

export async function submitDemoRequest(
  body: Record<string, unknown>,
  m: SubmissionMeta,
): Promise<string> {
  const res = await apiFetch<{ reference: string }>('/api/marketplace/demo-requests', {
    method: 'POST',
    body: { ...body, meta: meta(m) },
  });
  return res.data.reference;
}

export async function submitInquiry(
  body: Record<string, unknown>,
  m: SubmissionMeta,
): Promise<string> {
  const res = await apiFetch<{ reference: string }>('/api/marketplace/inquiries', {
    method: 'POST',
    body: { ...body, meta: meta(m) },
  });
  return res.data.reference;
}

// ── Idea board ("What should we build next?") ───────────────────────────────

export async function fetchIdeas(
  query: { sort: IdeaSort; status?: IdeaStatus; q?: string; limit?: number },
  signal?: AbortSignal,
): Promise<PublicIdea[]> {
  const res = await apiFetch<PublicIdea[]>('/api/marketplace/ideas', {
    query: { sort: query.sort, status: query.status, q: query.q || undefined, limit: query.limit },
    signal,
    background: true,
  });
  return res.data;
}

export async function submitIdea(
  body: {
    title: string;
    problem: string;
    categoryCode: string | null;
    submitterName: string | null;
    submitterEmail: string;
  },
  m: SubmissionMeta,
): Promise<string> {
  const res = await apiFetch<{ reference: string }>('/api/marketplace/ideas', {
    method: 'POST',
    body: { ...body, meta: meta(m) },
  });
  return res.data.reference;
}

export async function voteForIdea(reference: string): Promise<PublicIdea> {
  const res = await apiFetch<PublicIdea>(
    `/api/marketplace/ideas/${encodeURIComponent(reference)}/vote`,
    { method: 'POST', body: {} },
  );
  return res.data;
}

// ── Customer ratings ────────────────────────────────────────────────────────

const reviewsPath = (slug: string) =>
  `/api/marketplace/products/${encodeURIComponent(slug)}/reviews`;

/** A product's rating and approved reviews (newest first); `rating` keeps only that star rating. */
export async function fetchReviews(
  slug: string,
  rating?: number,
  signal?: AbortSignal,
): Promise<PublicProductReviews> {
  const res = await apiFetch<PublicProductReviews>(reviewsPath(slug), {
    query: { rating },
    signal,
    background: true,
  });
  return res.data;
}

/** Sends a rating; it appears once staff approve it. Returns the reference. */
export async function submitReview(
  slug: string,
  body: {
    rating: number;
    title: string | null;
    /** Everything but the rating is optional (null when left empty). */
    body: string | null;
    reviewerName: string | null;
    reviewerRole: string | null;
    reviewerEmail: string | null;
  },
  m: SubmissionMeta,
): Promise<string> {
  const res = await apiFetch<{ reference: string }>(reviewsPath(slug), {
    method: 'POST',
    body: { ...body, meta: meta(m) },
  });
  return res.data.reference;
}

// ── Ask the developer ───────────────────────────────────────────────────────

/** Sends a question to the product's assigned developer; returns the reference and private link. */
export async function askTheDeveloper(
  body: { productSlug: string; customerName: string; customerEmail: string; question: string },
  m: SubmissionMeta,
): Promise<{ reference: string; conversationUrl: string }> {
  const res = await apiFetch<{ reference: string; conversationUrl: string }>(
    '/api/marketplace/questions',
    { method: 'POST', body: { ...body, meta: meta(m) } },
  );
  return res.data;
}

const questionPath = (reference: string) =>
  `/api/marketplace/questions/${encodeURIComponent(reference)}`;

/** The customer's conversation, opened with the reference and the private token from the e-mail. */
export async function fetchConversation(
  reference: string,
  token: string,
  signal?: AbortSignal,
): Promise<PublicConversation> {
  const res = await apiFetch<PublicConversation>(questionPath(reference), {
    query: { t: token },
    signal,
    background: true,
  });
  return res.data;
}

/** A follow-up question in the same conversation (same reference). */
export async function sendFollowUp(
  reference: string,
  token: string,
  body: string,
): Promise<PublicConversation> {
  const res = await apiFetch<PublicConversation>(`${questionPath(reference)}/messages`, {
    method: 'POST',
    body: { t: token, body },
  });
  return res.data;
}

/** Fire-and-forget engagement event (never surfaces errors). */
export function track(
  type: 'product_view' | 'demo_play' | 'assistant_query',
  productSlug?: string | null,
) {
  void apiFetch('/api/marketplace/events', {
    method: 'POST',
    body: { type, productSlug: productSlug ?? null },
    background: true,
  }).catch(() => undefined);
}

/**
 * Asks the hosted assistant (Claude, grounded in the catalog and approved
 * documentation). If it is not configured or unavailable, answers with the
 * on-device engine over the public catalog instead.
 */
export async function ask(
  question: string,
  opts: {
    products: MarketplaceProduct[];
    taxonomy: Taxonomy;
    focusSlug?: string;
    history: ChatTurn[];
  },
): Promise<AssistantReply> {
  try {
    const res = await apiFetch<AssistantReply>('/api/marketplace/assistant', {
      method: 'POST',
      body: { question, focusSlug: opts.focusSlug ?? null, history: opts.history.slice(-8) },
      timeoutMs: 60_000,
    });
    return res.data;
  } catch (error) {
    if (isApiClientError(error) && error.code === 'RATE_LIMITED') {
      return {
        text: "You've asked a lot of questions in a short time. Please wait a few minutes — or contact our team directly and we'll be glad to help.",
        products: [],
        actions: [{ kind: 'inquiry', label: 'Contact the team' }],
        sources: [],
        grounded: true,
      };
    }
    track('assistant_query', opts.focusSlug);
    await new Promise((r) => setTimeout(r, 350));
    return answer(question, opts);
  }
}
