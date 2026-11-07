'use client';

import type { SessionUser } from '@/shared/types';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  hasRole,
  meetsRequirement,
  type AccessRequirement,
} from '@/features/auth/permissions';

const PermissionsContext = createContext<SessionUser | null>(null);

/** Supplies the signed-in user (no tokens) to permission hooks and guards. */
export function PermissionsProvider({
  user,
  children,
}: Readonly<{
  user: SessionUser | null;
  children: ReactNode;
}>) {
  return <PermissionsContext.Provider value={user}>{children}</PermissionsContext.Provider>;
}

export interface PermissionsApi {
  user: SessionUser | null;
  isAuthenticated: boolean;
  can: (permission: string) => boolean;
  canAny: (permissions: readonly string[]) => boolean;
  canAll: (permissions: readonly string[]) => boolean;
  hasRole: (role: string) => boolean;
  meets: (requirement: AccessRequirement) => boolean;
}

/**
 * Permission helpers for components:
 *   const { can } = usePermissions();
 *   <Button disabled={!can('users:create')}>New user</Button>
 */
export function usePermissions(): PermissionsApi {
  const user = useContext(PermissionsContext);
  return useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      can: (p) => hasPermission(user?.permissions, p),
      canAny: (ps) => hasAnyPermission(user?.permissions, ps),
      canAll: (ps) => hasAllPermissions(user?.permissions, ps),
      hasRole: (r) => hasRole(user?.roles, r),
      meets: (req) => meetsRequirement(user, req),
    }),
    [user],
  );
}

export function useCurrentUser(): SessionUser | null {
  return useContext(PermissionsContext);
}
