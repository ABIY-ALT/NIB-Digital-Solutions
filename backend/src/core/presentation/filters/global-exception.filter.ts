import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, type FieldIssue } from '#core/domain/errors/app-error.js';
import { DefaultErrorMessages, ErrorCode } from '#core/domain/errors/error-codes.js';
import { RequestContext } from '#core/infrastructure/context/request-context.js';
import { PayloadCryptoService } from '#core/infrastructure/crypto/payload-crypto.service.js';
import { translatePrismaError } from '#core/infrastructure/prisma/prisma-errors.js';
import type { ApiErrorResponse } from '../http/api-response.js';
import { codeForStatus, ErrorHttpStatus } from '../http/error-http-status.js';

interface Normalised {
  status: number;
  code: ErrorCode;
  message: string;
  details?: NonNullable<ApiErrorResponse['error']['details']>;
  retryAfterSeconds?: number;
}

/**
 * Global error handler. Catches EVERYTHING and returns the standard error
 * envelope. Internal details (stack traces, SQL, upstream bodies) are logged
 * server-side with the correlation id and never sent to the caller.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  constructor(private readonly crypto: PayloadCryptoService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const correlationId = req.correlationId ?? RequestContext.get()?.correlationId ?? 'unknown';
    const n = this.normalise(exception);

    const logPayload = {
      correlationId,
      code: n.code,
      status: n.status,
      method: req.method,
      path: req.originalUrl?.split('?')[0],
    };
    if (n.status >= 500) this.logger.error({ ...logPayload, err: exception }, 'Request failed');
    else this.logger.warn(logPayload, `Request rejected: ${n.code}`);

    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: n.code,
        message: n.message,
        ...(n.details !== undefined ? { details: n.details } : {}),
      },
      correlationId,
      timestamp: new Date().toISOString(),
      path: req.originalUrl?.split('?')[0] ?? '',
    };

    if (res.headersSent) return;
    if (n.retryAfterSeconds) res.setHeader('Retry-After', String(n.retryAfterSeconds));
    if (n.status === 429 && !res.getHeader('Retry-After')) {
      // Named throttlers emit "Retry-After-<name>"; expose the standard header too.
      const named = res.getHeaderNames().find((h) => h.startsWith('retry-after-'));
      if (named) res.setHeader('Retry-After', String(res.getHeader(named)));
    }
    res.setHeader('x-correlation-id', correlationId);

    if (req.payloadEncrypted && this.crypto.mode !== 'disabled') {
      res.setHeader('x-appcore-encrypted', '1');
      res.status(n.status).json(this.crypto.encryptResponse(body, correlationId));
      return;
    }
    res.status(n.status).json(body);
  }

  private normalise(exception: unknown): Normalised {
    const translated = translatePrismaError(exception);

    if (translated instanceof AppError) {
      const status = ErrorHttpStatus[translated.code] ?? 500;
      const retry =
        translated.details && !Array.isArray(translated.details)
          ? (translated.details['retryAfterSeconds'] as number | undefined)
          : undefined;
      return {
        status,
        code: translated.code,
        // 5xx messages are always the generic safe message.
        message: status >= 500 ? DefaultErrorMessages[translated.code] : translated.message,
        details: status >= 500 ? undefined : translated.details,
        retryAfterSeconds: retry,
      };
    }

    if (translated instanceof ZodError) {
      const issues: FieldIssue[] = translated.issues.map((i) => ({
        field: i.path.join('.') || '(root)',
        message: i.message,
        code: i.code,
      }));
      return {
        status: 400,
        code: ErrorCode.VALIDATION_FAILED,
        message: DefaultErrorMessages.VALIDATION_FAILED,
        details: issues,
      };
    }

    if (translated instanceof HttpException) {
      const status = translated.getStatus();
      const code = codeForStatus(status);
      // The throttler guard already sets Retry-After on 429 responses.
      return { status, code, message: DefaultErrorMessages[code] };
    }

    // body-parser errors (malformed JSON, too large) arrive as plain errors with a status.
    if (typeof translated === 'object' && translated !== null && 'status' in translated) {
      const status = Number(translated.status);
      if (status >= 400 && status < 500) {
        const code = codeForStatus(status);
        return { status, code, message: DefaultErrorMessages[code] };
      }
    }

    return {
      status: 500,
      code: ErrorCode.INTERNAL_ERROR,
      message: DefaultErrorMessages.INTERNAL_ERROR,
    };
  }
}
