import { COLOR_MODES, type ColorMode, type ResolvedColorMode } from '@/infrastructure/config/theme';

export { COLOR_MODES, type ColorMode, type ResolvedColorMode };

/**
 * Colour-mode preference: a plain (non-httpOnly, non-sensitive) cookie so the
 * server renders the right palette on the first paint, on every page including
 * sign-in, and the browser can change it without a round trip.
 */
export const COLOR_MODE_COOKIE = 'appcore.color-mode';
export const COLOR_MODE_CHANNEL = 'appcore.color-mode';
/** Chromium sends the device preference with this client hint once asked (Accept-CH). */
export const COLOR_SCHEME_HINT = 'sec-ch-prefers-color-scheme';
const MEDIA = '(prefers-color-scheme: dark)';

export function parseColorMode(raw: string | null | undefined): ColorMode | null {
  return COLOR_MODES.includes(raw as ColorMode) ? (raw as ColorMode) : null;
}

/** The user's choice when switching is allowed, otherwise the product default. */
export function effectiveColorMode(
  saved: string | null | undefined,
  defaultMode: ColorMode,
  canSwitch: boolean,
): ColorMode {
  return (canSwitch ? parseColorMode(saved) : null) ?? defaultMode;
}

export function resolveColorMode(mode: ColorMode, systemDark: boolean): ResolvedColorMode {
  if (mode !== 'system') return mode;
  return systemDark ? 'dark' : 'light';
}

export function colorModeCookie(mode: ColorMode, secure: boolean): string {
  return `${COLOR_MODE_COOKIE}=${mode}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/**
 * Runs before the first paint when the mode is "system" and the server could
 * not know the device preference: applies the dark palette without a flash.
 * Rendered with the CSP nonce.
 */
export const SYSTEM_MODE_SCRIPT = `(function(){try{var d=document.documentElement,m=window.matchMedia('${MEDIA}').matches;d.classList.toggle('dark',m);d.style.colorScheme=m?'dark':'light'}catch(e){}})()`;

export const DARK_MEDIA_QUERY = MEDIA;
