import type { Principal } from '#core/application/security/principal.js';
import { ForbiddenError } from '#core/domain/errors/app-error.js';
import { AuthorizationService } from './authorization.service.js';

const principal = (permissions: string[], branchCode: string | null = 'B01'): Principal => ({
  userId: 'u1',
  username: 'u1',
  sessionId: 's1',
  roles: [],
  permissions,
  attributes: { branchCode },
  mfaVerified: false,
  authMethod: 'password',
});

describe('AuthorizationService', () => {
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const authz = new AuthorizationService(audit);

  it('grants unscoped access through exact, resource wildcard and super wildcard', () => {
    expect(authz.can(principal(['users:read']), 'users:read')).toBe(true);
    expect(authz.can(principal(['users:*']), 'users:read')).toBe(true);
    expect(authz.can(principal(['*']), 'audit:read')).toBe(true);
    expect(authz.can(principal(['users:create']), 'users:read')).toBe(false);
  });

  it('evaluates the :own scope against the resource owner', () => {
    const p = principal(['users:read:own']);
    expect(authz.hasPermission(p, 'users:read')).toBe(true);
    expect(authz.can(p, 'users:read', { type: 'User', ownerId: 'u1' })).toBe(true);
    expect(authz.can(p, 'users:read', { type: 'User', ownerId: 'u2' })).toBe(false);
    expect(authz.can(p, 'users:read')).toBe(false);
  });

  it('evaluates the :branch scope and builds list constraints', () => {
    const p = principal(['users:read:branch']);
    expect(authz.can(p, 'users:read', { type: 'User', attributes: { branchCode: 'B01' } })).toBe(
      true,
    );
    expect(authz.can(p, 'users:read', { type: 'User', attributes: { branchCode: 'B02' } })).toBe(
      false,
    );
    expect(authz.listConstraint(p, 'users:read')).toEqual({
      kind: 'any-of',
      constraints: [{ branchCode: 'B01' }],
    });
  });

  it('throws and audits denials', () => {
    expect(() => authz.assert(principal([]), 'users:delete')).toThrow(ForbiddenError);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AUTHZ_DENIED', outcome: 'DENIED' }),
    );
  });
});
