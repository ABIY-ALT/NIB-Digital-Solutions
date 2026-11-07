import { describe, expect, it } from 'vitest';
import { humanizeCode, initials } from './format';

describe('humanizeCode', () => {
  it('turns codes into sentence-case labels', () => {
    expect(humanizeCode('SUPER_ADMIN')).toBe('Super admin');
    expect(humanizeCode('reference-data')).toBe('Reference data');
    expect(humanizeCode('USER')).toBe('User');
  });
});

describe('initials', () => {
  it('uses the first and last word', () => {
    expect(initials('Abebe Kebede Tessema')).toBe('AT');
    expect(initials('System')).toBe('S');
  });
});
