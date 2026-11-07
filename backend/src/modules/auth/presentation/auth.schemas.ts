import { z } from 'zod';

export const LoginSchema = z.strictObject({
  username: z.string().trim().toLowerCase().min(1).max(64),
  password: z.string().min(1).max(256),
});
export type LoginBody = z.infer<typeof LoginSchema>;

export const VerifyMfaSchema = z.strictObject({
  challengeId: z.uuid(),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Code must be 6 digits'),
});
export type VerifyMfaBody = z.infer<typeof VerifyMfaSchema>;

export const CompletePasswordChangeSchema = z.strictObject({
  changeToken: z.uuid(),
  newPassword: z.string().min(1).max(256),
});
export type CompletePasswordChangeBody = z.infer<typeof CompletePasswordChangeSchema>;

export const ForgotPasswordSchema = z.strictObject({
  /** Username or e-mail address. */
  identifier: z.string().trim().toLowerCase().min(1).max(254),
});
export type ForgotPasswordBody = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.strictObject({
  token: z.string().min(20).max(128),
  newPassword: z.string().min(1).max(256),
});
export type ResetPasswordBody = z.infer<typeof ResetPasswordSchema>;

export const RefreshSchema = z.strictObject({
  refreshToken: z.string().min(20).max(512),
});
export type RefreshBody = z.infer<typeof RefreshSchema>;

export const ExchangeSchema = z.strictObject({
  provider: z.string().trim().min(1).max(64),
  token: z.string().min(20).max(8192),
});
export type ExchangeBody = z.infer<typeof ExchangeSchema>;

export const LogoutSchema = z
  .strictObject({
    allSessions: z.boolean().optional(),
  })
  .optional()
  .default({});
export type LogoutBody = z.infer<typeof LogoutSchema>;
