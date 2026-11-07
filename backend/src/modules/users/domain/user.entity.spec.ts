import { BusinessRuleError, ValidationError } from '#core/domain/errors/app-error.js';
import { User } from './user.entity.js';

const make = () =>
  User.create(
    {
      username: 'Abebe.K',
      email: 'ABEBE@nib.et',
      fullName: 'Abebe Kebede',
      passwordHash: 'h',
      roleCodes: ['USER'],
    },
    'admin-id',
  );

describe('User', () => {
  it('normalises identity fields and starts at version 1', () => {
    const u = make();
    expect(u.username).toBe('abebe.k');
    expect(u.email).toBe('abebe@nib.et');
    expect(u.version).toBe(1);
    expect(u.pullEvents().map((e) => e.name)).toEqual(['user.created']);
  });

  it('rejects invalid input', () => {
    expect(() =>
      User.create(
        { username: '!', email: 'x', fullName: '', passwordHash: null, roleCodes: [] },
        null,
      ),
    ).toThrow(ValidationError);
  });

  it('locks after too many failed logins and unlocks after the lockout', () => {
    const u = make();
    const now = new Date('2026-01-01T10:00:00Z');
    expect(u.registerFailedLogin(3, 15, now)).toBe(false);
    expect(u.registerFailedLogin(3, 15, now)).toBe(false);
    expect(u.registerFailedLogin(3, 15, now)).toBe(true);
    expect(u.loginBlock(now)).toBe('LOCKED');
    const later = new Date(now.getTime() + 16 * 60_000);
    expect(u.loginBlock(later)).toBeNull();
    u.registerSuccessfulLogin(later);
    expect(u.status).toBe('ACTIVE');
  });

  it('prevents self deletion and double deletion', () => {
    const u = make();
    expect(() => u.softDelete(u.id)).toThrow(BusinessRuleError);
    u.softDelete('admin');
    expect(u.isDeleted).toBe(true);
    expect(() => u.softDelete('admin')).toThrow(BusinessRuleError);
    u.restore('admin');
    expect(u.isDeleted).toBe(false);
  });
});
