import type { FieldIssue } from '#core/domain/errors/app-error.js';
import type { LeadNote } from './marketplace.constants.js';

/**
 * Shared rules for customer-submitted leads (demo requests, inquiries):
 * sanitisation, contact validation and human-friendly reference numbers.
 * Pure domain code (randomness comes from the platform's Web Crypto global).
 */

/** C0 control characters except tab (9), line feed (10) and carriage return (13), plus DEL. */
const isControl = (code: number) =>
  code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
const stripControls = (value: string) =>
  Array.from(value)
    .filter((ch) => !isControl(ch.charCodeAt(0)))
    .join('');

/** Strip control characters and angle brackets, collapse whitespace (single-line fields). */
export function cleanLine(value: string | null | undefined, max: number): string {
  return stripControls(value ?? '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Like cleanLine but keeps paragraph breaks (multi-line fields). */
export function cleanText(value: string | null | undefined, max: number): string {
  return stripControls(value ?? '')
    .replace(/[<>]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
export const PHONE_PATTERN = /^\+?\d{9,15}$/;

export const normalisePhone = (value: string | null | undefined) =>
  (value ?? '').replace(/[^\d+]/g, '');

export function checkEmail(issues: FieldIssue[], field: string, email: string) {
  if (!EMAIL_PATTERN.test(email)) issues.push({ field, message: 'Enter a valid email address' });
}

export function checkPhone(issues: FieldIssue[], field: string, phone: string, required: boolean) {
  if ((required || phone) && !PHONE_PATTERN.test(phone))
    issues.push({ field, message: 'Enter a valid phone number' });
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L

/** e.g. DEMO-261103-7KQ4M (date in Addis Ababa time, UTC+3). */
export function makeReference(
  prefix: 'DEMO' | 'INQ' | 'IDEA' | 'QST' | 'REV',
  now = new Date(),
): string {
  const addis = new Date(now.getTime() + 3 * 3_600_000);
  const ymd = addis.toISOString().slice(2, 10).replace(/-/g, '');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(5));
  const suffix = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${prefix}-${ymd}-${suffix}`;
}

export function newNote(author: string, body: string): LeadNote {
  return {
    id: globalThis.crypto.randomUUID(),
    author: cleanLine(author, 120),
    body: cleanText(body, 2000),
    createdAt: new Date().toISOString(),
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** Stored notes (JSON) → typed notes; malformed entries are dropped. */
export function readNotes(value: unknown): LeadNote[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((n: unknown) =>
    isRecord(n) && typeof n['id'] === 'string' && typeof n['body'] === 'string'
      ? [
          {
            id: n['id'],
            author: typeof n['author'] === 'string' ? n['author'] : '',
            body: n['body'],
            createdAt: typeof n['createdAt'] === 'string' ? n['createdAt'] : '',
          },
        ]
      : [],
  );
}

/** Normalised text for duplicate detection: lower case, letters and digits, single spaces. */
export function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .slice(0, 160);
}
