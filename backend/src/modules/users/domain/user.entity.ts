import { BaseEntity, type EntityMetadata } from '#core/domain/base.entity.js';
import {
  BusinessRuleError,
  ValidationError,
  type FieldIssue,
} from '#core/domain/errors/app-error.js';
import { compareCodeUnits } from '#core/domain/strings.js';

export type UserStatus = 'ACTIVE' | 'LOCKED' | 'DISABLED' | 'PENDING_ACTIVATION';
export type MfaMethod = 'TOTP' | 'SMS';

/** Role as loaded with the user (read model: code + resolved permissions). */
export interface UserRoleInfo {
  code: string;
  name: string;
  permissions: readonly string[];
}

export interface UserProps {
  username: string;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  passwordHash: string | null;
  status: UserStatus;
  branchCode: string | null;
  externalSubject: string | null;
  externalProvider: string | null;
  mfaEnabled: boolean;
  mfaMethod: MfaMethod | null;
  /** Encrypted at rest; only the MFA provider can decrypt it. */
  mfaSecret: string | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  passwordChangedAt: Date | null;
  /** Must choose a new password at next sign-in (e.g. after an administrator reset). */
  passwordMustChange: boolean;
  roleCodes: string[];
  roles: UserRoleInfo[];
}

export interface CreateUserProps {
  username: string;
  email: string;
  fullName: string;
  phoneNumber?: string | null;
  passwordHash: string | null;
  branchCode?: string | null;
  roleCodes: string[];
  status?: UserStatus;
  /** Temporary password chosen by an administrator. */
  passwordMustChange?: boolean;
}

export type LoginBlock = 'LOCKED' | 'DISABLED' | null;

const USERNAME = /^[a-z0-9][a-z0-9._-]{2,63}$/;
// name@domain.tld; the domain dot is the first one after its first character, so no backtracking.
const EMAIL = /^[^\s@]+@[^\s@][^\s@.]*\.[^\s@]+$/;

/**
 * User aggregate. Pure TypeScript — no framework, ORM or library imports.
 */
export class User extends BaseEntity {
  private constructor(
    meta: EntityMetadata,
    private readonly props: UserProps,
  ) {
    super(meta);
  }

  static create(input: CreateUserProps, actorId: string | null): User {
    const username = input.username.trim().toLowerCase();
    const email = input.email.trim().toLowerCase();
    const issues: FieldIssue[] = [];
    if (!USERNAME.test(username))
      issues.push({ field: 'username', message: 'Invalid username format' });
    if (!EMAIL.test(email)) issues.push({ field: 'email', message: 'Invalid email address' });
    if (input.fullName.trim().length < 2)
      issues.push({ field: 'fullName', message: 'Full name is required' });
    if (input.roleCodes.length === 0)
      issues.push({ field: 'roles', message: 'At least one role is required' });
    if (issues.length) throw new ValidationError(issues);

    const user = new User(BaseEntity.newMetadata(actorId), {
      username,
      email,
      fullName: input.fullName.trim(),
      phoneNumber: input.phoneNumber ?? null,
      passwordHash: input.passwordHash,
      status: input.status ?? 'ACTIVE',
      branchCode: input.branchCode ?? null,
      externalSubject: null,
      externalProvider: null,
      mfaEnabled: false,
      mfaMethod: null,
      mfaSecret: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      passwordChangedAt: input.passwordHash ? new Date() : null,
      passwordMustChange: !!input.passwordHash && (input.passwordMustChange ?? false),
      roleCodes: [...new Set(input.roleCodes)],
      roles: [],
    });
    user.addEvent('user.created', { userId: user.id, username });
    return user;
  }

  static reconstitute(meta: EntityMetadata, props: UserProps): User {
    return new User(meta, props);
  }

  // ── Read accessors ────────────────────────────────────────────────────────
  get username(): string {
    return this.props.username;
  }
  get email(): string {
    return this.props.email;
  }
  get fullName(): string {
    return this.props.fullName;
  }
  get phoneNumber(): string | null {
    return this.props.phoneNumber;
  }
  get passwordHash(): string | null {
    return this.props.passwordHash;
  }
  get status(): UserStatus {
    return this.props.status;
  }
  get branchCode(): string | null {
    return this.props.branchCode;
  }
  get externalSubject(): string | null {
    return this.props.externalSubject;
  }
  get externalProvider(): string | null {
    return this.props.externalProvider;
  }
  get mfaEnabled(): boolean {
    return this.props.mfaEnabled;
  }
  get mfaMethod(): MfaMethod | null {
    return this.props.mfaMethod;
  }
  get mfaSecret(): string | null {
    return this.props.mfaSecret;
  }
  get failedLoginAttempts(): number {
    return this.props.failedLoginAttempts;
  }
  get lockedUntil(): Date | null {
    return this.props.lockedUntil;
  }
  get lastLoginAt(): Date | null {
    return this.props.lastLoginAt;
  }
  get passwordChangedAt(): Date | null {
    return this.props.passwordChangedAt;
  }
  get passwordMustChange(): boolean {
    return this.props.passwordMustChange;
  }
  get roleCodes(): readonly string[] {
    return this.props.roleCodes;
  }
  get roles(): readonly UserRoleInfo[] {
    return this.props.roles;
  }

  /** Union of permissions granted by all roles (RBAC expansion). */
  get permissions(): string[] {
    return [...new Set(this.props.roles.flatMap((r) => r.permissions))].sort(compareCodeUnits);
  }

  /** ABAC attributes exposed to authorization policies and tokens. */
  get attributes(): Record<string, string | null> {
    return { branchCode: this.props.branchCode };
  }

  // ── Authentication rules ──────────────────────────────────────────────────

  loginBlock(now: Date): LoginBlock {
    if (
      this.isDeleted ||
      this.props.status === 'DISABLED' ||
      this.props.status === 'PENDING_ACTIVATION'
    ) {
      return 'DISABLED';
    }
    if (this.props.lockedUntil && this.props.lockedUntil > now) return 'LOCKED';
    if (this.props.status === 'LOCKED' && !this.props.lockedUntil) return 'LOCKED'; // administrative lock
    return null;
  }

  /** Returns true when this failure locked the account. */
  registerFailedLogin(maxAttempts: number, lockoutMinutes: number, now: Date): boolean {
    this.props.failedLoginAttempts += 1;
    let locked = false;
    if (this.props.failedLoginAttempts >= maxAttempts) {
      this.props.status = 'LOCKED';
      this.props.lockedUntil = new Date(now.getTime() + lockoutMinutes * 60_000);
      this.props.failedLoginAttempts = 0;
      locked = true;
      this.addEvent('user.locked', {
        userId: this.id,
        until: this.props.lockedUntil.toISOString(),
      });
    }
    this.touch(null);
    return locked;
  }

  registerSuccessfulLogin(now: Date): void {
    this.props.failedLoginAttempts = 0;
    if (this.props.status === 'LOCKED' && this.props.lockedUntil && this.props.lockedUntil <= now) {
      this.props.status = 'ACTIVE';
    }
    this.props.lockedUntil = null;
    this.props.lastLoginAt = now;
    this.touch(this.id);
  }

  /**
   * Sets a new password hash. `mustChange` marks it temporary (administrator
   * reset): the user must replace it at the next sign-in.
   */
  replacePasswordHash(
    hash: string,
    actorId: string | null,
    options: { mustChange?: boolean; preserveChangedAt?: boolean } = {},
  ): void {
    this.props.passwordHash = hash;
    if (!options.preserveChangedAt) this.props.passwordChangedAt = new Date();
    this.props.passwordMustChange = options.mustChange ?? false;
    this.touch(actorId);
  }

  /** When the password expires under a max-age policy (null = never / no password). */
  passwordExpiresAt(maxAgeDays: number): Date | null {
    if (!this.props.passwordHash || maxAgeDays <= 0) return null;
    const changed = this.props.passwordChangedAt ?? this.createdAt;
    return new Date(changed.getTime() + maxAgeDays * 86_400_000);
  }

  /** Why the user must set a new password before getting a session (null = no need). */
  passwordChangeReason(maxAgeDays: number, now: Date): 'RESET' | 'EXPIRED' | null {
    if (!this.props.passwordHash) return null;
    if (this.props.passwordMustChange) return 'RESET';
    const expiresAt = this.passwordExpiresAt(maxAgeDays);
    return expiresAt && expiresAt <= now ? 'EXPIRED' : null;
  }

  // ── Administration ────────────────────────────────────────────────────────

  updateProfile(
    changes: Partial<Pick<UserProps, 'fullName' | 'email' | 'phoneNumber' | 'branchCode'>>,
    actorId: string | null,
  ): void {
    if (changes.fullName !== undefined) {
      if (changes.fullName.trim().length < 2)
        throw new ValidationError([{ field: 'fullName', message: 'Full name is required' }]);
      this.props.fullName = changes.fullName.trim();
    }
    if (changes.email !== undefined) {
      const email = changes.email.trim().toLowerCase();
      if (!EMAIL.test(email))
        throw new ValidationError([{ field: 'email', message: 'Invalid email address' }]);
      this.props.email = email;
    }
    if (changes.phoneNumber !== undefined) this.props.phoneNumber = changes.phoneNumber;
    if (changes.branchCode !== undefined) this.props.branchCode = changes.branchCode;
    this.touch(actorId);
  }

  assignRoles(roleCodes: string[], actorId: string | null): void {
    if (roleCodes.length === 0)
      throw new ValidationError([{ field: 'roles', message: 'At least one role is required' }]);
    this.props.roleCodes = [...new Set(roleCodes)];
    this.touch(actorId);
  }

  changeStatus(status: UserStatus, actorId: string | null): void {
    if (actorId === this.id && status !== 'ACTIVE') {
      throw new BusinessRuleError(
        'You cannot deactivate or lock your own account.',
        'SELF_DEACTIVATION',
      );
    }
    this.props.status = status;
    if (status === 'ACTIVE') {
      this.props.lockedUntil = null;
      this.props.failedLoginAttempts = 0;
    }
    this.touch(actorId);
  }

  linkExternalIdentity(provider: string, subject: string, actorId: string | null): void {
    this.props.externalProvider = provider;
    this.props.externalSubject = subject;
    this.touch(actorId);
  }

  enableMfa(method: MfaMethod, encryptedSecret: string | null, actorId: string | null): void {
    this.props.mfaEnabled = true;
    this.props.mfaMethod = method;
    this.props.mfaSecret = encryptedSecret;
    this.touch(actorId);
  }

  disableMfa(actorId: string | null): void {
    this.props.mfaEnabled = false;
    this.props.mfaMethod = null;
    this.props.mfaSecret = null;
    this.touch(actorId);
  }

  override softDelete(actorId: string | null): void {
    if (actorId === this.id)
      throw new BusinessRuleError('You cannot delete your own account.', 'SELF_DELETE');
    super.softDelete(actorId);
  }

  /** Snapshot for mappers (persistence only). */
  toSnapshot(): Readonly<UserProps> {
    return { ...this.props, roleCodes: [...this.props.roleCodes], roles: [...this.props.roles] };
  }
}
