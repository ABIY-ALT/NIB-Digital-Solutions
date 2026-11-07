import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { ProfileView } from '@/features/profile/components/profile-view';
import { parsePreferences, PREFERENCES_COOKIE } from '@/features/profile/preferences';
import { appConfig } from '@/infrastructure/config/app.config';

export const metadata: Metadata = { title: 'My profile' };

export default async function Page() {
  const prefs = parsePreferences((await cookies()).get(PREFERENCES_COOKIE)?.value);
  const { theme, i18n, ui } = appConfig;
  return (
    <ProfileView
      preferences={{
        density: prefs.density ?? theme.density,
        fontScale: prefs.fontScale ?? theme.font.scale,
        formSurface: (ui.forms.userChoice && prefs.formSurface) || ui.forms.surface,
        formSurfaceChoice: ui.forms.userChoice,
        locales: i18n.locales.map((code) => ({ code, label: i18n.localeLabels[code] ?? code })),
      }}
    />
  );
}
