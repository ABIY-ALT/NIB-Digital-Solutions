import { Inject, Injectable } from '@nestjs/common';
import type { Principal } from '#core/application/security/principal.js';
import type { UseCase } from '#core/application/use-case.js';
import { AuthorizationService } from '#modules/authorization/application/authorization.service.js';
import type { User } from '../domain/user.entity.js';
import { USER_REPOSITORY, type UserRepository } from '../domain/user.repository.js';
import { UserPermissions, userResource } from './user-resource.js';

export interface RestoreUserInput {
  principal: Principal;
  id: string;
}

@Injectable()
export class RestoreUserUseCase implements UseCase<RestoreUserInput, User> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly authz: AuthorizationService,
  ) {}

  async execute({ principal, id }: RestoreUserInput): Promise<User> {
    const user = await this.users.getById(id, { includeDeleted: true });
    this.authz.assert(principal, UserPermissions.restore, userResource(user));
    return this.users.restore(user, principal.userId);
  }
}
