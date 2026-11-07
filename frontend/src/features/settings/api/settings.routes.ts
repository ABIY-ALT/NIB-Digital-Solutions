import { z } from 'zod';
import { apiRoute, parseWith, readJson } from '@/features/auth/api/api-route';
import type { ApiData } from '@/shared/api';

/**
 * Runtime settings (Next.js API → NestJS /settings).
 *
 *   GET   /api/settings          every setting with its definition (settings:read)
 *   PATCH /api/settings          change values (settings:manage)
 *   GET   /api/settings/public   branding and formats, for every signed-in user
 */
export const listSettings = apiRoute<ApiData<'GET /settings'>>(
  { requires: { permission: 'settings:read' } },
  async ({ api }) => ({ data: (await api.get<ApiData<'GET /settings'>>('/settings')).data }),
);

const updateBody = z.object({
  values: z.record(
    z.string().max(100),
    z.union([z.string().max(300_000), z.number(), z.boolean(), z.null()]),
  ),
});

export const updateSettings = apiRoute<ApiData<'PATCH /settings'>>(
  { requires: { permission: 'settings:manage' } },
  async ({ req, api }) => {
    const body = await readJson(req, parseWith(updateBody));
    const res = await api.patch<ApiData<'PATCH /settings'>>('/settings', body);
    return { data: res.data, message: res.message };
  },
);

export const publicSettings = apiRoute<ApiData<'GET /settings/public'>>({}, async ({ api }) => ({
  data: (await api.get<ApiData<'GET /settings/public'>>('/settings/public')).data,
}));
