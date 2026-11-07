/**
 * Permission codes follow `<resource>:<action>[:<scope>]`.
 *
 *   users:read          → read any user              (unscoped / global)
 *   users:read:branch   → read users of own branch   (ABAC scope)
 *   users:read:own      → read only yourself         (ABAC scope)
 *   users:*             → every action on users (unscoped)
 *   *                   → super user
 *
 * Roles bundle permissions (RBAC); scopes are resolved by policies (ABAC).
 */
export interface ParsedPermission {
  resource: string;
  action: string;
  scope: string | null;
}

export function parsePermission(code: string): ParsedPermission | null {
  const parts = code.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => p.length === 0)) return null;
  return { resource: parts[0]!, action: parts[1]!, scope: parts[2] ?? null };
}

/** True when `granted` gives UNSCOPED access to `required` (`resource:action`). */
export function grantsUnscoped(granted: string, required: string): boolean {
  if (granted === '*' || granted === required) return true;
  const g = parsePermission(granted);
  const r = parsePermission(required);
  if (!g || !r || g.scope) return false;
  return g.resource === r.resource && g.action === '*';
}

/** Returns the scope if `granted` is a scoped form of `required`, else null. */
export function grantedScope(granted: string, required: string): string | null {
  const g = parsePermission(granted);
  const r = parsePermission(required);
  if (!g || !r || !g.scope) return null;
  return g.resource === r.resource && (g.action === r.action || g.action === '*') ? g.scope : null;
}
