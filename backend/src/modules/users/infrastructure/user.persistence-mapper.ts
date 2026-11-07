import { type Prisma } from '#generated/prisma/client.js';
import { PersistenceMapper } from '#core/application/mapper.js';
import { User } from '../domain/user.entity.js';

export const userInclude = {
  roles: {
    include: {
      role: { include: { permissions: { include: { permission: { select: { code: true } } } } } },
    },
  },
} satisfies Prisma.UserInclude;

export type UserRecord = Prisma.UserGetPayload<{ include: typeof userInclude }>;
export type UserWrite = Omit<Prisma.UserUncheckedCreateInput, 'roles'>;

/** Maps between the Prisma `users` row and the User domain entity. */
export class UserPersistenceMapper extends PersistenceMapper<User, UserRecord, UserWrite> {
  toDomain(r: UserRecord): User {
    const roles = r.roles
      .filter((ur) => ur.role.deletedAt === null)
      .map((ur) => ({
        code: ur.role.code,
        name: ur.role.name,
        permissions: ur.role.permissions.map((rp) => rp.permission.code),
      }));
    return User.reconstitute(
      {
        id: r.id,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        createdBy: r.createdBy,
        updatedBy: r.updatedBy,
        version: r.version,
        deletedAt: r.deletedAt,
        deletedBy: r.deletedBy,
      },
      {
        username: r.username,
        email: r.email,
        fullName: r.fullName,
        phoneNumber: r.phoneNumber,
        passwordHash: r.passwordHash,
        status: r.status,
        branchCode: r.branchCode,
        externalSubject: r.externalSubject,
        externalProvider: r.externalProvider,
        mfaEnabled: r.mfaEnabled,
        mfaMethod: r.mfaMethod,
        mfaSecret: r.mfaSecret,
        failedLoginAttempts: r.failedLoginAttempts,
        lockedUntil: r.lockedUntil,
        lastLoginAt: r.lastLoginAt,
        passwordChangedAt: r.passwordChangedAt,
        passwordMustChange: r.passwordMustChange,
        roleCodes: roles.map((x) => x.code),
        roles,
      },
    );
  }

  toPersistence(user: User): UserWrite {
    const s = user.toSnapshot();
    const m = user.metadata;
    return {
      id: m.id,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      createdBy: m.createdBy,
      updatedBy: m.updatedBy,
      version: m.version,
      deletedAt: m.deletedAt,
      deletedBy: m.deletedBy,
      username: s.username,
      email: s.email,
      fullName: s.fullName,
      phoneNumber: s.phoneNumber,
      passwordHash: s.passwordHash,
      status: s.status,
      branchCode: s.branchCode,
      externalSubject: s.externalSubject,
      externalProvider: s.externalProvider,
      mfaEnabled: s.mfaEnabled,
      mfaMethod: s.mfaMethod,
      mfaSecret: s.mfaSecret,
      failedLoginAttempts: s.failedLoginAttempts,
      lockedUntil: s.lockedUntil,
      lastLoginAt: s.lastLoginAt,
      passwordChangedAt: s.passwordChangedAt,
      passwordMustChange: s.passwordMustChange,
    };
  }
}
