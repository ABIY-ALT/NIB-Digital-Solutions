import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import type { Request } from 'express';

export const CHANGE_REASON_HEADER = 'x-change-reason';

/**
 * The maker's justification for a change (URI-encoded `X-Change-Reason`
 * header), shown to the checker when the change needs approval. Kept out of
 * the request body so body schemas stay identical with or without approval.
 */
export const ChangeReason = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const raw = ctx.switchToHttp().getRequest<Request>().headers[CHANGE_REASON_HEADER];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) return null;
    try {
      return decodeURIComponent(value).trim().slice(0, 1000) || null;
    } catch {
      return null;
    }
  },
);

export const ApiChangeReason = (): MethodDecorator =>
  ApiHeader({
    name: 'X-Change-Reason',
    required: false,
    description: 'URI-encoded justification shown to the checker when the change needs approval.',
  });
