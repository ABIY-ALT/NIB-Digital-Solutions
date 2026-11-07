import { Inject, Injectable } from '@nestjs/common';
import type { Principal } from '#core/application/security/principal.js';
import type { UseCase } from '#core/application/use-case.js';
import type { Page, PageRequest } from '#core/domain/pagination.js';
import { AuthorizationService } from '#modules/authorization/application/authorization.service.js';
import type { User } from '../domain/user.entity.js';
import { USER_REPOSITORY, type UserRepository } from '../domain/user.repository.js';
import { UserPermissions } from './user-resource.js';

export interface ListUsersInput {
  principal: Principal;
  request: PageRequest;
  includeDeleted?: boolean;
}

/**
 * Paginated user listing. The caller only ever sees rows their grant covers:
 * global readers see everyone, branch-scoped readers their branch, self-scoped
 * readers only themselves.
 */
@Injectable()
export class ListUsersUseCase implements UseCase<ListUsersInput, Page<User>> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly authz: AuthorizationService,
  ) {}

  execute({ principal, request }: ListUsersInput): Promise<Page<User>> {
    const constraint = this.authz.listConstraint(principal, UserPermissions.read);
    return this.users.findPageConstrained(
      request,
      constraint.kind === 'all' ? null : constraint.constraints,
    );
  }
}
