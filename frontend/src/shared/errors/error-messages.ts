import { errorKindOf } from '@/shared/types';
import { isApiClientError } from './api-client-error';

/**
 * Maps any error to a translation key in the `errors` namespace so every
 * failure (API, validation, auth, permission, network, crash) gets a consistent,
 * user-friendly message. Backend messages are used for 4xx business errors.
 */
export function errorMessageKey(error: unknown): string {
  if (!isApiClientError(error)) return 'generic';
  switch (errorKindOf(error.code, error.status)) {
    case 'network':
      return 'network';
    case 'rate_limit':
      return 'rateLimited';
    case 'unavailable':
      return 'unavailable';
    case 'authentication':
      return 'sessionExpired';
    case 'authorization':
      return 'forbiddenDescription';
    case 'conflict':
      return error.code === 'CONCURRENCY_CONFLICT' ? 'conflict' : 'generic';
    case 'validation':
      return 'validation';
    default:
      return 'generic';
  }
}

/** Codes with their own translated message (errors.<CODE>) — preferred over backend text. */
const TRANSLATED_CODES: ReadonlySet<string> = new Set([
  'APPROVAL_NOT_PENDING',
  'APPROVAL_SELF_DECISION',
  'APPROVAL_ALREADY_PENDING',
  'AUTH_PASSWORD_CHANGE_INVALID',
  'AUTH_PASSWORD_RESET_INVALID',
]);

/** Human message for toasts: backend 4xx message when meaningful, otherwise a translated generic. */
export function describeError(
  error: unknown,
  t: (key: string) => string,
): { message: string; correlationId: string | null } {
  if (isApiClientError(error)) {
    if (TRANSLATED_CODES.has(error.code)) {
      return { message: t(error.code), correlationId: error.correlationId };
    }
    const kind = errorKindOf(error.code, error.status);
    const useBackendMessage =
      error.status >= 400 && error.status < 500 && !['network', 'authentication'].includes(kind);
    return {
      message: useBackendMessage ? error.message : t(errorMessageKey(error)),
      correlationId: error.correlationId,
    };
  }
  return { message: t('generic'), correlationId: null };
}
