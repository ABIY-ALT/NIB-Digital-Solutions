import { Inject, Injectable } from '@nestjs/common';
import {
  SESSION_TERMINATOR,
  type SessionTerminator,
} from '#core/application/ports/session-terminator.port.js';
import type { Principal } from '#core/application/security/principal.js';
import type { UseCase } from '#core/application/use-case.js';
import { ConcurrencyError } from '#core/domain/errors/app-error.js';
import { AuthorizationService } from '#modules/authorization/application/authorization.service.js';
import type { User } from '../domain/user.entity.js';
import { USER_REPOSITORY, type UserRepository } from '../domain/user.repository.js';
import { UserPermissions, userResource } from './user-resource.js';

export interface DeleteUserInput {
  principal: Principal;
  id: string;
  version?: number;
}

/** Soft-deletes a user and terminates all of their sessions. */
@Injectable()
export class DeleteUserUseCase implements UseCase<DeleteUserInput, User> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_TERMINATOR) private readonly sessions: SessionTerminator,
    private readonly authz: AuthorizationService,
  ) {}

  async execute({ principal, id, version }: DeleteUserInput): Promise<User> {
    const user = await this.users.getById(id);
    this.authz.assert(principal, UserPermissions.delete, userResource(user));
    if (!user.assertVersion(version)) throw new ConcurrencyError('User', id, version ?? -1);
    const deleted = await this.users.softDelete(user, principal.userId);
    await this.sessions.terminateAllForUser(id, 'user_deleted');
    return deleted;
  }
}
