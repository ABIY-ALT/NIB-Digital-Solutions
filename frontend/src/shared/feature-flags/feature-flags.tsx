'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Feature flags on the client (UX only — routes also check them on the server
 * with requireFeature()). Values come from the typed app config; flags are not
 * secrets, but anything security-relevant must still be enforced server-side.
 *
 *   const auditOn = useFeatureFlag('auditLog');
 *   <Feature flag="darkMode" fallback={null}><ThemeToggle /></Feature>
 */
const FeatureFlagsContext = createContext<Readonly<Record<string, boolean>>>({});

export function FeatureFlagsProvider({
  flags,
  children,
}: Readonly<{
  flags: Readonly<Record<string, boolean>>;
  children: ReactNode;
}>) {
  return <FeatureFlagsContext.Provider value={flags}>{children}</FeatureFlagsContext.Provider>;
}

export function useFeatureFlags(): Readonly<Record<string, boolean>> {
  return useContext(FeatureFlagsContext);
}

export function useFeatureFlag(flag: string): boolean {
  return useContext(FeatureFlagsContext)[flag] === true;
}

export function Feature({
  flag,
  fallback = null,
  children,
}: Readonly<{
  flag: string;
  fallback?: ReactNode;
  children: ReactNode;
}>) {
  return <>{useFeatureFlag(flag) ? children : fallback}</>;
}
