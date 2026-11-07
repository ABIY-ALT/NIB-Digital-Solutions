/**
 * Client-side mirror of the backend password policy (for the live checklist
 * and instant form feedback). The backend remains authoritative: it also
 * checks history, minimum age and breached/common passwords.
 */
export interface PasswordRulesConfig {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireDigit: boolean;
  requireSymbol: boolean;
  disallowPersonalInfo?: boolean;
}

export type PasswordRuleId =
  'MIN_LENGTH' | 'UPPERCASE' | 'LOWERCASE' | 'DIGIT' | 'SYMBOL' | 'NO_PERSONAL_INFO';

export interface PasswordRuleState {
  id: PasswordRuleId;
  met: boolean;
}

/** Safe defaults until the policy has loaded (match the backend defaults). */
export const DEFAULT_PASSWORD_RULES: PasswordRulesConfig = {
  minLength: 10,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSymbol: true,
  disallowPersonalInfo: true,
};

export function evaluatePasswordRules(
  password: string,
  rules: PasswordRulesConfig,
  personal: Array<string | null | undefined> = [],
): PasswordRuleState[] {
  const result: PasswordRuleState[] = [
    { id: 'MIN_LENGTH', met: password.length >= rules.minLength },
  ];
  if (rules.requireUppercase) result.push({ id: 'UPPERCASE', met: /[A-Z]/.test(password) });
  if (rules.requireLowercase) result.push({ id: 'LOWERCASE', met: /[a-z]/.test(password) });
  if (rules.requireDigit) result.push({ id: 'DIGIT', met: /\d/.test(password) });
  if (rules.requireSymbol) result.push({ id: 'SYMBOL', met: /[^A-Za-z0-9]/.test(password) });
  if (rules.disallowPersonalInfo) {
    const lower = password.toLowerCase();
    const parts = personal
      .flatMap((p) => (p ?? '').split(/[\s@._-]+/))
      .map((p) => p.trim().toLowerCase())
      .filter((p) => p.length >= 3);
    result.push({
      id: 'NO_PERSONAL_INFO',
      met: password.length > 0 && !parts.some((p) => lower.includes(p)),
    });
  }
  return result;
}

/** 0–4 strength estimate for the meter (length and variety; not a security control). */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  const unique = new Set(password).size;
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (classes >= 3) score += 1;
  if (classes === 4 && unique >= 8) score += 1;
  return Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
}
