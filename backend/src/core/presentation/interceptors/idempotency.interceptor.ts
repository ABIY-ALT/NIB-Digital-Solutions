import { createHash } from 'node:crypto';
import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { catchError, from, mergeMap, of, throwError, type Observable } from 'rxjs';
import {
  IDEMPOTENCY_STORE,
  type IdempotencyStore,
} from '#core/application/ports/idempotency.port.js';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';
import { IdempotencyError } from '#core/domain/errors/app-error.js';
import { ErrorCode } from '#core/domain/errors/error-codes.js';
import { IDEMPOTENT_KEY, type IdempotencyOptions } from '../decorators/metadata.decorators.js';
import { ApiResult } from '../http/api-response.js';

const KEY_PATTERN = /^[A-Za-z0-9_.:-]{8,128}$/;

interface Stored {
  data: unknown;
  message: string | null;
  meta?: NonNullable<ApiResult<unknown>['meta']>;
}

/**
 * Built-in idempotency for @Idempotent() endpoints.
 *
 * Key scope = caller + method + route + Idempotency-Key, so keys cannot collide
 * across users. The request fingerprint (hash of the decrypted body) must match
 * for a replay; a different payload with the same key is rejected.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Inject(IDEMPOTENCY_STORE) private readonly store: IdempotencyStore,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<IdempotencyOptions | undefined>(
      IDEMPOTENT_KEY,
      context.getHandler(),
    );
    if (!options) return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const rawKey = req.headers['idempotency-key'];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    if (!key) {
      if (options.required === false) return next.handle();
      throw new IdempotencyError(ErrorCode.IDEMPOTENCY_KEY_MISSING);
    }
    if (!KEY_PATTERN.test(key)) throw new IdempotencyError(ErrorCode.IDEMPOTENCY_KEY_INVALID);

    const caller = req.principal?.userId ?? req.serviceClientId ?? 'anonymous';
    const route = `${req.method}:${req.route ? (req.route as { path: string }).path : req.path}`;
    const scopedKey = `${caller}:${route}:${key}`;
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(req.body ?? null))
      .digest('hex');
    const ttl = options.ttlSeconds ?? this.config.idempotency.ttlSeconds;

    return from(this.store.begin(scopedKey, fingerprint, ttl)).pipe(
      mergeMap((begin) => {
        switch (begin.state) {
          case 'in_progress':
            return throwError(() => new IdempotencyError(ErrorCode.IDEMPOTENCY_IN_PROGRESS));
          case 'fingerprint_mismatch':
            return throwError(() => new IdempotencyError(ErrorCode.IDEMPOTENCY_KEY_REUSED));
          case 'completed': {
            const stored = begin.response.body as Stored;
            res.status(begin.response.statusCode);
            res.setHeader('Idempotent-Replayed', 'true');
            return of(new ApiResult(stored.data, stored.message, stored.meta));
          }
          default:
            return next.handle().pipe(
              mergeMap(async (value: unknown) => {
                const result = value instanceof ApiResult ? value : new ApiResult(value ?? null);
                const body: Stored = {
                  data: result.data,
                  message: result.message,
                  meta: result.meta,
                };
                await this.store.complete(
                  scopedKey,
                  fingerprint,
                  { statusCode: result.status ?? res.statusCode, body },
                  ttl,
                );
                return result;
              }),
              catchError((error: unknown) =>
                from(this.store.release(scopedKey)).pipe(mergeMap(() => throwError(() => error))),
              ),
            );
        }
      }),
    );
  }
}
