import 'server-only';
import { randomUUID } from 'node:crypto';
import type { BackendAuthOutcome } from '@/shared/types';

/**
 * Hands a backend sign-in outcome that a BFF route already obtained (e.g. the
 * forced password change, which must surface validation details to the form)
 * to the Auth.js credentials provider within the SAME request, so Auth.js can
 * create the session cookie. Entries are single-use and live for seconds.
 */
const TTL_MS = 30_000;
const pending = new Map<string, { outcome: BackendAuthOutcome; expires: number }>();

export function stashOutcome(outcome: BackendAuthOutcome): string {
  const now = Date.now();
  for (const [id, entry] of pending) if (entry.expires <= now) pending.delete(id);
  const id = randomUUID();
  pending.set(id, { outcome, expires: now + TTL_MS });
  return id;
}

export function takeOutcome(id: string): BackendAuthOutcome | null {
  const entry = pending.get(id);
  pending.delete(id);
  return entry && entry.expires > Date.now() ? entry.outcome : null;
}
