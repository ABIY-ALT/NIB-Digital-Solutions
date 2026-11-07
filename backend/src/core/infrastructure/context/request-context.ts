import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  RequestContextAccessor,
  RequestContextData,
} from '#core/application/ports/request-context.port.js';
import type { Principal } from '#core/application/security/principal.js';

const storage = new AsyncLocalStorage<RequestContextData>();

/**
 * Ambient per-request context backed by AsyncLocalStorage. Established by
 * CorrelationIdMiddleware at the very start of every request so the correlation
 * id is available to logs, audit records, outbound calls and error responses.
 */
export const RequestContext = {
  run<T>(data: RequestContextData, fn: () => T): T {
    return storage.run(data, fn);
  },
  get(): RequestContextData | undefined {
    return storage.getStore();
  },
  setPrincipal(principal: Principal): void {
    const ctx = storage.getStore();
    if (ctx) ctx.principal = principal;
  },
  setServiceClient(clientId: string): void {
    const ctx = storage.getStore();
    if (ctx) ctx.serviceClientId = clientId;
  },
};

@Injectable()
export class AlsRequestContextAccessor implements RequestContextAccessor {
  current(): RequestContextData | undefined {
    return storage.getStore();
  }

  correlationId(): string {
    return storage.getStore()?.correlationId ?? `bg-${randomUUID()}`;
  }

  actorId(): string | null {
    return storage.getStore()?.principal?.userId ?? null;
  }
}
