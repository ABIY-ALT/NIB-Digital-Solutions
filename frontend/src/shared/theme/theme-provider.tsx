'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  COLOR_MODE_CHANNEL,
  COLOR_MODES,
  colorModeCookie,
  DARK_MEDIA_QUERY,
  parseColorMode,
  resolveColorMode,
  type ColorMode,
  type ResolvedColorMode,
} from './color-mode';

export interface ThemeApi {
  /** The user's choice: light, dark or system. */
  mode: ColorMode;
  /** What is shown now (system resolved against the device). */
  resolved: ResolvedColorMode;
  /** Whether users may change the mode (the `darkMode` feature). */
  canSwitch: boolean;
  modes: readonly ColorMode[];
  setMode: (mode: ColorMode) => void;
}

const ThemeContext = createContext<ThemeApi | null>(null);

function subscribeSystem(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_MEDIA_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

/** Applies a palette to <html> without animating every colour transition. */
function applyToDocument(resolved: ResolvedColorMode, mode: ColorMode): void {
  const root = document.documentElement;
  const dark = resolved === 'dark';
  if (root.classList.contains('dark') === dark && root.dataset.colorMode === mode) return;
  const pause = document.createElement('style');
  pause.textContent = '*,*::before,*::after{transition:none!important}';
  document.head.appendChild(pause);
  root.classList.toggle('dark', dark);
  root.style.colorScheme = resolved;
  root.dataset.colorMode = mode;
  // Force a style flush, then re-enable transitions on the next frame.
  window.getComputedStyle(root).getPropertyValue('opacity');
  requestAnimationFrame(() => pause.remove());
}

/**
 * Colour mode state for the whole app: follows the device in "system" mode,
 * persists the choice in a cookie (so the server renders it on the next
 * request) and keeps every open tab in sync.
 */
export function ThemeProvider({
  initialMode,
  systemHint,
  canSwitch,
  children,
}: Readonly<{
  initialMode: ColorMode;
  /** Device preference known to the server (client hint), for the first render. */
  systemHint: ResolvedColorMode | null;
  canSwitch: boolean;
  children: ReactNode;
}>) {
  const [mode, setMode] = useState<ColorMode>(initialMode);
  const systemDark = useSyncExternalStore(
    subscribeSystem,
    () => window.matchMedia(DARK_MEDIA_QUERY).matches,
    () => systemHint === 'dark',
  );
  const resolved = resolveColorMode(mode, systemDark);

  useEffect(() => applyToDocument(resolved, mode), [resolved, mode]);

  // Other tabs changed the mode.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(COLOR_MODE_CHANNEL);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const next = parseColorMode(typeof event.data === 'string' ? event.data : null);
      if (next) setMode(next);
    };
    return () => channel.close();
  }, []);

  const changeMode = useCallback(
    (next: ColorMode) => {
      if (!canSwitch) return;
      setMode(next);
      document.cookie = colorModeCookie(next, window.location.protocol === 'https:');
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel(COLOR_MODE_CHANNEL);
        channel.postMessage(next);
        channel.close();
      }
    },
    [canSwitch],
  );

  const api = useMemo<ThemeApi>(
    () => ({ mode, resolved, canSwitch, modes: COLOR_MODES, setMode: changeMode }),
    [mode, resolved, canSwitch, changeMode],
  );
  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>;
}

/** Current colour mode and a setter (header switcher, Preferences, quick search). */
export function useTheme(): ThemeApi {
  const api = useContext(ThemeContext);
  if (!api) throw new Error('useTheme must be used inside <ThemeProvider>');
  return api;
}
