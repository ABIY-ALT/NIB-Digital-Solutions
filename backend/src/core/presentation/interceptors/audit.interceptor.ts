import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { catchError, tap, throwError, type Observable } from 'rxjs';
import { AUDIT_LOGGER, type AuditLogger } from '#core/application/ports/audit-logger.port.js';
import { AppError } from '#core/domain/errors/app-error.js';
import { ErrorCode } from '#core/domain/errors/error-codes.js';
import { AUDIT_KEY, type AuditOptions } from '../decorators/metadata.decorators.js';
import { ApiResult } from '../http/api-response.js';

/**
 * Applies @Audit(...) declaratively: records SUCCESS, FAILURE or DENIED for the
 * endpoint, with actor, resource and correlation id. Business code contains no
 * audit calls.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<AuditOptions | undefined>(AUDIT_KEY, context.getHandler());
    if (!options) return next.handle();
    const req = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      tap((result) => this.write(options, req, result, 'SUCCESS', null)),
      catchError((error: unknown) => {
        const code = error instanceof AppError ? error.code : ErrorCode.INTERNAL_ERROR;
        this.write(
          options,
          req,
          undefined,
          code === ErrorCode.FORBIDDEN ? 'DENIED' : 'FAILURE',
          code,
        );
        return throwError(() => error);
      }),
    );
  }

  private write(
    options: AuditOptions,
    req: Request,
    result: unknown,
    outcome: 'SUCCESS' | 'FAILURE' | 'DENIED',
    errorCode: string | null,
  ): void {
    const data = result instanceof ApiResult ? (result.data as unknown) : result;
    // Maker–checker: the change was only SUBMITTED; the approval records the rest.
    const pendingApproval = result instanceof ApiResult && result.status === 202;
    const defaultId =
      (req.params?.['id'] as string | undefined) ??
      (typeof data === 'object' && data !== null && 'id' in data ? String(data.id) : null);
    let resourceId: string | null = defaultId;
    let metadata: Record<string, unknown> | undefined;
    try {
      resourceId = options.resourceId?.(req, data) ?? defaultId;
      metadata = options.metadata?.(req, data);
    } catch {
      /* never let audit extraction break the request */
    }
    if (pendingApproval) {
      const ticket = data as { approvalId?: string; resourceId?: string | null };
      resourceId = ticket.resourceId ?? resourceId;
      metadata = { ...metadata, approvalId: ticket.approvalId, approval: 'PENDING' };
      if (resourceId === ticket.approvalId) resourceId = null;
    }

    void this.audit.record({
      action: pendingApproval ? `${options.action}_REQUESTED` : options.action,
      category: options.category,
      resourceType: options.resourceType ?? null,
      resourceId,
      outcome,
      errorCode,
      actorId: req.principal?.userId ?? null,
      actorUsername: req.principal?.username ?? options.actorHint?.(req) ?? null,
      metadata: metadata ?? null,
    });
  }
}
