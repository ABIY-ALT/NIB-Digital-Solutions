import { headers } from 'next/headers';
import { BackendClient, type RequestMeta } from '@/infrastructure/api/backend-client';
import { env } from '@/infrastructure/config/env';
import { logger } from '@/infrastructure/logging/logger';

/** Correlation id / client IP / UA of the current browser request (set by proxy.ts). */
async function currentRequestMeta(): Promise<RequestMeta> {
  try {
    const h = await headers();
    return {
      correlationId: h.get('x-correlation-id') ?? undefined,
      clientIp: h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
      userAgent: h.get('user-agent') ?? undefined,
    };
  } catch {
    return {}; // outside a request scope (proxy, build)
  }
}

let client: BackendClient | undefined;

/** The single BFF → backend client (signed, optionally encrypted). Server-side only. */
export function backend(): BackendClient {
  if (client) return client;
  const e = env();
  client = new BackendClient({
    baseUrl: e.BACKEND_URL.replace(/\/$/, ''),
    apiPrefix: e.BACKEND_API_PREFIX,
    clientId: e.BACKEND_SERVICE_CLIENT_ID,
    clientSecret: e.BACKEND_SERVICE_CLIENT_SECRET,
    encryption: { enabled: e.PAYLOAD_ENCRYPTION_ENABLED, keyRing: e.keyRing },
    timeoutMs: e.BACKEND_TIMEOUT_MS,
    retries: 2,
    logger,
    requestMeta: currentRequestMeta,
  });
  return client;
}
