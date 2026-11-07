/**
 * Permission matching for UX-level authorization (show/hide/disable).
 * Mirrors the backend semantics so the UI and the API agree:
 *
 *   "*"                 → everything
 *   "users:*"           → every action on users
 *   "users:read"        → exact
 *   "users:read:branch" → scoped grant; counts as having "users:read" for UX
 *                         (the backend still enforces the scope on each record)
 *
 * The backend remains the authority — these checks only shape the interface.
 */
function parse(code: string): { resource: string; action: string; scope: string | null } | null {
  const parts = code.split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  return { resource: parts[0]!, action: parts[1]!, scope: parts[2] ?? null };
}

export function grants(granted: string, required: string): boolean {
  if (granted === '*' || granted === required) return true;
  const g = parse(granted);
  const r = parse(required);
  if (!g || !r || g.resource !== r.resource) return false;
  if (g.action !== '*' && g.action !== r.action) return false;
  // A scoped grant satisfies an unscoped requirement for UX purposes; an explicit
  // scoped requirement (e.g. "users:read:own") needs that scope or an unscoped grant.
  if (r.scope) return g.scope === null || g.scope === r.scope;
  return true;
}

export function hasPermission(
  permissions: readonly string[] | null | undefined,
  required: string,
): boolean {
  return !!permissions?.some((p) => grants(p, required));
}

export function hasAnyPermission(
  permissions: readonly string[] | null | undefined,
  required: readonly string[],
): boolean {
  return required.some((r) => hasPermission(permissions, r));
}

export function hasAllPermissions(
  permissions: readonly string[] | null | undefined,
  required: readonly string[],
): boolean {
  return required.every((r) => hasPermission(permissions, r));
}

export function hasRole(roles: readonly string[] | null | undefined, role: string): boolean {
  return !!roles?.includes(role);
}

export interface AccessRequirement {
  permission?: string;
  anyOf?: readonly string[];
  allOf?: readonly string[];
  role?: string | readonly string[];
}

export function meetsRequirement(
  user: { permissions: readonly string[]; roles: readonly string[] } | null | undefined,
  req: AccessRequirement,
): boolean {
  if (!user) return false;
  if (req.permission && !hasPermission(user.permissions, req.permission)) return false;
  if (req.anyOf && !hasAnyPermission(user.permissions, req.anyOf)) return false;
  if (req.allOf && !hasAllPermissions(user.permissions, req.allOf)) return false;
  if (req.role) {
    const roles = typeof req.role === 'string' ? [req.role] : req.role;
    if (!roles.some((r) => hasRole(user.roles, r))) return false;
  }
  return true;
}
