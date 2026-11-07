import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Principal } from '#core/application/security/principal.js';
import { AuthenticationError } from '#core/domain/errors/app-error.js';

/** Injects the authenticated Principal (throws if the route is unauthenticated). */
export const CurrentPrincipal = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Principal => {
    const principal = ctx.switchToHttp().getRequest<Request>().principal;
    if (!principal) throw new AuthenticationError();
    return principal;
  },
);
