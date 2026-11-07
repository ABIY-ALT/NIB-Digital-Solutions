'use client';

import type { ReactNode } from 'react';
import type { AccessRequirement } from '@/features/auth/permissions';
import { usePermissions } from '@/features/auth/components/permissions-provider';

export interface CanProps extends AccessRequirement {
  /** Rendered when access is denied (default: nothing — the element is hidden). */
  fallback?: ReactNode;
  /**
   * Either plain children (hidden when denied) or a render function receiving
   * `allowed`, for "disable instead of hide" patterns.
   */
  children: ReactNode | ((allowed: boolean) => ReactNode);
}

/**
 * Declarative UX-level authorization.
 *
 *   <Can permission="users:create"><Button>New user</Button></Can>
 *   <Can anyOf={['audit:read', 'users:read']} fallback={<Hint/>}>...</Can>
 *   <Can permission="users:delete">{(ok) => <Button disabled={!ok}>Delete</Button>}</Can>
 */
export function Can({ fallback = null, children, ...requirement }: Readonly<CanProps>) {
  const { meets } = usePermissions();
  const allowed = meets(requirement);
  if (typeof children === 'function') return <>{children(allowed)}</>;
  return <>{allowed ? children : fallback}</>;
}

export interface PermissionGuardProps extends AccessRequirement {
  /** What to show when denied — typically the framework's <Forbidden/> state. */
  fallback: ReactNode;
  children: ReactNode;
}

/** Section/page-level guard: shows `fallback` (e.g. a 403 state) when denied. */
export function PermissionGuard({
  fallback,
  children,
  ...requirement
}: Readonly<PermissionGuardProps>) {
  const { meets } = usePermissions();
  return <>{meets(requirement) ? children : fallback}</>;
}
