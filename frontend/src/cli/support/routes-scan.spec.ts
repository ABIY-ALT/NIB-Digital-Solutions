import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { describeAccess, scanApiRoutes, scanPages } from './routes-scan';

/** A throwaway project with pages, layouts and API routes in every style the scanner reads. */
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'routes-scan-'));
  for (const [path, source] of Object.entries(files)) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, source);
  }
  return root;
}

const root = fixture({
  'src/app/(app)/layout.tsx': 'await requireUser();',
  'src/app/(app)/users/page.tsx': "await requireUser({ permission: 'users:read' });",
  'src/app/(app)/profile/page.tsx': 'export default function Page() {}',
  'src/app/login/page.tsx': 'export default function Login() {}',
  'src/app/api/users/route.ts':
    "export { list as GET, create as POST, list as GET } from '@/features/users/api/users.routes';",
  'src/app/api/users/[id]/route.ts':
    "export { get as GET, update as PATCH } from '../../../../features/users/api/users.routes';",
  'src/app/api/missing/route.ts': "export { GET } from '@/features/nowhere/routes';",
  'src/app/api/inline/route.ts': [
    'export async function GET() {}',
    "export const POST = apiRoute({ requires: { permission: 'x:create' } }, async () => ({}));",
    'export const helper = 1;',
    "export const { PUT, DELETE } = resourceRoutes(r, { access: { update: 'x:update' } });",
  ].join('\n'),
  'src/app/api/health/route.ts': 'export const GET = publicApiRoute(async () => ({}));',
  'src/features/users/api/users.routes.ts': [
    "export const list = apiRoute({ requires: { permission: 'users:read' } }, async () => ({}));",
    "export const create = apiRoute({ requires: { permission: 'users:create' } }, async () => ({}));",
    'export const get = apiRoute({}, async () => ({}));',
    'export const update = apiRoute(options(), async () => ({}));',
  ].join('\n'),
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('scanPages', () => {
  it('finds each page with its own or inherited guard', () => {
    expect(scanPages(root).map((p) => [p.url, p.guard, describeAccess(p.access)])).toEqual([
      ['/login', 'none', 'public'],
      ['/profile', 'layout', 'signed in'],
      ['/users', 'page', 'users:read'],
    ]);
  });
});

describe('scanApiRoutes', () => {
  it('reads re-exported, inline and destructured handlers once per method', () => {
    expect(
      scanApiRoutes(root).map(
        (r) => `${r.method} ${r.url} ${r.handler ?? '-'} ${describeAccess(r.access)}`,
      ),
    ).toEqual([
      'GET /api/health - public',
      'DELETE /api/inline - custom handler',
      'GET /api/inline - custom handler',
      'POST /api/inline - x:create',
      'PUT /api/inline - custom handler',
      'GET /api/missing nowhere/routes#GET UNKNOWN',
      'GET /api/users users/api/users.routes#list users:read',
      'POST /api/users users/api/users.routes#create users:create',
      'GET /api/users/[id] ../../../../features/users/api/users.routes#get signed in',
      'PATCH /api/users/[id] ../../../../features/users/api/users.routes#update custom handler',
    ]);
  });

  it('finds a declared access for every API route of this project', () => {
    const routes = scanApiRoutes(process.cwd());
    expect(routes.length).toBeGreaterThan(20);
    expect(routes.filter((r) => r.access.kind === 'unknown')).toEqual([]);
  });
});
