# AppCore error codes

Error codes are product-level contracts. Never rename or reuse a code; add a new one instead.
Source of truth: `src/core/domain/errors/error-codes.ts` (codes, safe messages) and
`src/core/presentation/http/error-http-status.ts` (HTTP status).

Every error response has this shape:

```json
{
  "success": false,
  "error": { "code": "VALIDATION_FAILED", "message": "…", "details": [{ "field": "email", "message": "…" }] },
  "correlationId": "5b1c…",
  "timestamp": "2026-01-01T10:00:00.000Z",
  "path": "/api/v1/users"
}
```

| Code | HTTP | Meaning |
|---|---|---|
| INTERNAL_ERROR | 500 | Unexpected failure (details are logged, never returned) |
| VALIDATION_FAILED | 400 | Input failed validation; `details` lists field issues |
| BAD_REQUEST | 400 | Malformed request |
| NOT_FOUND | 404 | Resource does not exist (or is soft-deleted) |
| ROUTE_NOT_FOUND | 404 | Endpoint does not exist |
| METHOD_NOT_ALLOWED | 405 | HTTP method not supported |
| CONFLICT | 409 | Unique constraint / state conflict |
| CONCURRENCY_CONFLICT | 409 | Stale `version` (optimistic concurrency) |
| BUSINESS_RULE_VIOLATION | 422 | Domain rule broken (e.g. deleting yourself) |
| PAYLOAD_TOO_LARGE | 413 | Body exceeds `BODY_LIMIT` |
| UNSUPPORTED_MEDIA_TYPE | 415 | Unsupported content type |
| RATE_LIMITED | 429 | Too many requests (`Retry-After` header set) |
| SERVICE_UNAVAILABLE | 503 | Temporarily unavailable |
| UNAUTHENTICATED | 401 | No or missing bearer token |
| AUTH_INVALID_CREDENTIALS | 401 | Wrong username or password (no account enumeration) |
| AUTH_ACCOUNT_LOCKED | 423 | Locked after too many failures |
| AUTH_ACCOUNT_DISABLED | 403 | Account disabled / pending activation |
| AUTH_TOKEN_INVALID | 401 | Access token invalid |
| AUTH_TOKEN_EXPIRED | 401 | Access token expired |
| AUTH_SESSION_EXPIRED | 401 | Session idle or past absolute lifetime |
| AUTH_SESSION_REVOKED | 401 | Session logged out / revoked |
| AUTH_REFRESH_TOKEN_INVALID | 401 | Refresh token unknown |
| AUTH_REFRESH_TOKEN_REUSED | 401 | Old refresh token replayed → session revoked |
| AUTH_MFA_INVALID_CODE | 401 | Wrong MFA code |
| AUTH_MFA_CHALLENGE_INVALID | 401 | MFA challenge expired/unknown |
| AUTH_MFA_TOO_MANY_ATTEMPTS | 429 | Too many wrong MFA codes |
| AUTH_MFA_METHOD_UNSUPPORTED | 400 | MFA method not configured |
| AUTH_EXTERNAL_TOKEN_INVALID | 401 | OIDC ID token rejected |
| AUTH_EXTERNAL_IDENTITY_UNLINKED | 403 | OIDC identity not linked to a user |
| AUTH_PROVIDER_UNAVAILABLE | 503 | Identity provider unreachable |
| AUTH_PASSWORD_CHANGE_INVALID | 401 | The password-change step of sign-in expired or is invalid; sign in again |
| AUTH_PASSWORD_RESET_INVALID | 400 | The e-mailed password reset link is invalid, used or expired; request a new one |
| APPROVAL_NOT_PENDING | 409 | The approval request was already approved, rejected, withdrawn or expired |
| APPROVAL_SELF_DECISION | 403 | Four-eyes rule: the maker cannot approve or reject their own request |
| APPROVAL_ALREADY_PENDING | 409 | Another change to the same record is already waiting for approval |
| FORBIDDEN | 403 | Authenticated but not authorized (RBAC/ABAC) |
| SERVICE_AUTH_FAILED | 401 | BFF signature missing/invalid/replayed |
| PAYLOAD_ENCRYPTION_REQUIRED | 400 | Plaintext sent while encryption is `required` |
| PAYLOAD_DECRYPTION_FAILED | 400 | Encrypted envelope could not be decrypted |
| IDEMPOTENCY_KEY_MISSING | 400 | `Idempotency-Key` header required |
| IDEMPOTENCY_KEY_INVALID | 400 | Malformed idempotency key |
| IDEMPOTENCY_IN_PROGRESS | 409 | Same key still processing |
| IDEMPOTENCY_KEY_REUSED | 422 | Same key, different payload |
| EXTERNAL_SERVICE_ERROR | 502 | Downstream system returned an error |
| EXTERNAL_SERVICE_TIMEOUT | 504 | Downstream system timed out |
| EXTERNAL_SERVICE_UNAVAILABLE | 503 | Circuit breaker open |

The BFF adds transport codes of its own: `NETWORK_ERROR`, `TIMEOUT`, `ABORTED`, `CSRF_FAILED`,
`INVALID_RESPONSE`, `UNKNOWN_ERROR`, plus sign-in codes (`invalid_credentials`, `mfa_required`, …).
