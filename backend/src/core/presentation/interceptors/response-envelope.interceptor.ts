import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { map, type Observable } from 'rxjs';
import { PayloadCryptoService } from '#core/infrastructure/crypto/payload-crypto.service.js';
import { ENCRYPTION_HEADER } from '#core/infrastructure/crypto/payload-crypto.js';
import { RAW_RESPONSE_KEY } from '../decorators/metadata.decorators.js';
import { ApiResult, type ApiSuccessResponse } from '../http/api-response.js';

/**
 * Wraps every controller result in the standard success envelope and, when the
 * request arrived encrypted, encrypts the response for the BFF.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly crypto: PayloadCryptoService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((value: unknown) => {
        if (raw) return value;
        const result = value instanceof ApiResult ? value : new ApiResult(value ?? null);
        if (result.status) res.status(result.status);
        const correlationId = req.correlationId ?? 'unknown';
        const envelope: ApiSuccessResponse<unknown> = {
          success: true,
          data: result.data,
          message: result.message,
          ...(result.meta ? { meta: result.meta } : {}),
          correlationId,
          timestamp: new Date().toISOString(),
        };
        if (req.payloadEncrypted && this.crypto.mode !== 'disabled') {
          res.setHeader(ENCRYPTION_HEADER, '1');
          return this.crypto.encryptResponse(envelope, correlationId);
        }
        return envelope;
      }),
    );
  }
}
