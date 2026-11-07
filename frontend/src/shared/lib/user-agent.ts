/**
 * Best-effort, dependency-free user-agent summary for people ("Chrome 128 ·
 * Windows"): audit details, sessions and personal activity.
 */
export interface ClientInfo {
  kind: 'desktop' | 'mobile' | 'tablet' | 'api' | 'unknown';
  browser: string | null;
  os: string | null;
}

/**
 * Browser tokens, most specific first: Edge and Opera also send "Chrome", and
 * Chrome-based browsers also send "Safari". Group 1 is the version.
 */
const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg(?:e|A|iOS)?\/([\d.]+)/, 'Edge'],
  [/OPR\/([\d.]+)/, 'Opera'],
  [/Firefox\/([\d.]+)/, 'Firefox'],
  [/(?:Chrome|CriOS)\/([\d.]+)/, 'Chrome'],
  // The whole version, then "Safari" later on the line.
  [/Version\/([\d.]+)(?![\d.]).*Safari/, 'Safari'],
  [/^(?:node|undici|axios|curl|PostmanRuntime|okhttp|python-requests)\/?([\d.]*)/i, 'API client'],
];

const OPERATING_SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Windows NT/, 'Windows'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

/** "Chrome 128" (major version only), or just the name when there is no version. */
function browserOf(ua: string): string | null {
  for (const [re, name] of BROWSERS) {
    const version = re.exec(ua)?.[1];
    if (version !== undefined) return version ? `${name} ${version.split('.')[0]}` : name;
  }
  return null;
}

function kindOf(ua: string, browser: string | null): ClientInfo['kind'] {
  if (/iPad|Tablet/.test(ua)) return 'tablet';
  if (/Mobi|iPhone|Android/.test(ua)) return 'mobile';
  return browser?.startsWith('API client') || !/Mozilla\//.test(ua) ? 'api' : 'desktop';
}

/** Best-effort, dependency-free user-agent summary ("Chrome 128 · Windows"). */
export function parseUserAgent(ua: string | null | undefined): ClientInfo {
  if (!ua) return { kind: 'unknown', browser: null, os: null };
  const browser = browserOf(ua);
  const os = OPERATING_SYSTEMS.find(([re]) => re.test(ua))?.[1] ?? null;
  return { kind: kindOf(ua, browser), browser, os };
}
