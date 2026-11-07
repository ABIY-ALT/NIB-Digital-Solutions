'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { SessionProvider } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { ClientErrorReporter } from '@/features/observability/components/client-error-reporter';
import { makeQueryClient } from '@/shared/data/query-client';
import { FeatureFlagsProvider } from '@/shared/feature-flags/feature-flags';
import { ThemeProvider } from '@/shared/theme/theme-provider';
import { describeError } from '@/shared/errors/error-messages';
import { TooltipProvider } from '@/shared/ui/menu';
import { UiSettingsProvider, type UiSettings } from '@/shared/ui/ui-settings';
import { toast, Toaster } from '@/shared/ui/toaster';

/** Client-side providers: feature flags, UI settings (form surfaces, search), colour mode, server state (TanStack Query), session, tooltips, toasts. */
export function Providers({
  featureFlags,
  ui,
  theme,
  children,
}: Readonly<{
  featureFlags: Readonly<Record<string, boolean>>;
  /** app.config `ui` resolved with the user's preferences (form surfaces, search). */
  ui: UiSettings;
  theme: Omit<ComponentProps<typeof ThemeProvider>, 'children'>;
  children: ReactNode;
}>) {
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  // The client lives for the whole browser session; a ref keeps the notifier on the
  // current locale's messages after a language switch.
  const i18n = useRef({ te, tc });
  useEffect(() => {
    i18n.current = { te, tc };
  }, [te, tc]);
  const [queryClient] = useState(() =>
    makeQueryClient({
      success: (message) => toast.success(message),
      error: (error, override) => {
        const { te: errors, tc: common } = i18n.current;
        const { message, correlationId } = describeError(error, errors);
        toast.error(override ?? message, {
          description: correlationId ? `${common('reference')}: ${correlationId}` : undefined,
        });
      },
    }),
  );

  return (
    <FeatureFlagsProvider flags={featureFlags}>
      <UiSettingsProvider settings={ui}>
        <ThemeProvider {...theme}>
          <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
            <QueryClientProvider client={queryClient}>
              <TooltipProvider>
                {children}
                <Toaster />
                <ClientErrorReporter />
              </TooltipProvider>
              {process.env.NODE_ENV === 'development' ? (
                <ReactQueryDevtools buttonPosition="bottom-right" />
              ) : null}
            </QueryClientProvider>
          </SessionProvider>
        </ThemeProvider>
      </UiSettingsProvider>
    </FeatureFlagsProvider>
  );
}
