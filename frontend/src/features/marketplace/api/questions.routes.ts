import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseWith, publicApiRoute, readJson } from '@/features/auth/api/api-route';
import { backend } from '@/infrastructure/api/backend';
import { env } from '@/infrastructure/config/env';
import { logger } from '@/infrastructure/logging/logger';
import { ApiClientError } from '@/shared/errors/api-client-error';
import type { PublicConversation } from '../types';

/**
 * Public BFF routes for "Ask the developer" (customer side) and the Telegram
 * webhook. Bodies are bounded here and validated again by the backend; POSTs
 * from the browser keep the CSRF and Origin checks of publicApiRoute.
 */

const meta = z.object({
  honeypot: z.string().max(200),
  elapsedMs: z.number().int().min(0).max(86_400_000),
});

// ── Ask the developer ───────────────────────────────────────────────────────

const questionRef = z.string().regex(/^QST-\d{6}-[A-Z0-9]{5}$/);
const token = z.string().regex(/^[A-Za-z0-9_-]{20,64}$/);

const askBody = z.object({
  productSlug: z.string().max(80),
  customerName: z.string().max(120),
  customerEmail: z.string().max(160),
  question: z.string().max(4000),
  meta,
});

export const askQuestion = publicApiRoute<{ reference: string; conversationUrl: string }>(
  async ({ req, api }) => {
    const body = await readJson(req, parseWith(askBody));
    const res = await api.post<{ reference: string; conversationUrl: string }>(
      '/marketplace/questions',
      body,
    );
    return { data: res.data, message: res.message, status: 201 };
  },
);

export const questionConversation = publicApiRoute<PublicConversation, { reference: string }>(
  async ({ req, api, params }) => {
    const reference = questionRef.safeParse(params.reference);
    const t = token.safeParse(new URL(req.url).searchParams.get('t'));
    if (!reference.success || !t.success)
      throw new ApiClientError({
        code: 'NOT_FOUND',
        message: 'Conversation not found.',
        status: 404,
      });
    const res = await api.get<PublicConversation>(`/marketplace/questions/${reference.data}`, {
      query: { t: t.data },
    });
    return { data: res.data };
  },
);

const followUpBody = z.object({ t: token, body: z.string().max(4000) });

export const questionFollowUp = publicApiRoute<PublicConversation, { reference: string }>(
  async ({ req, api, params }) => {
    const reference = questionRef.safeParse(params.reference);
    if (!reference.success)
      throw new ApiClientError({
        code: 'NOT_FOUND',
        message: 'Conversation not found.',
        status: 404,
      });
    const body = await readJson(req, parseWith(followUpBody));
    const res = await api.post<PublicConversation>(
      `/marketplace/questions/${reference.data}/messages`,
      body,
    );
    return { data: res.data, message: res.message, status: 201 };
  },
);

// ── Telegram webhook ────────────────────────────────────────────────────────

const sameSecret = (presented: string | null, expected: string) => {
  if (!presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * POST /api/telegram/webhook. Telegram (not a browser) calls this, so there is
 * no CSRF token; instead it must present the secret registered with
 * setWebhook. The update is forwarded to the backend with the BFF service
 * signature. Errors return 503 so Telegram retries (updates are idempotent).
 */
export async function telegramWebhook(req: Request): Promise<Response> {
  const secret = env().TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return new NextResponse(null, { status: 404 });
  if (!sameSecret(req.headers.get('x-telegram-bot-api-secret-token'), secret))
    return new NextResponse(null, { status: 401 });
  const raw = await req.text();
  if (raw.length > 64_000) return new NextResponse(null, { status: 413 });
  let update: unknown;
  try {
    update = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  try {
    await backend().post('/telegram/updates', update);
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      'Telegram update could not be forwarded',
    );
    return new NextResponse(null, { status: 503 });
  }
}
