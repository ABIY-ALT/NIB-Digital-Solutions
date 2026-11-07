import { Injectable, Logger, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthenticationError, ForbiddenError } from '#core/domain/errors/app-error.js';
import { IS_PUBLIC_KEY } from '#core/presentation/decorators/metadata.decorators.js';
import { AuthorizationService } from '../application/authorization.service.js';
import {
  ANY_PERMISSION_KEY,
  AUTHENTICATED_ONLY_KEY,
  PERMISSIONS_KEY,
  ROLES_KEY,
} from './authorization.decorators.js';

/**
 * Global guard: every endpoint enforces its permission requirement BEFORE the
 * handler runs. Secure by default — an authenticated endpoint that declares no
 * requirement (@RequirePermissions / @RequireAnyPermission / @RequireRoles /
 * @AuthenticatedOnly) is denied.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly authz: AuthorizationService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const principal = context.switchToHttp().getRequest<Request>().principal;
    if (!principal) throw new AuthenticationError();

    const all = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, targets);
    const any = this.reflector.getAllAndOverride<string[] | undefined>(ANY_PERMISSION_KEY, targets);
    const roles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, targets);
    const authenticatedOnly = this.reflector.getAllAndOverride<boolean>(
      AUTHENTICATED_ONLY_KEY,
      targets,
    );

    if (!all && !any && !roles && !authenticatedOnly) {
      this.logger.error(
        { handler: `${context.getClass().name}.${context.getHandler().name}` },
        'Endpoint has no authorization metadata; denying by default',
      );
      throw new ForbiddenError();
    }

    const allowed =
      (!all || all.every((p) => this.authz.hasPermission(principal, p))) &&
      (!any || any.some((p) => this.authz.hasPermission(principal, p))) &&
      (!roles || roles.some((r) => this.authz.hasRole(principal, r)));

    if (!allowed) {
      this.authz.recordDenial(
        principal,
        [...(all ?? []), ...(any ?? []), ...(roles ?? []).map((r) => `role:${r}`)].join(','),
      );
      throw new ForbiddenError();
    }
    return true;
  }
}
