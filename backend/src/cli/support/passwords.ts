import { randomInt } from 'node:crypto';

export interface PasswordComposition {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireDigit: boolean;
  requireSymbol: boolean;
}

// No look-alikes (0/O, 1/l/I): temporary passwords are read aloud and retyped.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%*-_+=?';
const TEMPORARY_LENGTH = 16;

const pick = (alphabet: string): string => alphabet[randomInt(alphabet.length)]!;

/**
 * A random temporary password that satisfies the configured composition rules
 * (cryptographically secure source, every character class present).
 */
export function generateTemporaryPassword(policy: PasswordComposition): string {
  const length = Math.min(Math.max(policy.minLength, TEMPORARY_LENGTH), policy.maxLength);
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  const all = UPPER + LOWER + DIGITS + SYMBOLS;
  while (chars.length < length) chars.push(pick(all));
  // Fisher–Yates, so the guaranteed characters are not always in front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}
