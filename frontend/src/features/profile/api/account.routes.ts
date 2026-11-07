import { cookies } from 'next/headers';
import { z } from 'zod';
import { apiRoute, readJson, validationError } from '@/features/auth/api/api-route';
import { passwordPolicy } from '@/features/users/schemas';
import type { ApiData } from '@/shared/api';
import { PREFERENCES_COOKIE, preferencesSchema, type Preferences } from '../preferences';
import type { AccountSession, TotpSetup } from '../types';

/**
 * Account self-service API routes (Next.js BFF) → NestJS /account/*.
 * Every route acts on the signed-in user only.
 */
const parse =
  <T>(schema: z.ZodType<T>) =>
  (value: unknown): T => {
    const r = schema.safeParse(value);
    if (!r.success) throw validationError(r.error.issues);
    return r.data;
  };

export const listSessions = apiRoute<AccountSession[]>({}, async ({ api }) => ({
  data: (await api.get<AccountSession[]>('/account/sessions')).data,
}));

export const revokeSession = apiRoute<null, { id: string }>({}, async ({ api, params }) => {
  await api.delete(`/account/sessions/${encodeURIComponent(params.id)}`);
  return { data: null, message: 'Session ended.' };
});

export const revokeOtherSessions = apiRoute<{ terminated: number }>({}, async ({ api }) => ({
  data: (await api.post<{ terminated: number }>('/account/sessions/revoke-others')).data,
}));

const passwordBody = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: passwordPolicy(),
});

export const changePassword = apiRoute<{ terminatedSessions: number }>({}, async ({ req, api }) => {
  const body = await readJson(req, parse(passwordBody));
  return {
    data: (await api.post<{ terminatedSessions: number }>('/account/password', body)).data,
    message: 'Password changed.',
  };
});

export const beginTotpSetup = apiRoute<TotpSetup>({}, async ({ api }) => ({
  data: (await api.post<TotpSetup>('/account/mfa/totp/setup')).data,
}));

const codeBody = z.object({ code: z.string().regex(/^\d{6}$/) });

export const confirmTotpSetup = apiRoute<null>({}, async ({ req, api }) => {
  const body = await readJson(req, parse(codeBody));
  await api.post('/account/mfa/totp/confirm', body);
  return { data: null, message: 'Two-step verification enabled.' };
});

const disableBody = z.object({ password: z.string().min(1).max(256) });

export const disableMfa = apiRoute<null>({}, async ({ req, api }) => {
  const body = await readJson(req, parse(disableBody));
  await api.post('/account/mfa/disable', body);
  return { data: null, message: 'Two-step verification disabled.' };
});

/** GET /api/account/activity?cursor=&limit= — my own activity timeline. */
export const myActivity = apiRoute<ApiData<'GET /account/activity'>>({}, async ({ req, api }) => {
  const url = new URL(req.url);
  const query: Record<string, string> = {};
  const cursor = url.searchParams.get('cursor');
  const limit = url.searchParams.get('limit');
  if (cursor && /^\d{1,19}$/.test(cursor)) query['cursor'] = cursor;
  if (limit && /^\d{1,2}$/.test(limit)) query['limit'] = limit;
  return {
    data: (await api.get<ApiData<'GET /account/activity'>>('/account/activity', { query })).data,
  };
});

/** GET /api/account/activity/summary — my 30-day figures. */
export const myActivitySummary = apiRoute<ApiData<'GET /account/activity/summary'>>(
  {},
  async ({ api }) => ({
    data: (await api.get<ApiData<'GET /account/activity/summary'>>('/account/activity/summary'))
      .data,
  }),
);

/** UI preferences (density, text size) — a non-sensitive cookie read by the root layout. */
export const savePreferences = apiRoute<Preferences>({}, async ({ req }) => {
  const prefs = await readJson(req, parse(preferencesSchema));
  (await cookies()).set(PREFERENCES_COOKIE, JSON.stringify(prefs), {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });
  return { data: prefs, message: 'Preferences saved.' };
});
