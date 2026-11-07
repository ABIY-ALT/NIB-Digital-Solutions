import { Inject, Injectable } from '@nestjs/common';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '#core/application/ports/password-hasher.port.js';
import { ValidationError } from '#core/domain/errors/app-error.js';
import {
  evaluatePassword,
  type PasswordViolation,
  type SecurityPolicy,
} from '../domain/password-policy.js';
import type { User } from '../domain/user.entity.js';
import { PASSWORD_HISTORY, type PasswordHistoryRepository } from '../domain/user.repository.js';

export const SECURITY_POLICY = Symbol('SecurityPolicy');

/**
 * Enforces the account security policy whenever a password is set (creation,
 * self-service change, forced change at sign-in, administrator reset):
 * composition rules, personal information, common passwords, reuse of the
 * last N passwords and minimum age. Violations become field-level
 * VALIDATION_FAILED issues (code = rule id) so forms show them inline.
 */
@Injectable()
export class PasswordPolicyService {
  constructor(
    @Inject(SECURITY_POLICY) readonly policy: SecurityPolicy,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(PASSWORD_HISTORY) private readonly history: PasswordHistoryRepository,
  ) {}

  /** Throws VALIDATION_FAILED listing every broken rule. */
  async assertAcceptable(
    password: string,
    field: string,
    subject: { username: string; email: string; fullName: string },
    user?: User,
    options: { enforceMinAge?: boolean } = {},
  ): Promise<void> {
    const violations: PasswordViolation[] = evaluatePassword(
      password,
      this.policy.password,
      subject,
    );
    if (user) violations.push(...(await this.reuseViolations(user, password)));
    if (user && options.enforceMinAge) {
      const minAgeMs = this.policy.password.minAgeHours * 3_600_000;
      const changed = user.passwordChangedAt;
      if (
        minAgeMs > 0 &&
        changed &&
        Date.now() - changed.getTime() < minAgeMs &&
        !user.passwordMustChange
      ) {
        violations.push({
          rule: 'MIN_AGE',
          message: `Passwords can be changed once every ${this.policy.password.minAgeHours} hours`,
        });
      }
    }
    if (violations.length) {
      throw new ValidationError(
        violations.map((v) => ({ field, message: v.message, code: v.rule })),
        'The password does not meet the security policy.',
      );
    }
  }

  /** Stores the outgoing hash in the history and trims it to the policy size. */
  async remember(user: User, outgoingHash: string | null): Promise<void> {
    const keep = this.policy.password.historyCount;
    if (!outgoingHash || keep <= 0) return;
    await this.history.add(user.id, outgoingHash);
    await this.history.prune(user.id, keep);
  }

  private async reuseViolations(user: User, password: string): Promise<PasswordViolation[]> {
    const hashes = [
      ...(user.passwordHash ? [user.passwordHash] : []),
      ...(await this.history.recent(user.id, this.policy.password.historyCount)),
    ];
    for (const hash of hashes) {
      if (await this.hasher.verify(hash, password)) {
        const n = this.policy.password.historyCount;
        return [
          {
            rule: 'NOT_REUSED',
            message: n
              ? `Must differ from your last ${n + 1} passwords`
              : 'Must differ from your current password',
          },
        ];
      }
    }
    return [];
  }
}
