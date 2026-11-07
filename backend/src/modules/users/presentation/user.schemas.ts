import { z } from 'zod';

/**
 * Request contracts for the users API (validated before any processing and
 * reused to generate the OpenAPI documentation).
 */
/**
 * Transport bounds only. The configurable account security policy (length,
 * composition, history, personal info, common passwords) is enforced by
 * PasswordPolicyService so every entry point applies the same rules.
 */
export const PASSWORD_POLICY = z.string().min(1).max(256);

const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{2,63}$/, 'Letters, digits, dot, dash, underscore (3–64)');
const phone = z
  .string()
  .trim()
  .regex(/^\+?\d{7,15}$/, 'Invalid phone number');
const branch = z.string().trim().min(1).max(16);
const roles = z.array(z.string().trim().min(1).max(64)).min(1).max(20);

export const CreateUserSchema = z.strictObject({
  username,
  email: z.email().max(254),
  fullName: z.string().trim().min(2).max(160),
  phoneNumber: phone.nullish(),
  password: PASSWORD_POLICY,
  branchCode: branch.nullish(),
  roles,
});
export type CreateUserBody = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z
  .strictObject({
    version: z.int().min(1),
    fullName: z.string().trim().min(2).max(160).optional(),
    email: z.email().max(254).optional(),
    phoneNumber: phone.nullish(),
    branchCode: branch.nullish(),
    status: z.enum(['ACTIVE', 'LOCKED', 'DISABLED']).optional(),
    roles: roles.optional(),
  })
  .refine((v) => Object.keys(v).length > 1, { message: 'Nothing to update' });
export type UpdateUserBody = z.infer<typeof UpdateUserSchema>;

/** Self-service: display name and phone only (e-mail changes need verification). */
export const UpdateMyProfileSchema = z
  .strictObject({
    version: z.int().min(1),
    fullName: z.string().trim().min(2).max(160).optional(),
    phoneNumber: phone.nullish(),
  })
  .refine((v) => Object.keys(v).length > 1, { message: 'Nothing to update' });
export type UpdateMyProfileBody = z.infer<typeof UpdateMyProfileSchema>;

export const UserIdParamSchema = z.uuid();

export const VersionQuerySchema = z.object({ version: z.coerce.number().int().min(1).optional() });

export const ResetPasswordSchema = z.strictObject({ newPassword: PASSWORD_POLICY });
