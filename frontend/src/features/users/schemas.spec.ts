import { describe, expect, it } from 'vitest';
import { createUserFormSchema, createUserSchema } from './schemas';

const base = {
  username: 'abebe.k',
  email: 'abebe@nib.et',
  fullName: 'Abebe Kebede',
  phoneNumber: '',
  password: 'Harbor-Lights#77q',
  branchCode: '',
  roles: ['USER'],
};

describe('new user form: password confirmation', () => {
  it('accepts matching passwords', () => {
    expect(
      createUserFormSchema().safeParse({ ...base, confirmPassword: base.password }).success,
    ).toBe(true);
  });

  it('rejects a mismatch on the confirmation field', () => {
    const result = createUserFormSchema().safeParse({
      ...base,
      confirmPassword: 'Harbor-Lights#77',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ['confirmPassword'],
      message: 'validation.passwordMismatch',
    });
  });

  it('requires the confirmation', () => {
    const result = createUserFormSchema().safeParse({ ...base, confirmPassword: '' });
    expect(result.error?.issues.map((i) => i.path.join('.'))).toContain('confirmPassword');
  });

  it('keeps the API schema unchanged (the confirmation is never sent)', () => {
    const parsed = createUserSchema().parse({ ...base, confirmPassword: base.password });
    expect(parsed).not.toHaveProperty('confirmPassword');
  });
});
