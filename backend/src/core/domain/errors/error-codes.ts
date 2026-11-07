/**
 * AppCore error code catalogue.
 *
 * Error codes are PRODUCT-LEVEL CONTRACTS (principle 10): clients, the BFF and
 * monitoring rely on them. Never rename or repurpose an existing code — add a new
 * one instead. Every code is documented in docs/error-codes.md.
 *
 * HTTP status mapping lives in the presentation layer (error-http-status.ts) so
 * the domain stays transport-agnostic.
 */
export const ErrorCode = {
  // ── Generic ────────────────────────────────────────────────────────────────
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  BAD_REQUEST: 'BAD_REQUEST',
  NOT_FOUND: 'NOT_FOUND',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  CONFLICT: 'CONFLICT',
  CONCURRENCY_CONFLICT: 'CONCURRENCY_CONFLICT',
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // ── Authentication ─────────────────────────────────────────────────────────
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
  AUTH_ACCOUNT_DISABLED: 'AUTH_ACCOUNT_DISABLED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_SESSION_EXPIRED: 'AUTH_SESSION_EXPIRED',
  AUTH_SESSION_REVOKED: 'AUTH_SESSION_REVOKED',
  AUTH_REFRESH_TOKEN_INVALID: 'AUTH_REFRESH_TOKEN_INVALID',
  AUTH_REFRESH_TOKEN_REUSED: 'AUTH_REFRESH_TOKEN_REUSED',
  AUTH_MFA_INVALID_CODE: 'AUTH_MFA_INVALID_CODE',
  AUTH_MFA_CHALLENGE_INVALID: 'AUTH_MFA_CHALLENGE_INVALID',
  AUTH_MFA_TOO_MANY_ATTEMPTS: 'AUTH_MFA_TOO_MANY_ATTEMPTS',
  AUTH_MFA_METHOD_UNSUPPORTED: 'AUTH_MFA_METHOD_UNSUPPORTED',
  AUTH_EXTERNAL_TOKEN_INVALID: 'AUTH_EXTERNAL_TOKEN_INVALID',
  AUTH_EXTERNAL_IDENTITY_UNLINKED: 'AUTH_EXTERNAL_IDENTITY_UNLINKED',
  AUTH_PROVIDER_UNAVAILABLE: 'AUTH_PROVIDER_UNAVAILABLE',
  AUTH_PASSWORD_CHANGE_INVALID: 'AUTH_PASSWORD_CHANGE_INVALID',
  AUTH_PASSWORD_RESET_INVALID: 'AUTH_PASSWORD_RESET_INVALID',

  // ── Maker–checker approvals ────────────────────────────────────────────────
  APPROVAL_NOT_PENDING: 'APPROVAL_NOT_PENDING',
  APPROVAL_SELF_DECISION: 'APPROVAL_SELF_DECISION',
  APPROVAL_ALREADY_PENDING: 'APPROVAL_ALREADY_PENDING',

  // ── Authorization ──────────────────────────────────────────────────────────
  FORBIDDEN: 'FORBIDDEN',

  // ── Service-to-service / transport security ────────────────────────────────
  SERVICE_AUTH_FAILED: 'SERVICE_AUTH_FAILED',
  PAYLOAD_ENCRYPTION_REQUIRED: 'PAYLOAD_ENCRYPTION_REQUIRED',
  PAYLOAD_DECRYPTION_FAILED: 'PAYLOAD_DECRYPTION_FAILED',

  // ── Idempotency ────────────────────────────────────────────────────────────
  IDEMPOTENCY_KEY_MISSING: 'IDEMPOTENCY_KEY_MISSING',
  IDEMPOTENCY_KEY_INVALID: 'IDEMPOTENCY_KEY_INVALID',
  IDEMPOTENCY_IN_PROGRESS: 'IDEMPOTENCY_IN_PROGRESS',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',

  // ── External integrations ──────────────────────────────────────────────────
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  EXTERNAL_SERVICE_TIMEOUT: 'EXTERNAL_SERVICE_TIMEOUT',
  EXTERNAL_SERVICE_UNAVAILABLE: 'EXTERNAL_SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Safe, user-facing default messages. Never include internal details here. */
export const DefaultErrorMessages: Record<ErrorCode, string> = {
  INTERNAL_ERROR: 'An unexpected error occurred. Please try again later.',
  VALIDATION_FAILED: 'The request contains invalid data.',
  BAD_REQUEST: 'The request could not be processed.',
  NOT_FOUND: 'The requested resource was not found.',
  ROUTE_NOT_FOUND: 'The requested endpoint does not exist.',
  METHOD_NOT_ALLOWED: 'The HTTP method is not allowed for this endpoint.',
  CONFLICT: 'The request conflicts with the current state of the resource.',
  CONCURRENCY_CONFLICT: 'The resource was modified by someone else. Reload and try again.',
  BUSINESS_RULE_VIOLATION: 'The operation violates a business rule.',
  PAYLOAD_TOO_LARGE: 'The request payload is too large.',
  UNSUPPORTED_MEDIA_TYPE: 'The request content type is not supported.',
  RATE_LIMITED: 'Too many requests. Please slow down and try again shortly.',
  SERVICE_UNAVAILABLE: 'The service is temporarily unavailable.',
  UNAUTHENTICATED: 'Authentication is required.',
  AUTH_INVALID_CREDENTIALS: 'Invalid username or password.',
  AUTH_ACCOUNT_LOCKED: 'The account is temporarily locked. Try again later or contact support.',
  AUTH_ACCOUNT_DISABLED: 'The account is disabled. Contact support.',
  AUTH_TOKEN_INVALID: 'The access token is invalid.',
  AUTH_TOKEN_EXPIRED: 'The access token has expired.',
  AUTH_SESSION_EXPIRED: 'Your session has expired. Please sign in again.',
  AUTH_SESSION_REVOKED: 'Your session has ended. Please sign in again.',
  AUTH_REFRESH_TOKEN_INVALID: 'The session could not be renewed. Please sign in again.',
  AUTH_REFRESH_TOKEN_REUSED:
    'The session was terminated for security reasons. Please sign in again.',
  AUTH_MFA_INVALID_CODE: 'The verification code is incorrect.',
  AUTH_MFA_CHALLENGE_INVALID: 'The verification request has expired. Please sign in again.',
  AUTH_MFA_TOO_MANY_ATTEMPTS: 'Too many incorrect codes. Please sign in again.',
  AUTH_MFA_METHOD_UNSUPPORTED: 'The requested verification method is not available.',
  AUTH_EXTERNAL_TOKEN_INVALID: 'The identity provider token is invalid.',
  AUTH_EXTERNAL_IDENTITY_UNLINKED: 'This identity is not linked to an account.',
  AUTH_PROVIDER_UNAVAILABLE: 'The identity provider is unavailable.',
  AUTH_PASSWORD_CHANGE_INVALID: 'The password change request has expired. Please sign in again.',
  AUTH_PASSWORD_RESET_INVALID:
    'This password reset link is invalid or has expired. Request a new one.',
  APPROVAL_NOT_PENDING: 'This request has already been decided or withdrawn.',
  APPROVAL_SELF_DECISION: 'You cannot approve or reject a change you requested yourself.',
  APPROVAL_ALREADY_PENDING: 'A change to this record is already awaiting approval.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  SERVICE_AUTH_FAILED: 'The calling service could not be authenticated.',
  PAYLOAD_ENCRYPTION_REQUIRED: 'An encrypted payload is required.',
  PAYLOAD_DECRYPTION_FAILED: 'The encrypted payload could not be processed.',
  IDEMPOTENCY_KEY_MISSING: 'An Idempotency-Key header is required for this operation.',
  IDEMPOTENCY_KEY_INVALID: 'The Idempotency-Key header is malformed.',
  IDEMPOTENCY_IN_PROGRESS: 'A request with this Idempotency-Key is still being processed.',
  IDEMPOTENCY_KEY_REUSED: 'This Idempotency-Key was already used with a different request.',
  EXTERNAL_SERVICE_ERROR: 'A downstream service returned an error.',
  EXTERNAL_SERVICE_TIMEOUT: 'A downstream service did not respond in time.',
  EXTERNAL_SERVICE_UNAVAILABLE: 'A downstream service is temporarily unavailable.',
};
