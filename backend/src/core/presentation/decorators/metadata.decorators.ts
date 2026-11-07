import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { AuditCategory } from '#core/domain/audit-record.js';

// ── Authentication ───────────────────────────────────────────────────────────

export const IS_PUBLIC_KEY = 'appcore:isPublic';
/** Endpoint needs no end-user token (the BFF service signature still applies). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

// ── Response shaping ─────────────────────────────────────────────────────────

export const RAW_RESPONSE_KEY = 'appcore:rawResponse';
/** Skip the standard success envelope (health probes, file streams). */
export const RawResponse = (): MethodDecorator & ClassDecorator =>
  SetMetadata(RAW_RESPONSE_KEY, true);

// ── Audit ────────────────────────────────────────────────────────────────────

export interface AuditOptions {
  /** Stable action name, e.g. "USER_CREATE", "AUTH_LOGIN". */
  action: string;
  category: AuditCategory;
  resourceType?: string;
  /** Where to read the resource id from; defaults to route param `id`, then result `data.id`. */
  resourceId?: (req: Request, result: unknown) => string | null | undefined;
  /** Extra NON-SENSITIVE metadata. */
  metadata?: (req: Request, result: unknown) => Record<string, unknown> | undefined;
  /** Actor username hint for unauthenticated flows (e.g. login). */
  actorHint?: (req: Request) => string | undefined;
}

export const AUDIT_KEY = 'appcore:audit';
/**
 * Records an audit entry for the endpoint (success, failure or denial) without
 * any audit code in the business logic.
 */
export const Audit = (options: AuditOptions): MethodDecorator => SetMetadata(AUDIT_KEY, options);

// ── Idempotency ──────────────────────────────────────────────────────────────

export interface IdempotencyOptions {
  /** Reject requests without an Idempotency-Key header. Default true. */
  required?: boolean;
  /** How long the stored result is replayed. Defaults to IDEMPOTENCY_TTL_SECONDS. */
  ttlSeconds?: number;
}

export const IDEMPOTENT_KEY = 'appcore:idempotent';
/**
 * Makes an endpoint safe to retry: the first result for an Idempotency-Key is
 * stored and replayed for duplicates; concurrent duplicates get 409.
 */
export const Idempotent = (options: IdempotencyOptions = {}): MethodDecorator =>
  SetMetadata(IDEMPOTENT_KEY, { required: true, ...options });
