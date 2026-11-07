import { describe, expect, it } from 'vitest';
import { evaluatePassword, type PasswordRules } from './password-policy.js';
import { User } from './user.entity.js';

const rules: PasswordRules = {
  minLength: 10,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSymbol: true,
  historyCount: 5,
  maxAgeDays: 90,
  minAgeHours: 0,
  expiryWarningDays: 14,
  changeOnFirstLogin: true,
};

const ids = (pw: string, ctx = {}) => evaluatePassword(pw, rules, ctx).map((v) => v.rule);

describe('evaluatePassword', () => {
  it('accepts a strong, personal-info-free password', () => {
    expect(ids('Blue-Harbor-2031!', { username: 'selam', fullName: 'Selam Tesfaye' })).toEqual([]);
  });

  it('reports every broken composition rule', () => {
    expect(ids('short')).toEqual(['MIN_LENGTH', 'UPPERCASE', 'DIGIT', 'SYMBOL']);
  });

  it('rejects names, usernames and e-mail local parts', () => {
    expect(ids('Tesfaye#2026x', { fullName: 'Selam Tesfaye' })).toContain('NO_PERSONAL_INFO');
    expect(ids('X!selam.t2026', { email: 'selam.t@nib.et' })).toContain('NO_PERSONAL_INFO');
  });

  it('rejects common passwords even when decorated', () => {
    expect(ids('Password@2026')).toContain('NOT_COMMON');
    expect(ids('Admin@12345')).toContain('NOT_COMMON');
  });
});

describe('User password lifecycle', () => {
  const make = (changedDaysAgo: number, mustChange = false) => {
    const user = User.create(
      {
        username: 'jdoe',
        email: 'jdoe@nib.et',
        fullName: 'John Doe',
        passwordHash: 'hash',
        roleCodes: ['USER'],
        passwordMustChange: mustChange,
      },
      null,
    );
    user.replacePasswordHash('hash', null, { mustChange });
    user.syncPersistedMetadata({});
    // Simulate age by re-setting the change date through reconstitution.
    const snap = user.toSnapshot();
    return User.reconstitute(user.metadata, {
      ...snap,
      passwordChangedAt: new Date(Date.now() - changedDaysAgo * 86_400_000),
    });
  };

  it('requires a change when the password is older than the maximum age', () => {
    expect(make(91).passwordChangeReason(90, new Date())).toBe('EXPIRED');
    expect(make(10).passwordChangeReason(90, new Date())).toBeNull();
    expect(make(500).passwordChangeReason(0, new Date())).toBeNull(); // never expires
  });

  it('requires a change for temporary (administrator-set) passwords', () => {
    expect(make(0, true).passwordChangeReason(90, new Date())).toBe('RESET');
  });
});
