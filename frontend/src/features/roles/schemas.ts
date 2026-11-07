import { z } from 'zod';

/**
 * One CSV row of the role import (BFF validation + client preview).
 * Permissions are written "users:read;audit:read" (also `,` `|` or spaces).
 */
export const importRoleSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z][A-Z0-9_]{1,63}$/,
      'Use 2–64 uppercase letters, digits or underscores, starting with a letter.',
    ),
  name: z.string().trim().min(2).max(120),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null),
  permissions: z
    .string()
    .trim()
    .default('')
    .transform((v) => [...new Set(v.split(/[;|,\s]+/).filter(Boolean))]),
});
export type ImportRoleValues = z.output<typeof importRoleSchema>;
