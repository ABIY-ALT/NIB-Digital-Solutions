import { z } from 'zod';
import { apiRoute, parseWith, readJson } from '@/features/auth/api/api-route';
import type { ApiData } from '@/shared/api';

/**
 * Notification centre BFF routes → NestJS /notifications. The backend scopes
 * every call to the signed-in user (nobody can read someone else's inbox).
 */
const LIST_PARAMS = ['folder', 'category', 'search', 'page', 'pageSize'];
const FOLDERS = ['inbox', 'unread', 'starred', 'archived', 'trash', 'all'] as const;
const ACTIONS = [
  'read',
  'unread',
  'star',
  'unstar',
  'archive',
  'unarchive',
  'trash',
  'restore',
  'delete',
] as const;

export const listNotifications = apiRoute<ApiData<'GET /notifications'>>(
  {},
  async ({ req, api }) => {
    const url = new URL(req.url);
    const query: Record<string, string> = {};
    for (const key of LIST_PARAMS) {
      const value = url.searchParams.get(key);
      if (value) query[key] = value.slice(0, 120);
    }
    const res = await api.get<ApiData<'GET /notifications'>>('/notifications', { query });
    return { data: res.data, meta: res.meta };
  },
);

export const notificationSummary = apiRoute<ApiData<'GET /notifications/summary'>>(
  {},
  async ({ api }) => ({
    data: (await api.get<ApiData<'GET /notifications/summary'>>('/notifications/summary')).data,
  }),
);

export const getNotification = apiRoute<ApiData<'GET /notifications/{id}'>, { id: string }>(
  {},
  async ({ api, params }) => ({
    data: (
      await api.get<ApiData<'GET /notifications/{id}'>>(
        `/notifications/${encodeURIComponent(params.id)}`,
      )
    ).data,
  }),
);

const actionBody = z.union([
  z.object({ action: z.enum(ACTIONS), ids: z.array(z.uuid()).min(1).max(500) }),
  z.object({
    action: z.enum(ACTIONS),
    folder: z.enum(FOLDERS),
    category: z.string().max(32).optional(),
  }),
]);

export const applyNotificationAction = apiRoute<{ affected: number }>({}, async ({ req, api }) => {
  const body = await readJson(req, parseWith(actionBody));
  return { data: (await api.post<{ affected: number }>('/notifications/actions', body)).data };
});

export const getPreferences = apiRoute<ApiData<'GET /notifications/preferences'>>(
  {},
  async ({ api }) => ({
    data: (await api.get<ApiData<'GET /notifications/preferences'>>('/notifications/preferences'))
      .data,
  }),
);

const preferencesBody = z.object({
  preferences: z
    .array(z.object({ category: z.string().max(32), inApp: z.boolean(), email: z.boolean() }))
    .max(20),
});

export const savePreferences = apiRoute<ApiData<'PUT /notifications/preferences'>>(
  {},
  async ({ req, api }) => {
    const body = await readJson(req, parseWith(preferencesBody));
    const res = await api.put<ApiData<'PUT /notifications/preferences'>>(
      '/notifications/preferences',
      body,
    );
    return { data: res.data, message: res.message };
  },
);

const broadcastBody = z.object({
  audience: z.enum(['ALL', 'ROLES']),
  roles: z.array(z.string().max(64)).max(20).optional(),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']),
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(3).max(2000),
  link: z.string().trim().max(300).nullish(),
});

export const broadcast = apiRoute<{ recipients: number }>(
  { requires: { permission: 'notifications:broadcast' } },
  async ({ req, api }) => {
    const body = await readJson(req, parseWith(broadcastBody));
    const res = await api.post<{ recipients: number }>('/notifications/broadcast', body);
    return { data: res.data, message: res.message };
  },
);
