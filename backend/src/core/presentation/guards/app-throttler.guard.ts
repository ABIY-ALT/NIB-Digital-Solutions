import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { RequestContext } from '#core/infrastructure/context/request-context.js';

/**
 * Rate limiting keyed by the END-USER IP. All traffic reaches the backend from
 * the BFF, so the socket IP is useless; the IP forwarded in the signed
 * X-AppCore-Client-Ip header (trusted only after service authentication) is used.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const ctxIp = RequestContext.get()?.ipAddress;
    const fallback = typeof req['ip'] === 'string' ? req['ip'] : 'unknown';
    return Promise.resolve(ctxIp ?? fallback);
  }
}
