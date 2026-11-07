import { cookies } from 'next/headers';
import { z } from 'zod';
import { publicApiRoute, readJson, validationError } from '@/features/auth/api/api-route';
import { appConfig } from '@/infrastructure/config/app.config';
import { LOCALE_COOKIE } from '@/infrastructure/i18n/request';

const body = z.object({ locale: z.string().refine((l) => appConfig.i18n.locales.includes(l)) });

/** POST /api/locale — persists the user's language preference. */
export const setLocale = publicApiRoute<{ locale: string }>(async ({ req }) => {
  const { locale } = await readJson(req, (v) => {
    const r = body.safeParse(v);
    if (!r.success) throw validationError(r.error.issues);
    return r.data;
  });
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  return { data: { locale } };
});
