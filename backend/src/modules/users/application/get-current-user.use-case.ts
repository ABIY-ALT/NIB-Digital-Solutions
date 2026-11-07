import { Inject, Injectable } from '@nestjs/common';
import type { Principal } from '#core/application/security/principal.js';
import type { UseCase } from '#core/application/use-case.js';
import type { User } from '../domain/user.entity.js';
import { USER_REPOSITORY, type UserRepository } from '../domain/user.repository.js';

/** Returns the caller's own profile. Needs no permission beyond authentication. */
@Injectable()
export class GetCurrentUserUseCase implements UseCase<Principal, User> {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  execute(principal: Principal): Promise<User> {
    return this.users.getById(principal.userId);
  }
}
