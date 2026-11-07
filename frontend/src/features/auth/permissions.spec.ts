import { describe, expect, it } from 'vitest';
import { grants, hasPermission, meetsRequirement } from '@/features/auth/permissions';

describe('permission matching (mirrors backend)', () => {
  it.each([
    ['*', 'users:read', true],
    ['users:*', 'users:delete', true],
    ['users:read', 'users:read', true],
    ['users:read:branch', 'users:read', true],
    ['users:read', 'users:read:own', true],
    ['users:read:own', 'users:read:branch', false],
    ['users:read', 'users:update', false],
    ['audit:read', 'users:read', false],
    ['garbage', 'users:read', false],
  ])('%s grants %s → %s', (granted, required, expected) => {
    expect(grants(granted, required)).toBe(expected);
  });

  it('evaluates composite requirements', () => {
    const user = { permissions: ['users:read', 'audit:read'], roles: ['ADMIN'] };
    expect(hasPermission(user.permissions, 'audit:read')).toBe(true);
    expect(meetsRequirement(user, { anyOf: ['users:create', 'users:read'] })).toBe(true);
    expect(meetsRequirement(user, { allOf: ['users:create', 'users:read'] })).toBe(false);
    expect(meetsRequirement(user, { role: ['SUPER_ADMIN', 'ADMIN'] })).toBe(true);
    expect(meetsRequirement(null, { permission: 'users:read' })).toBe(false);
  });
});
