import type { Metadata, Viewport } from 'next';
import { Noto_Sans_Ethiopic } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { cookies, headers } from 'next/headers';
import { getLocale } from 'next-intl/server';
import { Suspense, type ReactNode } from 'react';
import { isFeatureEnabled, isRtl } from '@/infrastructure/config/app-config.schema';
import { appConfig } from '@/infrastructure/config/app.config';
import { DARK_BACKGROUND, themeToCss } from '@/infrastructure/config/theme';
import { parsePreferences, PREFERENCES_COOKIE } from '@/features/profile/preferences';
import {
  COLOR_MODE_COOKIE,
  COLOR_SCHEME_HINT,
  effectiveColorMode,
  resolveColorMode,
  SYSTEM_MODE_SCRIPT,
} from '@/shared/theme/color-mode';
import { Providers } from './providers';
import './globals.css';
import { RouteProgress } from '@/shared/layouts/route-progress';

/** Ethiopic glyph fallback for Amharic (Segoe UI remains the primary face). */
const ethiopic = Noto_Sans_Ethiopic({
  subsets: ['ethiopic'],
  variable: '--font-ethiopic',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: appConfig.app.name, template: `%s · ${appConfig.app.name}` },
  description: appConfig.app.description,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: appConfig.theme.colors.primary },
    { media: '(prefers-color-scheme: dark)', color: DARK_BACKGROUND },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const locale = await getLocale();
  // Per-user display preferences override the product defaults.
  const jar = await cookies();
  const requestHeaders = await headers();
  const prefs = parsePreferences(jar.get(PREFERENCES_COOKIE)?.value);
  // Colour mode: the user's choice (cookie) or the product default. "system" is
  // resolved from the client hint when the browser sends it, otherwise by a
  // pre-paint script, so the page never flashes the wrong palette.
  const canSwitchMode = isFeatureEnabled(appConfig, 'darkMode');
  const colorMode = effectiveColorMode(
    jar.get(COLOR_MODE_COOKIE)?.value,
    appConfig.theme.mode,
    canSwitchMode,
  );
  const hint = requestHeaders.get(COLOR_SCHEME_HINT);
  const systemHint = hint === 'dark' || hint === 'light' ? hint : null;
  const resolved = resolveColorMode(colorMode, systemHint === 'dark');
  const nonce = requestHeaders.get('x-nonce') ?? undefined;
  const forms = appConfig.ui.forms;
  const themeCss = themeToCss({
    ...appConfig.theme,
    density: prefs.density ?? appConfig.theme.density,
    font: { ...appConfig.theme.font, scale: prefs.fontScale ?? appConfig.theme.font.scale },
  });
  return (
    <html
      lang={locale}
      dir={isRtl(appConfig, locale) ? 'rtl' : 'ltr'}
      className={`${ethiopic.variable}${resolved === 'dark' ? ' dark' : ''}`}
      data-color-mode={colorMode}
      // The public site scrolls smoothly to in-page anchors (globals.css); route changes still jump.
      data-scroll-behavior="smooth"
      style={{ colorScheme: resolved }}
      suppressHydrationWarning
    >
      <head>
        {/* Product theme → CSS variables for both palettes (colours, radius, density, elevation, fonts). */}
        <style id="appcore-theme">{themeCss}</style>
        {colorMode === 'system' && !systemHint ? (
          <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SYSTEM_MODE_SCRIPT }} />
        ) : null}
      </head>
      <body>
        <NextIntlClientProvider>
          <Providers
            featureFlags={appConfig.features}
            ui={{
              forms: {
                surface: forms.surface,
                drawerSide: forms.drawerSide,
                overrides: forms.overrides,
                closeOnOutsideClick: forms.closeOnOutsideClick,
                maxColumns: forms.maxColumns,
                userPreference: forms.userChoice ? prefs.formSurface : undefined,
              },
              search: appConfig.ui.search,
              loading: appConfig.ui.loading,
              controls: appConfig.ui.controls,
              pagination: appConfig.ui.pagination,
              tables: appConfig.ui.tables,
            }}
            theme={{ initialMode: colorMode, systemHint, canSwitch: canSwitchMode }}
          >
            {appConfig.ui.loading.routeProgress ? (
              <Suspense fallback={null}>
                <RouteProgress />
              </Suspense>
            ) : null}
            {children}
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
