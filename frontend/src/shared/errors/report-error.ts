import { apiFetch } from '@/infrastructure/api/api-fetch';
import { isApiClientError } from './api-client-error';

/**
 * Sends browser-side crashes to the BFF (POST /api/client-errors), where
 * they join the structured server logs with a correlation id. API errors are
 * NOT reported here: the BFF already logged them when they happened.
 *
 * Safe by design: fire-and-forget, never throws, de-duplicated, capped per page
 * view, and it sends no query strings, form values or tokens.
 */
export type ClientErrorKind = 'boundary' | 'route' | 'global' | 'unhandled' | 'rejection';

const MAX_REPORTS_PER_PAGE = 10;
const DEDUPE_MS = 10_000;
let sent = 0;
const recent = new Map<string, number>();

/** The thrown value as an Error (a thrown string becomes its message). */
function asError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === 'string' ? error : 'Non-error value thrown');
}

export function reportClientError(
  error: unknown,
  context: { kind: ClientErrorKind; digest?: string; componentStack?: string },
): void {
  if (typeof window === 'undefined' || isApiClientError(error)) return;
  const err = asError(error);
  const signature = `${context.kind}:${err.name}:${err.message}`;
  const now = Date.now();
  if (sent >= MAX_REPORTS_PER_PAGE || (recent.get(signature) ?? 0) > now - DEDUPE_MS) return;
  recent.set(signature, now);
  sent += 1;

  void apiFetch('/api/client-errors', {
    method: 'POST',
    background: true,
    timeoutMs: 5_000,
    body: {
      kind: context.kind,
      name: err.name.slice(0, 100),
      message: err.message.slice(0, 500),
      stack: err.stack?.slice(0, 4_000),
      componentStack: context.componentStack?.slice(0, 2_000),
      digest: context.digest,
      path: window.location.pathname,
    },
  }).catch(() => undefined);
}
