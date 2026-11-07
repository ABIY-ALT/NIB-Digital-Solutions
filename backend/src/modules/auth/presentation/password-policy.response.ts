import { z } from 'zod';
import { apiSchema, type ApiDto } from '#core/presentation/openapi/api-schema.js';
import type { SecurityPolicy } from '#modules/users/domain/password-policy.js';

/** Public (pre-authentication) view of the password rules. */
export const PasswordPolicyDto = apiSchema(
  'PasswordPolicy',
  z.object({
    minLength: z.int(),
    maxLength: z.int(),
    requireUppercase: z.boolean(),
    requireLowercase: z.boolean(),
    requireDigit: z.boolean(),
    requireSymbol: z.boolean(),
    historyCount: z.int(),
    maxAgeDays: z.int(),
    minAgeHours: z.int(),
    expiryWarningDays: z.int(),
    disallowPersonalInfo: z.boolean(),
    disallowCommon: z.boolean(),
  }),
);
export type PasswordPolicyDto = ApiDto<typeof PasswordPolicyDto>;

export const toPasswordPolicyDto = ({ password: p }: SecurityPolicy): PasswordPolicyDto => ({
  minLength: p.minLength,
  maxLength: p.maxLength,
  requireUppercase: p.requireUppercase,
  requireLowercase: p.requireLowercase,
  requireDigit: p.requireDigit,
  requireSymbol: p.requireSymbol,
  historyCount: p.historyCount,
  maxAgeDays: p.maxAgeDays,
  minAgeHours: p.minAgeHours,
  expiryWarningDays: p.expiryWarningDays,
  disallowPersonalInfo: true,
  disallowCommon: true,
});
