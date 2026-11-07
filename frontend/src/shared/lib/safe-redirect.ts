/**
 * Open-redirect protection. Only same-origin, absolute-path redirects are
 * allowed ("/users?x=1"). Protocol-relative ("//evil"), backslash tricks
 * ("/\\evil"), absolute URLs and control characters fall back to `fallback`.
 */
/** Base for resolving the path; only the path, query and hash of the result are used. */
const PARSE_BASE = 'https://appcore.local';

export function safeRedirect(target: string | null | undefined, fallback = '/'): string {
  if (!target || typeof target !== 'string') return fallback;
  let value = target.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the intent
  if (/[\u0000-\u001f\u007f]/.test(value) || value.includes('\\')) return fallback;
  try {
    const url = new URL(value, PARSE_BASE);
    if (url.origin !== PARSE_BASE) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
