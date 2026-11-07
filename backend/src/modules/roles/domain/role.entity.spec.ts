import { BusinessRuleError, ValidationError } from '#core/domain/errors/app-error.js';
import { Role } from './role.entity.js';

const meta = {
  id: 'r1',
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: null,
  updatedBy: null,
  version: 1,
  deletedAt: null,
  deletedBy: null,
};

describe('Role', () => {
  it('normalises the code and de-duplicates permissions', () => {
    const r = Role.create(
      { code: 'teller', name: 'Teller', permissionCodes: ['users:read', 'users:read'] },
      'admin',
    );
    expect(r.code).toBe('TELLER');
    expect(r.permissionCodes).toEqual(['users:read']);
  });

  it('rejects invalid codes and permission strings', () => {
    expect(() => Role.create({ code: '1x', name: '', permissionCodes: ['BAD'] }, null)).toThrow(
      ValidationError,
    );
  });

  it('protects system roles and roles in use', () => {
    const system = Role.reconstitute(meta, {
      code: 'SUPER_ADMIN',
      name: 'Super',
      description: null,
      isSystem: true,
      permissionCodes: ['*'],
      userCount: 1,
    });
    expect(() => system.softDelete('a')).toThrow(BusinessRuleError);
    expect(() => system.update({ permissionCodes: ['users:read'] }, 'a')).toThrow(
      BusinessRuleError,
    );

    const used = Role.reconstitute(meta, {
      code: 'TELLER',
      name: 'Teller',
      description: null,
      isSystem: false,
      permissionCodes: [],
      userCount: 3,
    });
    expect(() => used.softDelete('a')).toThrow(/Remove this role/);
  });
});
