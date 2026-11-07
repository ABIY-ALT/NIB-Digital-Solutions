import { ShieldCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { SocialLinks } from '@/features/auth/components/social-links';
import { appConfig } from '@/infrastructure/config/app.config';
import { LocaleSwitcher } from '@/shared/i18n/locale-switcher';
import { BrandMark } from '@/shared/layouts/brand';
import { ThemeSwitcher } from '@/shared/theme/theme-switcher';

const YEAR = new Date().getFullYear();

/** Curved two-tone gold shape in the card's top corner (NIB IB / mobile app cue). */
function AuthShape() {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 h-[128px] overflow-hidden sm:h-[138px]"
      aria-hidden
    >
      <div className="absolute start-0 top-0 h-full w-[52%] rounded-ee-[60%_100%] bg-[linear-gradient(135deg,#ffe082_0%,#fcc036_55%,#f5b800_100%)]" />
      <div className="absolute start-0 top-0 h-[76%] w-[38%] rounded-ee-[75%_95%] bg-[linear-gradient(135deg,#fbc02d_0%,#e69900_100%)]" />
      <span className="absolute start-[24%] top-4 size-2 rounded-full bg-white/45" />
      <span className="absolute start-[8%] top-9 size-3.5 rounded-full bg-white/35" />
    </div>
  );
}

/** `<link>` in auth.privacyStatement: the privacy policy link, or bold text when none is set. */
function privacyLink(chunks: ReactNode) {
  const href = appConfig.app.links.privacyPolicy;
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="font-semibold text-secondary underline-offset-2 hover:underline"
    >
      {chunks}
    </a>
  ) : (
    <span className="font-semibold">{chunks}</span>
  );
}

/**
 * Sign-in pages (login, MFA): the NIB IB sign-in card — gold corner shape,
 * brand block, the page content, privacy statement, social links and footer.
 */
export default async function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  const t = await getTranslations();
  const { app, i18n } = appConfig;
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#fdf6e7] bg-cover dark:bg-background bg-center p-4 sm:p-6">
      <main
        id="main-content"
        className="surface-honeycomb-local relative w-full max-w-[460px] overflow-hidden rounded-surface border border-border px-6 pt-8 pb-6 shadow-[0_25.6px_57.6px_rgba(0,0,0,0.18),0_4.8px_14.4px_rgba(0,0,0,0.12)] sm:px-10 sm:pt-10 sm:pb-7"
      >
        <AuthShape />
        <div className="absolute end-3 top-3 z-10 flex items-center gap-0.5">
          <ThemeSwitcher />
          <LocaleSwitcher
            locales={i18n.locales.map((code) => ({ code, label: i18n.localeLabels[code] ?? code }))}
          />
        </div>
        <div className="relative">
          <div className="mb-5 flex flex-col items-center gap-1">
            <BrandMark
              short={app.shortName}
              logo={app.logo}
              size={52}
              className="drop-shadow-[0_4px_12px_rgb(138_77_33/0.18)]"
            />
            <p className="text-base font-bold tracking-[0.01em] text-secondary">{app.name}</p>
            {app.tagline ? (
              <p className="-mt-0.5 text-[13px] font-semibold tracking-[0.02em] text-secondary/85">
                {app.tagline}
              </p>
            ) : null}
          </div>

          {children}

          <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs leading-snug text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0 text-secondary/85" aria-hidden />
            <span>{t.rich('auth.privacyStatement', { link: privacyLink })}</span>
          </p>
          <div className="mt-4">
            <SocialLinks links={app.links.social} label={t('auth.socialLabel')} />
          </div>
          <div className="mt-5 flex flex-wrap justify-between gap-x-3 gap-y-1 border-t border-secondary/10 pt-4 text-[11px] text-muted-foreground">
            <span>{t('auth.help')}</span>
            <span>&copy; {YEAR} NIB</span>
          </div>
        </div>
      </main>
    </div>
  );
}
