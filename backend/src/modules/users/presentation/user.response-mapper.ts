import { z } from 'zod';
import { ResponseMapper } from '#core/application/mapper.js';
import {
  apiSchema,
  isoDateTime,
  nullableIsoDateTime,
  type ApiDto,
} from '#core/presentation/openapi/api-schema.js';
import type { SecurityPolicy } from '../domain/password-policy.js';
import type { User } from '../domain/user.entity.js';

const userShape = {
  id: z.uuid(),
  username: z.string(),
  email: z.string(),
  fullName: z.string(),
  phoneNumber: z.string().nullable(),
  status: z.enum(['ACTIVE', 'LOCKED', 'DISABLED', 'PENDING_ACTIVATION']),
  branchCode: z.string().nullable(),
  mfaEnabled: z.boolean(),
  roles: z.array(z.string()),
  lastLoginAt: nullableIsoDateTime(),
  createdAt: isoDateTime(),
  updatedAt: isoDateTime(),
  version: z.int(),
  deletedAt: nullableIsoDateTime(),
};

/** Public representation of a user. Never includes password hashes or MFA secrets. */
export const UserDtoSchema = apiSchema('User', z.object(userShape));
export type UserDto = ApiDto<typeof UserDtoSchema>;

/** The signed-in user: effective permissions plus account-security status. */
export const UserProfileDtoSchema = apiSchema(
  'UserProfile',
  z.object({
    ...userShape,
    permissions: z.array(z.string()),
    mfaMethod: z.string().nullable(),
    passwordChangedAt: nullableIsoDateTime(),
    /** Null when passwords do not expire (or the account signs in externally). */
    passwordExpiresAt: nullableIsoDateTime(),
    /** The user holds a role that requires two-step verification but has not enrolled. */
    mfaRequired: z.boolean(),
  }),
);
export type UserProfileDto = ApiDto<typeof UserProfileDtoSchema>;

export class UserResponseMapper extends ResponseMapper<User, UserDto> {
  toDto(u: User): UserDto {
    return {
      id: u.id,
      username: u.username,
      email: u.email,
      fullName: u.fullName,
      phoneNumber: u.phoneNumber,
      status: u.status,
      branchCode: u.branchCode,
      mfaEnabled: u.mfaEnabled,
      roles: [...u.roleCodes],
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
      version: u.version,
      deletedAt: u.deletedAt?.toISOString() ?? null,
    };
  }

  toProfile(u: User, policy?: SecurityPolicy): UserProfileDto {
    const requiredRoles = policy?.mfa.requiredRoles ?? [];
    return {
      ...this.toDto(u),
      permissions: u.permissions,
      mfaMethod: u.mfaMethod,
      passwordChangedAt: u.passwordChangedAt?.toISOString() ?? null,
      passwordExpiresAt:
        u.passwordExpiresAt(policy?.password.maxAgeDays ?? 0)?.toISOString() ?? null,
      mfaRequired: !u.mfaEnabled && u.roleCodes.some((r) => requiredRoles.includes(r)),
    };
  }
}

export const userResponseMapper = new UserResponseMapper();
