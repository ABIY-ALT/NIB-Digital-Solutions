import { Inject, Injectable } from '@nestjs/common';
import type { Principal } from '#core/application/security/principal.js';
import type { UseCase } from '#core/application/use-case.js';
import { AuthorizationService } from '#modules/authorization/application/authorization.service.js';
import type { User } from '../domain/user.entity.js';
import { USER_REPOSITORY, type UserRepository } from '../domain/user.repository.js';
import { UserPermissions, userResource } from './user-resource.js';

export interface GetUserInput {
  principal: Principal;
  id: string;
  includeDeleted?: boolean;
}

@Injectable()
export class GetUserUseCase implements UseCase<GetUserInput, User> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly authz: AuthorizationService,
  ) {}

  async execute({ principal, id, includeDeleted }: GetUserInput): Promise<User> {
    const user = await this.users.getById(id, { includeDeleted });
    // ABAC: users:read (any), users:read:branch (same branch) or users:read:own (self).
    this.authz.assert(principal, UserPermissions.read, userResource(user));
    return user;
  }
}
