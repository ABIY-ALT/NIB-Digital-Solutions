import { NextResponse, type NextRequest } from 'next/server';
import { hasPermission } from '@/features/auth/permissions';
import { appConfig } from '@/infrastructure/config/app.config';
import type { NavItem } from '@/infrastructure/config/navigation';
import { env } from '@/infrastructure/config/env';
import { logger } from '@/infrastructure/logging/logger';
import { CSRF_COOKIE, isValidCsrfToken, issueCsrfToken } from '@/infrastructure/security/csrf';
import { rateLimit } from '@/infrastructure/security/rate-limit';
import { buildCsp } from '@/infrastructure/security/security-headers';
import {
  chunkSessionCookie,
  decodeSession,
  encodeSession,
  readSessionCookie,
  sessionCookieNames,
  sessionCookieOptions,
  type CookieLike,
} from '@/features/auth/api/session-cookie';
import { sessionState, type AppCoreSessionData } from '@/features/auth/api/session-data';
import { needsRefresh, refreshSession } from '@/features/auth/api/session-refresh';

/**
 * The BFF edge (Next.js proxy, Node runtime). For every request it:
 *   1. assigns a correlation id (propagated to logs, backend and responses)
 *   2. sets a nonce-based Content-Security-Policy
 *   3. rate-limits authentication endpoints
 *   4. enforces idle timeout, refreshes backend tokens before expiry and
 *      forwards the refreshed session cookie to the current request
 *   5. redirects unauthenticated users away from protected routes
 *   6. issues the CSRF token cookie
 */
/** Public marketplace pages (the home page "/" is matched exactly, see isPublic). */
const MARKETPLACE_PREFIXES = [
  '/products',
  '/industries',
  '/solutions',
  '/about',
  '/contact',
  '/ideas',
  '/questions',
  '/api/marketplace',
];
const isMarketplacePage = (path: string) =>
  path === '/' ||
  MARKETPLACE_PREFIXES.some(
    (p) => p !== '/api/marketplace' && (path === p || path.startsWith(`${p}/`)),
  );

const PUBLIC_PREFIXES = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/api/auth',
  '/api/locale',
  '/api/client-errors',
  '/forbidden',
  '/api/health',
  // Telegram bot webhook (authenticated by its secret token header, see questions.routes.ts)
  '/api/telegram/webhook',
  // NIB Digital Solutions marketplace (public website + its BFF routes)
  ...MARKETPLACE_PREFIXES,
  '/robots.txt',
  '/sitemap.xml',
];
const RATE_LIMITED_PREFIXES = [
  '/api/auth/login',
  '/api/auth/mfa',
  '/api/auth/password',
  '/api/auth/callback',
];
const CORRELATION_ID = /^[A-Za-z0-9._:-]{8,64}$/;
const sessionMaxAge = appConfig.auth.sessionMaxAgeHours * 3600;

/** Permissions required by the deepest navigation item matching the path, if any. */
function requiredPermissionsFor(path: string): string[] | null {
  let match: { depth: number; permissions?: string[] } | null = null;
  const walk = (items: NavItem[]) => {
    for (const item of items) {
      if (item.href && (path === item.href || path.startsWith(`${item.href}/`))) {
        if (!match || item.href.length > match.depth)
          match = { depth: item.href.length, permissions: item.permissions };
      }
      if (item.children) walk(item.children);
    }
  };
  appConfig.navigation.forEach((s) => walk(s.items));
  const found = match as { permissions?: string[] } | null;
  return found?.permissions?.length ? found.permissions : null;
}

const isPublic = (path: string) =>
  path === '/' || PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
const isApi = (path: string) => path.startsWith('/api/');

/** First path segments of the staff portal, from the navigation config ("users", "digital-products", …). */
const STAFF_SEGMENTS: ReadonlySet<string> = (() => {
  const segments = new Set<string>();
  const add = (href: string | undefined) => {
    const first = href?.split('/')[1];
    if (first) segments.add(first);
  };
  const walk = (items: NavItem[]) =>
    items.forEach((item) => {
      add(item.href);
      if (item.children) walk(item.children);
    });
  appConfig.navigation.forEach((s) => walk(s.items));
  add(appConfig.app.homePath);
  return segments;
})();
const isStaffPage = (path: string) => STAFF_SEGMENTS.has(path.split('/')[1] ?? '');

/**
 * Where an anonymous request for an unknown page is rewritten: no route has
 * this path, so Next.js answers 404 with app/not-found.tsx (the website's
 * page-not-found). The requested page itself is never served.
 */
const NOT_FOUND_PATH = '/__page-not-found';

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'
  );
}

function unauthorized(correlationId: string, code = 'UNAUTHENTICATED', status = 401): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: { code, message: 'Authentication is required.' },
      correlationId,
      timestamp: new Date().toISOString(),
    },
    { status, headers: { 'x-correlation-id': correlationId } },
  );
}

/** Sign-in attempts (password, MFA, reset, SSO callback) are limited per client IP. */
function authRateLimit(req: NextRequest, correlationId: string): NextResponse | null {
  const { pathname } = req.nextUrl;
  if (req.method !== 'POST' || !RATE_LIMITED_PREFIXES.some((p) => pathname.startsWith(p)))
    return null;
  const limit = rateLimit(`auth:${clientIp(req)}`, 20, 60);
  if (limit.allowed) return null;
  logger.warn({ correlationId, ip: clientIp(req), path: pathname }, 'Auth rate limit exceeded');
  return NextResponse.json(
    {
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again shortly.' },
      correlationId,
      timestamp: new Date().toISOString(),
    },
    {
      status: 429,
      headers: {
        'retry-after': String(limit.retryAfterSeconds),
        'x-correlation-id': correlationId,
      },
    },
  );
}

interface SessionOutcome {
  data: AppCoreSessionData | undefined;
  /** The refreshed session, chunked into cookies. */
  refreshedCookies: CookieLike[] | null;
  /** The session ended: its cookies are removed. */
  clearSession: boolean;
  endReason: 'idle' | 'expired' | null;
}

const ended = (endReason: 'idle' | 'expired'): SessionOutcome => ({
  data: undefined,
  refreshedCookies: null,
  clearSession: true,
  endReason,
});

/** Idle timeout and proactive token refresh of the request's session. */
async function resolveSession(
  req: NextRequest,
  token: Awaited<ReturnType<typeof decodeSession>>,
  correlationId: string,
  secret: string,
): Promise<SessionOutcome> {
  const data = token?.appcore as AppCoreSessionData | undefined;
  const outcome: SessionOutcome = {
    data,
    refreshedCookies: null,
    clearSession: false,
    endReason: null,
  };
  if (!data) return outcome;
  const state = sessionState(data);
  if (state !== 'active') return ended(state === 'idle' ? 'idle' : 'expired');
  if (!needsRefresh(data, appConfig.auth.refreshLeewaySeconds)) return outcome;
  try {
    const refreshed = await refreshSession(data, {
      correlationId,
      clientIp: clientIp(req),
      userAgent: req.headers.get('user-agent') ?? undefined,
    });
    if (!refreshed) return ended('expired');
    outcome.data = refreshed;
    const encoded = await encodeSession({ ...token, appcore: refreshed }, secret, sessionMaxAge);
    outcome.refreshedCookies = chunkSessionCookie(encoded);
  } catch {
    // transient backend failure — continue with the current (still valid) token
  }
  return outcome;
}

/** No session on a protected route: 401 for API calls, the sign-in page (and back) for pages. */
function signInRequired(
  req: NextRequest,
  correlationId: string,
  endReason: SessionOutcome['endReason'],
): NextResponse {
  const { pathname, search } = req.nextUrl;
  if (isApi(pathname)) {
    return unauthorized(correlationId, endReason ? 'AUTH_SESSION_EXPIRED' : 'UNAUTHENTICATED');
  }
  const url = new URL(appConfig.app.loginPath, req.url);
  url.searchParams.set('callbackUrl', `${pathname}${search}`);
  if (endReason) url.searchParams.set('reason', endReason);
  const res = NextResponse.redirect(url);
  res.headers.set('x-correlation-id', correlationId);
  return res;
}

/** Where a page request goes instead, if anywhere: home, sign-in or forbidden. */
function pageRedirect(req: NextRequest, data: AppCoreSessionData | undefined): NextResponse | null {
  const { pathname } = req.nextUrl;
  // "/" is the public marketplace home page for everyone (staff included).
  if (data && pathname === appConfig.app.loginPath) {
    return NextResponse.redirect(new URL(appConfig.app.homePath, req.url));
  }
  // Page-level permissions come from the navigation config (single source of truth).
  // UX layer only — the NestJS API enforces authorization on every call.
  if (data && !isApi(pathname)) {
    const required = requiredPermissionsFor(pathname);
    if (required && !required.some((p) => hasPermission(data.user.permissions, p))) {
      return NextResponse.redirect(new URL('/forbidden', req.url));
    }
  }
  return null;
}

/** The incoming cookies with the session's replaced by the refreshed ones (or dropped). */
function forwardedCookies(cookies: CookieLike[], session: SessionOutcome): string {
  const stale = new Set(sessionCookieNames(cookies));
  const kept = cookies.filter((c) => !stale.has(c.name));
  const next = [...kept, ...(session.refreshedCookies ?? [])];
  return next.map((c) => `${c.name}=${c.value}`).join('; ');
}

/** Sets the refreshed session cookies (removing stale chunks), or removes an ended session's. */
function writeSessionCookies(res: NextResponse, cookies: CookieLike[], session: SessionOutcome) {
  if (session.refreshedCookies) {
    const names = new Set(session.refreshedCookies.map((c) => c.name));
    sessionCookieNames(cookies)
      .filter((n) => !names.has(n))
      .forEach((n) => res.cookies.delete(n));
    session.refreshedCookies.forEach((c) =>
      res.cookies.set(c.name, c.value, sessionCookieOptions(sessionMaxAge)),
    );
  } else if (session.clearSession) {
    sessionCookieNames(cookies).forEach((n) => res.cookies.delete(n));
  }
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const incoming = req.headers.get('x-correlation-id');
  const correlationId = incoming && CORRELATION_ID.test(incoming) ? incoming : crypto.randomUUID();
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV !== 'production';
  // Marketplace pages may embed demo videos (YouTube / Vimeo / https MP4).
  const csp = buildCsp(nonce, isDev, { videoEmbeds: isMarketplacePage(pathname) });
  const e = env();

  // ── Rate limiting for authentication endpoints ────────────────────────────
  const limited = authRateLimit(req, correlationId);
  if (limited) return limited;

  // ── Session: idle timeout + proactive token refresh ───────────────────────
  const cookies = req.cookies.getAll();
  const token = await decodeSession(readSessionCookie(cookies), e.AUTH_SECRET);
  const session = await resolveSession(req, token, correlationId, e.AUTH_SECRET);

  // ── Route protection ───────────────────────────────────────────────────────
  // Deny by default: without a session only public paths are served. A staff
  // page (or API) asks for sign-in; any other page is answered with the
  // website's page-not-found, so a customer's mistyped or outdated link never
  // lands on the staff sign-in.
  const unknownPage =
    !session.data && !isPublic(pathname) && !isApi(pathname) && !isStaffPage(pathname);
  if (!session.data && !isPublic(pathname) && !unknownPage) {
    const res = signInRequired(req, correlationId, session.endReason);
    if (session.clearSession) sessionCookieNames(cookies).forEach((n) => res.cookies.delete(n));
    return res;
  }
  const redirect = pageRedirect(req, session.data);
  if (redirect) return redirect;

  // ── Forward the request with correlation id, nonce and refreshed cookie ───
  const headers = new Headers(req.headers);
  headers.set('x-correlation-id', correlationId);
  headers.set('x-pathname', pathname);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', csp);
  if (session.refreshedCookies || session.clearSession) {
    headers.set('cookie', forwardedCookies(cookies, session));
  }

  const res = unknownPage
    ? NextResponse.rewrite(new URL(NOT_FOUND_PATH, req.url), { request: { headers } })
    : NextResponse.next({ request: { headers } });
  res.headers.set('content-security-policy', csp);
  res.headers.set('x-correlation-id', correlationId);
  writeSessionCookies(res, cookies, session);

  // CSRF token (double-submit) — readable by our JS on purpose; it is not a credential.
  if (!isValidCsrfToken(req.cookies.get(CSRF_COOKIE)?.value, e.CSRF_SECRET)) {
    res.cookies.set(CSRF_COOKIE, issueCsrfToken(e.CSRF_SECRET), {
      httpOnly: false,
      secure: !isDev,
      sameSite: 'strict',
      path: '/',
    });
  }
  return res;
}

export const config = {
  // A plain string literal (Next.js reads it at build time); `[.]` is a literal dot.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*[.](?:png|jpg|jpeg|svg|ico|webp|woff2?)$).*)',
  ],
};
