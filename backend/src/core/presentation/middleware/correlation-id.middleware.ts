import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestContext } from '#core/infrastructure/context/request-context.js';

export const CORRELATION_HEADER = 'x-correlation-id';
const VALID_ID = /^[A-Za-z0-9._:-]{8,64}$/;

/**
 * Single source of truth for a request's correlation id. Used by both the pino
 * HTTP logger (genReqId) and CorrelationIdMiddleware, whichever runs first.
 * Accepts the caller's id when well-formed (the BFF generates it at the edge),
 * otherwise generates a new UUID.
 */
export function resolveCorrelationId(req: IncomingMessage & { correlationId?: string }): string {
  if (req.correlationId) return req.correlationId;
  const incoming = req.headers[CORRELATION_HEADER];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  req.correlationId = candidate && VALID_ID.test(candidate) ? candidate : randomUUID();
  return req.correlationId;
}

/**
 * Establishes the per-request context (AsyncLocalStorage) and echoes the
 * correlation id in the response headers.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const correlationId = resolveCorrelationId(req);
    res.setHeader(CORRELATION_HEADER, correlationId);
    RequestContext.run(
      {
        correlationId,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent']?.slice(0, 512) ?? null,
        startedAt: Date.now(),
      },
      () => next(),
    );
  }
}
