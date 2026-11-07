import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});

export const mfaSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});
