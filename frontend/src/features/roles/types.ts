import type { ApiSchemas } from '@/shared/api';

/** Role and permission catalogue entries (shared contract). */
export type Role = ApiSchemas['Role'];
export type PermissionDefinition = ApiSchemas['PermissionDefinition'];

export interface RoleInput {
  code?: string;
  name: string;
  description?: string | null;
  /** Omitted on update = unchanged (the super role's permissions are fixed). */
  permissions?: string[];
  version?: number;
}

/** Stable action order (IB): CRUD first, then the rest alphabetically; unscoped before scoped. */
const VERB_ORDER = ['create', 'read', 'update', 'delete'];
function byVerb(a: PermissionDefinition, b: PermissionDefinition): number {
  const [, va = '', sa = ''] = a.code.split(':');
  const [, vb = '', sb = ''] = b.code.split(':');
  const rank = (v: string) => (VERB_ORDER.includes(v) ? VERB_ORDER.indexOf(v) : VERB_ORDER.length);
  return rank(va) - rank(vb) || va.localeCompare(vb) || sa.localeCompare(sb);
}

/** Resources alphabetically, the super-user flag ("*") last. */
function byResource(a: string, b: string): number {
  if (a === '*') return 1;
  if (b === '*') return -1;
  return a.localeCompare(b);
}

/** Groups permission codes by resource ("users:read" → "users"). */
export function groupPermissions(
  perms: PermissionDefinition[],
): Array<{ resource: string; items: PermissionDefinition[] }> {
  const groups = new Map<string, PermissionDefinition[]>();
  for (const p of perms) {
    const resource = p.code === '*' ? '*' : (p.code.split(':')[0] ?? p.code);
    groups.set(resource, [...(groups.get(resource) ?? []), p]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => byResource(a, b))
    .map(([resource, items]) => ({ resource, items: [...items].sort(byVerb) }));
}

/** "users:read:branch" → { resource: "users", action: "read", scope: "branch" }. */
export function parsePermission(code: string): {
  resource: string;
  action: string;
  scope?: string;
} {
  if (code === '*') return { resource: '*', action: '*' };
  const [resource = code, action = '', scope] = code.split(':');
  return { resource, action, scope };
}
