import { z } from 'zod';
import { apiRoute, parseWith, readJson } from '@/features/auth/api/api-route';
import type { UserProfile } from '@/shared/types';

/** GET /api/profile → NestJS GET /users/me */
export const getProfile = apiRoute<UserProfile>({}, async ({ api }) => ({
  data: (await api.get<UserProfile>('/users/me')).data,
}));

const updateBody = z.strictObject({
  version: z.number().int().min(1),
  fullName: z.string().trim().min(2).max(160).optional(),
  phoneNumber: z
    .string()
    .trim()
    .regex(/^\+?\d{7,15}$/)
    .nullish(),
});

/** PATCH /api/profile → NestJS PATCH /users/me (display name and phone only). */
export const updateProfile = apiRoute<UserProfile>({}, async ({ req, api }) => {
  const body = await readJson(req, parseWith(updateBody));
  const res = await api.patch<UserProfile>('/users/me', body);
  return { data: res.data, message: res.message };
});
