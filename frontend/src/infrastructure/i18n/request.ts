import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { appConfig } from '@/infrastructure/config/app.config';
import { loadMessages } from './messages';

export const LOCALE_COOKIE = 'NEXT_LOCALE';

/** Resolves the locale from the user's preference cookie (no locale in the URL). */
export async function resolveLocale(): Promise<string> {
  const preferred = (await cookies()).get(LOCALE_COOKIE)?.value;
  return preferred && appConfig.i18n.locales.includes(preferred)
    ? preferred
    : appConfig.i18n.defaultLocale;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    messages: await loadMessages(locale),
    timeZone: 'Africa/Addis_Ababa',
  };
});
