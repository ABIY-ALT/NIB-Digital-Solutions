import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthenticationError } from '#core/domain/errors/app-error.js';
import { RequestContext } from '#core/infrastructure/context/request-context.js';
import { IS_PUBLIC_KEY } from '#core/presentation/decorators/metadata.decorators.js';
import { ValidateAccessTokenUseCase } from '../application/use-cases/validate-access-token.use-case.js';

/**
 * Global authentication guard. Every endpoint requires a valid bearer token
 * unless it is marked @Public().
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly validate: ValidateAccessTokenUseCase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new AuthenticationError();

    const principal = await this.validate.execute(header.slice(7).trim());
    req.principal = principal;
    RequestContext.setPrincipal(principal);
    return true;
  }
}
