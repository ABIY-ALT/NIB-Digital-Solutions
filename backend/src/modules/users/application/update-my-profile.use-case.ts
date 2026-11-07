import { Inject, Injectable } from '@nestjs/common';
import type { Principal } from '#core/application/security/principal.js';
import { ConcurrencyError } from '#core/domain/errors/app-error.js';
import type { User } from '../domain/user.entity.js';
import { USER_REPOSITORY, type UserRepository } from '../domain/user.repository.js';

export interface UpdateMyProfileInput {
  version: number;
  fullName?: string;
  phoneNumber?: string | null;
}

/**
 * Self-service profile update: the signed-in user may correct their display
 * name and phone number. E-mail (needs verification), branch, roles and status
 * stay with administrators (and maker–checker where configured).
 */
@Injectable()
export class UpdateMyProfileUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  async execute(principal: Principal, input: UpdateMyProfileInput): Promise<User> {
    const user = await this.users.getById(principal.userId);
    if (user.version !== input.version) {
      throw new ConcurrencyError('User', user.id, input.version);
    }
    user.updateProfile(
      {
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.phoneNumber !== undefined ? { phoneNumber: input.phoneNumber } : {}),
      },
      principal.userId,
    );
    return this.users.update(user);
  }
}
