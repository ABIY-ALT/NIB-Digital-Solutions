import { SetMetadata, type ExecutionContext } from '@nestjs/common';

export const AUTH_RATE_LIMIT_KEY = 'appcore:authRateLimit';

/**
 * Applies the stricter "auth" rate limit (AUTH_RATE_LIMIT_MAX per
 * AUTH_RATE_LIMIT_TTL_SECONDS per client IP) in addition to the global limit.
 */
export const AuthRateLimit = (): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTH_RATE_LIMIT_KEY, true);

/** Used by the "auth" throttler's skipIf: only enforce on @AuthRateLimit() routes. */
export function isAuthRateLimited(context: ExecutionContext): boolean {
  return (
    Reflect.getMetadata(AUTH_RATE_LIMIT_KEY, context.getHandler()) === true ||
    Reflect.getMetadata(AUTH_RATE_LIMIT_KEY, context.getClass()) === true
  );
}
