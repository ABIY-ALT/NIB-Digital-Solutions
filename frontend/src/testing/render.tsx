import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  type RenderResult,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { afterEach, vi } from 'vitest';
import { PermissionsProvider } from '@/features/auth/components/permissions-provider';
import { FeatureFlagsProvider } from '@/shared/feature-flags/feature-flags';
import { loadMessages } from '@/infrastructure/i18n/messages';
import type { SessionUser } from '@/shared/types';
import { TooltipProvider } from '@/shared/ui/menu';
import { DEFAULT_UI_SETTINGS, UiSettingsProvider, type UiSettings } from '@/shared/ui/ui-settings';

/**
 * Component tests (jsdom): render a component inside the providers the app
 * mounts (messages, server state, permissions, UI settings, tooltips), and
 * answer its BFF requests from a table of canned envelopes.
 *
 *   // @vitest-environment jsdom
 *   mockNavigation();                       // before importing the component
 *   const api = mockApi({ 'GET /api/roles': [role] });
 *   renderApp(<RolesPage />, { permissions: ['roles:manage'] });
 */

export const messages = await loadMessages('en');

// findBy… / waitFor: the suite runs files in parallel, so allow for a busy machine.
configure({ asyncUtilTimeout: 10_000 });

// Browser APIs jsdom leaves out, which Radix and the tables rely on.
if (typeof window !== 'undefined') {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // Reports every observed element as visible (infinite scroll loads the next page).
  globalThis.IntersectionObserver ??= class {
    constructor(private readonly callback: IntersectionObserverCallback) {}
    observe(target: Element) {
      queueMicrotask(() =>
        this.callback(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        ),
      );
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
  window.PointerEvent ??= class extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'mouse';
    }
  } as typeof PointerEvent;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  document.elementFromPoint ??= () => null;
  // File downloads (CSV templates, reports).
  URL.createObjectURL ??= () => 'blob:test';
  URL.revokeObjectURL ??= () => {};
  HTMLAnchorElement.prototype.click = function click() {};
  // jsdom lays nothing out; virtualised tables need a viewport to fill.
  Object.defineProperties(HTMLElement.prototype, {
    offsetHeight: { configurable: true, get: () => 800 },
    offsetWidth: { configurable: true, get: () => 1024 },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

export function testUser(permissions: string[] = [], overrides: Partial<SessionUser> = {}) {
  return {
    id: 'u-1',
    username: 'admin',
    name: 'Ada Admin',
    email: 'admin@example.com',
    roles: ['admin'],
    permissions,
    branchCode: null,
    mfaEnabled: false,
    ...overrides,
  } as SessionUser;
}

export interface RenderAppOptions {
  permissions?: string[];
  user?: SessionUser | null;
  client?: QueryClient;
  settings?: UiSettings;
  flags?: Record<string, boolean>;
}

export function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
}

export function renderApp(
  ui: ReactElement,
  {
    permissions = [],
    user,
    client = testQueryClient(),
    settings = DEFAULT_UI_SETTINGS,
    flags = {},
  }: RenderAppOptions = {},
): RenderResult & { client: QueryClient } {
  const result = render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <QueryClientProvider client={client}>
        <PermissionsProvider user={user === undefined ? testUser(permissions) : user}>
          <FeatureFlagsProvider flags={flags}>
            <UiSettingsProvider settings={settings}>
              <TooltipProvider>{ui}</TooltipProvider>
            </UiSettingsProvider>
          </FeatureFlagsProvider>
        </PermissionsProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return Object.assign(result, { client });
}

type Reply = unknown | ((request: { url: URL; body: unknown }) => unknown);

export interface ApiCall {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

/** A failed reply: the error envelope the BFF sends. */
export class ApiFailure {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly message = 'Failed',
    /** Seconds sent as retry-after (rate limits, lock-outs). */
    readonly retryAfter?: number,
  ) {}
}

/**
 * Stubs fetch with replies keyed "METHOD /path" (no query). A reply is the
 * envelope's data, a function of the request, or an ApiFailure. Unknown
 * routes fail with 404, so a missing stub shows up as an error state.
 */
export function mockApi(routes: Record<string, Reply>) {
  const calls: ApiCall[] = [];
  const fetchMock = vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ method, path: url.pathname, query: url.searchParams, body });
    const key = `${method} ${url.pathname}`;
    let reply: unknown = key in routes ? routes[key] : new ApiFailure(404, 'NOT_FOUND', key);
    if (typeof reply === 'function') {
      reply = await (reply as (r: { url: URL; body: unknown }) => unknown)({ url, body });
    }
    if (reply instanceof ApiFailure) {
      return Response.json(
        {
          success: false,
          error: { code: reply.code, message: reply.message },
          correlationId: 'corr-1',
          timestamp: '2026-01-01T00:00:00Z',
        },
        {
          status: reply.status,
          headers: reply.retryAfter ? { 'retry-after': String(reply.retryAfter) } : undefined,
        },
      );
    }
    const {
      data,
      meta,
      status = 200,
    } = reply && typeof reply === 'object' && '__envelope' in reply
      ? (reply as unknown as { data: unknown; meta?: unknown; status?: number })
      : { data: reply };
    return Response.json(
      {
        success: true,
        data,
        meta,
        message: null,
        correlationId: 'corr-1',
        timestamp: '2026-01-01T00:00:00Z',
      },
      { status },
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetch: fetchMock };
}

/** A reply with meta (pagination) or a non-200 status (202 = sent for approval). */
export function envelope(data: unknown, extra: { meta?: unknown; status?: number } = {}) {
  return { __envelope: true, data, ...extra };
}

/** A page of items with pagination meta, as list endpoints reply. */
export function page<T>(
  items: T[],
  { page: current = 1, pageSize = 20, total = items.length } = {},
) {
  return envelope(items, {
    meta: {
      pagination: {
        page: current,
        pageSize,
        totalItems: total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        hasNextPage: current * pageSize < total,
        hasPreviousPage: current > 1,
      },
    },
  });
}

export interface NavigationMock {
  push: ReturnType<typeof vi.fn>;
  replace: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
  back: ReturnType<typeof vi.fn>;
  prefetch: ReturnType<typeof vi.fn>;
  pathname: string;
  search: URLSearchParams;
}

/** The router state next/navigation's mocked hooks read (see mockNextNavigation). */
export const navigation: NavigationMock = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  prefetch: vi.fn(),
  pathname: '/',
  search: new URLSearchParams(),
};

export function setLocation(pathname: string, search = '') {
  navigation.pathname = pathname;
  navigation.search = new URLSearchParams(search);
  // Components that read the live location (window.location.search) see the same URL.
  if (typeof window !== 'undefined') {
    window.history.replaceState(null, '', search ? `${pathname}?${search}` : pathname);
  }
}

/** Factory for vi.mock('next/navigation', …): hooks backed by `navigation`. */
export function nextNavigationModule() {
  return {
    useRouter: () => navigation,
    usePathname: () => navigation.pathname,
    useSearchParams: () => navigation.search,
    useParams: () => ({}),
    redirect: vi.fn(),
    notFound: vi.fn(),
  };
}

/** Opens a Radix dropdown (row actions, account menu) from its trigger. */
export async function openMenu(trigger: HTMLElement): Promise<HTMLElement> {
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  return screen.findByRole('menu');
}
