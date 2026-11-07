import { describe, expect, it } from 'vitest';
import { changeReasonHeaders, isApprovalTicket } from '@/shared/data/approval';
import { evaluatePasswordRules, passwordStrength, DEFAULT_PASSWORD_RULES } from './password-rules';

describe('password rules (client mirror of the policy)', () => {
  it('reports each rule and personal information', () => {
    const states = evaluatePasswordRules('selam2026', DEFAULT_PASSWORD_RULES, ['Selam Tesfaye']);
    const met = Object.fromEntries(states.map((s) => [s.id, s.met]));
    expect(met).toMatchObject({
      MIN_LENGTH: false,
      UPPERCASE: false,
      LOWERCASE: true,
      DIGIT: true,
      SYMBOL: false,
      NO_PERSONAL_INFO: false,
    });
  });

  it('follows the configured policy (rules can be switched off)', () => {
    const ids = evaluatePasswordRules('abcdefgh', {
      ...DEFAULT_PASSWORD_RULES,
      minLength: 8,
      requireSymbol: false,
      requireDigit: false,
      requireUppercase: false,
    }).map((s) => s.id);
    expect(ids).not.toContain('SYMBOL');
    expect(ids).toContain('MIN_LENGTH');
  });

  it('estimates strength 0–4', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('abc')).toBe(0);
    expect(passwordStrength('Harbor-Lights#77q')).toBe(4);
  });
});

describe('maker–checker helpers', () => {
  it('recognises approval tickets (202 responses)', () => {
    expect(isApprovalTicket({ approvalId: 'x', status: 'PENDING', summary: 's' })).toBe(true);
    expect(isApprovalTicket({ id: 'x', status: 'ACTIVE' })).toBe(false);
    expect(isApprovalTicket(null)).toBe(false);
  });

  it('URI-encodes the change reason header and omits empty reasons', () => {
    expect(changeReasonHeaders('  ')).toEqual({});
    expect(changeReasonHeaders('ለውጥ: ok')).toEqual({
      'x-change-reason': encodeURIComponent('ለውጥ: ok'),
    });
  });
});
