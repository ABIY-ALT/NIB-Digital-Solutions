/** How the UI should react to an error category. */
export type ErrorKind =
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'not_found'
  | 'conflict'
  | 'rate_limit'
  | 'network'
  | 'unavailable'
  | 'unexpected';

export function errorKindOf(code: string, status?: number): ErrorKind {
  if (code === 'VALIDATION_FAILED' || code === 'BAD_REQUEST') return 'validation';
  if (code === 'FORBIDDEN' || status === 403) return 'authorization';
  if (code.startsWith('AUTH_') || code === 'UNAUTHENTICATED' || status === 401)
    return 'authentication';
  if (code === 'NOT_FOUND' || code === 'ROUTE_NOT_FOUND' || status === 404) return 'not_found';
  if (code === 'CONFLICT' || code === 'CONCURRENCY_CONFLICT' || code.startsWith('IDEMPOTENCY_'))
    return 'conflict';
  if (code === 'RATE_LIMITED' || status === 429) return 'rate_limit';
  if (code === 'NETWORK_ERROR' || code === 'TIMEOUT') return 'network';
  if (code.startsWith('EXTERNAL_') || code === 'SERVICE_UNAVAILABLE' || status === 503)
    return 'unavailable';
  return 'unexpected';
}

/** Session-ending authentication errors: the UI should send the user to sign-in. */
export const SESSION_ENDING_CODES: ReadonlySet<string> = new Set([
  'UNAUTHENTICATED',
  'AUTH_TOKEN_INVALID',
  'AUTH_TOKEN_EXPIRED',
  'AUTH_SESSION_EXPIRED',
  'AUTH_SESSION_REVOKED',
  'AUTH_REFRESH_TOKEN_INVALID',
  'AUTH_REFRESH_TOKEN_REUSED',
]);
