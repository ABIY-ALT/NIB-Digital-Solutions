import { trimWhere } from '#core/domain/strings.js';

/**
 * Account security policy (pure domain rules, configured per product through
 * environment variables). The same rule set drives server-side enforcement and
 * the live checklist the UI shows while a user types a new password.
 */
export interface PasswordRules {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireDigit: boolean;
  requireSymbol: boolean;
  /** Previous passwords that cannot be reused. */
  historyCount: number;
  /** 0 = passwords never expire. */
  maxAgeDays: number;
  /** 0 = can be changed again immediately. */
  minAgeHours: number;
  expiryWarningDays: number;
  /** Passwords set by an administrator must be replaced at first sign-in. */
  changeOnFirstLogin: boolean;
}

export interface SecurityPolicy {
  password: PasswordRules;
  session: { maxConcurrent: number; newDeviceAlerts: boolean };
  mfa: { requiredRoles: string[] };
}

export type PasswordRuleId =
  | 'MIN_LENGTH'
  | 'MAX_LENGTH'
  | 'UPPERCASE'
  | 'LOWERCASE'
  | 'DIGIT'
  | 'SYMBOL'
  | 'NO_PERSONAL_INFO'
  | 'NOT_COMMON'
  | 'NOT_REUSED'
  | 'MIN_AGE';

export interface PasswordViolation {
  rule: PasswordRuleId;
  message: string;
}

/** Frequently breached passwords and patterns (extend or replace with a breach-corpus check). */
const COMMON = new Set([
  'password',
  'password1',
  'passw0rd',
  'p@ssw0rd',
  'p@ssword',
  'welcome',
  'welcome1',
  'qwerty',
  'qwerty123',
  'letmein',
  'admin',
  'admin123',
  'administrator',
  'changeme',
  'iloveyou',
  'abc123',
  '123456',
  '12345678',
  '123456789',
  '1234567890',
  'ethiopia',
  'addisababa',
  'nibbank',
]);

/** Lower-cased password with digits/symbols stripped at the edges ("Password@2026" → "password"). */
function core(password: string): string {
  return trimWhere(password.toLowerCase(), (c) => c < 'a' || c > 'z');
}

export function evaluatePassword(
  password: string,
  rules: PasswordRules,
  context: { username?: string; email?: string; fullName?: string } = {},
): PasswordViolation[] {
  const v: PasswordViolation[] = [];
  if (password.length < rules.minLength)
    v.push({ rule: 'MIN_LENGTH', message: `At least ${rules.minLength} characters` });
  if (password.length > rules.maxLength)
    v.push({ rule: 'MAX_LENGTH', message: `At most ${rules.maxLength} characters` });
  if (rules.requireUppercase && !/[A-Z]/.test(password))
    v.push({ rule: 'UPPERCASE', message: 'Must contain an uppercase letter' });
  if (rules.requireLowercase && !/[a-z]/.test(password))
    v.push({ rule: 'LOWERCASE', message: 'Must contain a lowercase letter' });
  if (rules.requireDigit && !/\d/.test(password))
    v.push({ rule: 'DIGIT', message: 'Must contain a digit' });
  if (rules.requireSymbol && !/[^A-Za-z0-9]/.test(password))
    v.push({ rule: 'SYMBOL', message: 'Must contain a symbol' });

  const lower = password.toLowerCase();
  const personal = [
    context.username,
    context.email?.split('@')[0],
    ...(context.fullName?.split(/\s+/) ?? []),
  ]
    .map((s) => s?.trim().toLowerCase())
    .filter((s): s is string => !!s && s.length >= 3);
  if (personal.some((p) => lower.includes(p))) {
    v.push({ rule: 'NO_PERSONAL_INFO', message: 'Must not contain your name or username' });
  }
  if (COMMON.has(lower) || COMMON.has(core(password))) {
    v.push({ rule: 'NOT_COMMON', message: 'This password is too common' });
  }
  return v;
}

/** Whole days left before `expiresAt` (negative when already expired). */
export function daysUntil(expiresAt: Date, now: Date): number {
  return Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000);
}
