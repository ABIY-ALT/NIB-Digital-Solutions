import { z } from 'zod';
import type { PasswordRulesConfig } from '@/shared/lib/password-rules';

/**
 * Validation shared by the form (client) and the BFF route (server).
 * `t` supplies translated messages; the server passes an identity function.
 */
type T = (key: string) => string;
const id: T = (k) => k;

/**
 * Password field schema. With `rules` (the backend policy, in forms) the
 * composition rules give instant feedback; without (BFF) only transport bounds
 * apply — the backend enforces the configurable policy for every entry point.
 */
export const passwordPolicy = (t: T = id, rules?: PasswordRulesConfig) => {
  if (!rules) return z.string().min(1, t('validation.passwordLength')).max(256);
  let schema = z.string().min(rules.minLength, t('validation.passwordLength')).max(rules.maxLength);
  if (rules.requireLowercase) schema = schema.regex(/[a-z]/, t('validation.passwordLower'));
  if (rules.requireUppercase) schema = schema.regex(/[A-Z]/, t('validation.passwordUpper'));
  if (rules.requireDigit) schema = schema.regex(/\d/, t('validation.passwordDigit'));
  if (rules.requireSymbol) schema = schema.regex(/[^A-Za-z0-9]/, t('validation.passwordSymbol'));
  return schema;
};

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullish();

export const createUserSchema = (t: T = id, rules?: PasswordRulesConfig) =>
  z.object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9._-]{2,63}$/, t('validation.username')),
    email: z.email(t('validation.email')).max(254),
    fullName: z.string().trim().min(2, t('validation.fullName')).max(160),
    phoneNumber: optionalText.refine((v) => !v || /^\+?\d{7,15}$/.test(v), t('validation.phone')),
    password: passwordPolicy(t, rules),
    branchCode: optionalText,
    roles: z.array(z.string()).min(1, t('validation.roles')),
  });

/**
 * The "new user" FORM: the API schema plus a password confirmation. The
 * confirmation never leaves the browser (strip it before submitting); the BFF
 * and the backend validate `createUserSchema`.
 */
export const createUserFormSchema = (t: T = id, rules?: PasswordRulesConfig) =>
  createUserSchema(t, rules)
    .extend({ confirmPassword: z.string().min(1, t('validation.confirmPassword')) })
    .refine((v) => v.password === v.confirmPassword, {
      path: ['confirmPassword'],
      message: t('validation.passwordMismatch'),
    });

export const updateUserSchema = (t: T = id) =>
  z.object({
    version: z.number().int().min(1),
    fullName: z.string().trim().min(2, t('validation.fullName')).max(160),
    email: z.email(t('validation.email')).max(254),
    phoneNumber: optionalText.refine((v) => !v || /^\+?\d{7,15}$/.test(v), t('validation.phone')),
    branchCode: optionalText,
    status: z.enum(['ACTIVE', 'LOCKED', 'DISABLED']),
    roles: z.array(z.string()).min(1, t('validation.roles')),
  });

export type CreateUserInput = z.input<ReturnType<typeof createUserSchema>>;
export type CreateUserValues = z.output<ReturnType<typeof createUserSchema>>;
export type CreateUserFormInput = z.input<ReturnType<typeof createUserFormSchema>>;
export type CreateUserFormValues = z.output<ReturnType<typeof createUserFormSchema>>;
export type UpdateUserInput = z.input<ReturnType<typeof updateUserSchema>>;
export type UpdateUserValues = z.output<ReturnType<typeof updateUserSchema>>;

/**
 * One CSV row of the bulk user import. Roles are written "USER;ADMIN" (also `,` `|` or spaces).
 * No password column: the BFF generates a strong random one — issue credentials with
 * "Reset password" (or let users sign in through SSO).
 */
export const importUserSchema = (t: T = id) =>
  createUserSchema(t)
    .omit({ password: true, roles: true })
    .extend({
      roles: z
        .string()
        .trim()
        .min(1, t('validation.roles'))
        .transform((v) => [
          ...new Set(
            v
              .split(/[;|,\s]+/)
              .filter(Boolean)
              .map((r) => r.toUpperCase()),
          ),
        ]),
    });
export type ImportUserValues = z.output<ReturnType<typeof importUserSchema>>;
