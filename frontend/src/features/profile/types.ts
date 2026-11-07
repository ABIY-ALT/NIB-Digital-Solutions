import type { ApiSchemas } from '@/shared/api';

/** One entry of my activity timeline (shared contract). */
export type PersonalActivityEntry = ApiSchemas['PersonalActivityEntry'];
export type PersonalActivityPage = ApiSchemas['PersonalActivityPage'];
export type PersonalActivitySummary = ApiSchemas['PersonalActivitySummary'];

export interface AccountSession {
  id: string;
  current: boolean;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  authMethod: string;
  mfaVerified: boolean;
}

export interface TotpSetup {
  secret: string;
  otpauthUri: string;
  expiresAt: string;
}

type NameRules = ReadonlyArray<readonly [pattern: RegExp, name: string]>;

/** First match wins: Edge and Opera user agents also name Chrome, Chrome's names Safari. */
const BROWSERS: NameRules = [
  [/Edg\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
  [/node|undici/i, 'API client'],
];
const SYSTEMS: NameRules = [
  [/Windows/, 'Windows'],
  [/Android/, 'Android'],
  [/iPhone|iPad/, 'iOS'],
  [/Mac OS X/, 'macOS'],
  [/Linux/, 'Linux'],
];

const nameFrom = (ua: string, rules: NameRules, fallback: string): string =>
  rules.find(([pattern]) => pattern.test(ua))?.[1] ?? fallback;

/** Very small user-agent summary for the sessions list ("Chrome on Windows"). */
export function describeUserAgent(ua: string | null): { browser: string; os: string } {
  if (!ua) return { browser: 'Unknown', os: '' };
  return { browser: nameFrom(ua, BROWSERS, 'Browser'), os: nameFrom(ua, SYSTEMS, '') };
}
