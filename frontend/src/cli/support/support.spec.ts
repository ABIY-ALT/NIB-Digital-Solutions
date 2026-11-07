import { describe, expect, it } from 'vitest';
import { ExitCode, RefusedError } from '../kernel/errors';
import { runCli, type CliRuntime } from '../kernel/runner';
import { compareWithBackend, fingerprint, reviewEnvironment } from './env-check';
import {
  checkTranslations,
  compareCatalogue,
  flattenMessages,
  placeholders,
  registeredCatalogues,
  type Catalogue,
} from './i18n-check';
import { describeRequirement, handlerAccess, pageAccess } from './routes-scan';
import {
  componentFile,
  insertBeforeMarker,
  messagesFile,
  navigationEntry,
  pageNames,
  routeFile,
} from './scaffold';

const KEY_A = 'QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUE=';
const KEY_B = 'QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI=';

describe('reviewEnvironment', () => {
  const known = [
    'BACKEND_URL',
    'AUTH_SECRET',
    'CSRF_SECRET',
    'BACKEND_SERVICE_CLIENT_SECRET',
    'LOG_LEVEL',
  ];
  const review = (raw: Record<string, string>, fileKeys = Object.keys(raw)) =>
    reviewEnvironment(raw, known, fileKeys).map((f) => `${f.level} ${f.variable}: ${f.message}`);

  it('accepts a clean development environment', () => {
    expect(
      review({ BACKEND_URL: 'http://localhost:4000', AUTH_SECRET: 'a', CSRF_SECRET: 'b' }),
    ).toEqual([]);
  });

  it('flags placeholders, typos, reused secrets and secrets exposed to the browser', () => {
    const found = review({
      AUTH_SECRET: '__GENERATE__',
      CSRF_SECRET: 'same',
      BACKEND_SERVICE_CLIENT_SECRET: 'same',
      BACKEND_ULR: 'http://localhost:4000',
      NEXT_PUBLIC_API_KEY: 'abc',
      NEXT_PUBLIC_APP_NAME: 'AppCore',
      AUTH_URL: 'http://localhost:3000',
    }).join('\n');
    expect(found).toContain('error AUTH_SECRET: still holds the template placeholder');
    expect(found).toContain(
      'warning BACKEND_ULR: is not a setting AppCore reads (did you mean BACKEND_URL?)',
    );
    expect(found).toContain(
      'error CSRF_SECRET: uses the same secret as BACKEND_SERVICE_CLIENT_SECRET',
    );
    expect(found).toContain(
      'error NEXT_PUBLIC_API_KEY: NEXT_PUBLIC_ variables are compiled into the browser bundle',
    );
    expect(found).not.toContain('NEXT_PUBLIC_APP_NAME');
    expect(found).not.toContain('AUTH_URL');
  });

  it('reviews production for plain HTTP and half-configured single sign-on', () => {
    const found = review({
      NODE_ENV: 'production',
      AUTH_URL: 'http://app.nib.et',
      BACKEND_URL: 'http://api.internal:4000',
      PAYLOAD_ENCRYPTION_ENABLED: 'false',
      AUTH_OIDC_ISSUER: 'https://sso.nib.et',
    }).join('\n');
    expect(found).toContain('error AUTH_URL: is not HTTPS');
    expect(found).toContain('warning BACKEND_URL: is not HTTPS');
    expect(found).toContain('warning PAYLOAD_ENCRYPTION_ENABLED');
    expect(found).toContain(
      'single sign-on is half configured (missing AUTH_OIDC_CLIENT_ID, AUTH_OIDC_CLIENT_SECRET)',
    );
  });
});

describe('compareWithBackend', () => {
  const secret = 's'.repeat(40);
  const frontend = {
    BACKEND_URL: 'http://localhost:4000',
    BACKEND_SERVICE_CLIENT_ID: 'appcore-web',
    BACKEND_SERVICE_CLIENT_SECRET: secret,
    PAYLOAD_ENCRYPTION_KEYS: `k1:${KEY_A}`,
    PAYLOAD_ENCRYPTION_ACTIVE_KEY_ID: 'k1',
  };
  const backend = {
    SERVICE_CLIENTS: `appcore-web:${secret}`,
    PAYLOAD_ENCRYPTION_KEYS: `k1:${KEY_A}`,
    PAYLOAD_ENCRYPTION_ACTIVE_KEY_ID: 'k1',
  };
  const compare = (f: Record<string, string>, b: Record<string, string>) =>
    compareWithBackend(f, b).map((x) => `${x.level} ${x.variable}: ${x.message}`);

  it('is silent when both sides agree', () => {
    expect(compare(frontend, backend)).toEqual([]);
  });

  it('detects a different or unregistered service identity without printing the secret', () => {
    const [wrong] = compare(frontend, {
      ...backend,
      SERVICE_CLIENTS: `appcore-web:${'x'.repeat(40)}`,
    });
    expect(wrong).toContain('error BACKEND_SERVICE_CLIENT_SECRET: differs');
    expect(wrong).toContain(fingerprint(secret));
    expect(wrong).not.toContain(secret);
    expect(compare(frontend, { ...backend, SERVICE_CLIENTS: `mobile:${secret}` })[0]).toContain(
      '"appcore-web" is not registered',
    );
  });

  it('detects key rings that cannot decrypt each other, in both directions', () => {
    expect(compare(frontend, { ...backend, PAYLOAD_ENCRYPTION_KEYS: `k1:${KEY_B}` })[0]).toContain(
      'key "k1" differs between BFF',
    );
    // Rotation half done: the backend already encrypts with k2, the BFF does not have it.
    expect(
      compare(frontend, {
        ...backend,
        PAYLOAD_ENCRYPTION_KEYS: `k1:${KEY_A},k2:${KEY_B}`,
        PAYLOAD_ENCRYPTION_ACTIVE_KEY_ID: 'k2',
      }),
    ).toEqual([
      'error PAYLOAD_ENCRYPTION_KEYS: the backend encrypts with key "k2", which the BFF does not have',
    ]);
  });

  it('detects incompatible encryption modes, ports, prefixes and single sign-on', () => {
    expect(
      compare(
        { ...frontend, PAYLOAD_ENCRYPTION_ENABLED: 'false' },
        { ...backend, PAYLOAD_ENCRYPTION_MODE: 'required' },
      )[0],
    ).toContain('the backend requires encrypted payloads');
    expect(compare(frontend, { ...backend, PAYLOAD_ENCRYPTION_MODE: 'disabled' })[0]).toContain(
      'the backend has payload encryption disabled',
    );
    expect(compare(frontend, { ...backend, PORT: '4100' })[0]).toContain(
      'points to port 4000 but the backend listens on 4100',
    );
    expect(compare(frontend, { ...backend, API_DEFAULT_VERSION: '2' })[0]).toContain(
      'the backend serves "/api/v2"',
    );
    expect(compare({ ...frontend, AUTH_OIDC_ISSUER: 'https://sso' }, backend)[0]).toContain(
      'OIDC_ENABLED is not true',
    );
  });
});

describe('translations', () => {
  it('extracts ICU arguments, including those nested in plural branches', () => {
    expect(placeholders('Step {current} of {total}')).toEqual(['current', 'total']);
    expect(placeholders('{count, plural, one {Import # row} other {Import # rows}}')).toEqual([
      'count',
    ]);
    expect(
      placeholders('{count, plural, =0 {Nothing} one {# row by {user}} other {# rows}}'),
    ).toEqual(['count', 'user']);
    expect(placeholders('{when, date, medium} · {amount, number}')).toEqual(['amount', 'when']);
    expect(placeholders('No arguments')).toEqual([]);
  });

  const catalogue = (en: object, am: object | null): Catalogue => ({
    folder: 'features/users/i18n',
    messages: {
      en: flattenMessages(en as never),
      am: am ? flattenMessages(am as never) : null,
    },
  });

  it('reports missing keys and placeholder mismatches as errors', () => {
    const findings = compareCatalogue(
      catalogue(
        { users: { title: 'Users', count: '{count} users', id: 'ID', kept: 'Deleted user' } },
        { users: { count: '{total} ተጠቃሚዎች', id: 'ID', kept: 'Deleted user', old: 'x' } },
      ),
      'en',
      ['en', 'am'],
    ).map((f) => `${f.level} ${f.key} ${f.problem}`);
    expect(findings).toEqual([
      'error users.title missing',
      'error users.count placeholders',
      'warning users.kept untranslated',
      'warning users.old extra',
    ]);
  });

  it('reports a missing locale file, unregistered catalogues and namespace clashes', () => {
    expect(compareCatalogue(catalogue({ a: 'x' }, null), 'en', ['en', 'am'])[0]).toMatchObject({
      problem: 'missing-file',
      locale: 'am',
    });
    const users = catalogue({ users: { title: 'Users' } }, { users: { title: 'ተጠቃሚዎች' } });
    const clash: Catalogue = { ...users, folder: 'features/people/i18n' };
    const registered = registeredCatalogues(
      "() => import('@/features/users/i18n/en.json'),\n () => import('@/features/users/i18n/am.json'),",
    );
    const problems = checkTranslations([users, clash], registered, 'en', ['en', 'am']).map(
      (f) => `${f.catalogue} ${f.locale} ${f.problem}`,
    );
    expect(problems).toEqual([
      'features/people/i18n en not-registered',
      'features/people/i18n am not-registered',
      'features/people/i18n en namespace-clash',
    ]);
  });
});

describe('route scanning', () => {
  it('reads the requirement of a page', () => {
    expect(pageAccess('export default function Page() { return null; }')).toBeNull();
    expect(pageAccess('const user = await requireUser();')).toEqual({ kind: 'signed-in' });
    expect(pageAccess("await requireUser({ permission: 'users:read' });")).toEqual({
      kind: 'restricted',
      requirement: 'users:read',
    });
    expect(describeRequirement("{ anyOf: ['a:read', 'b:read'], role: 'ADMIN' }")).toBe(
      'any of a:read | b:read · role ADMIN',
    );
  });

  const source = `
const READ = { requires: { permission: 'compliance:read' } } as const;
export const overview = apiRoute<ApiData<'GET /compliance/overview'>>(READ, async ({ api }) => ({}));
export const restore = apiRoute<unknown, { id: string }>(
  { requires: { permission: 'users:restore' } },
  async ({ api }) => ({}),
);
export const me = apiRoute({}, async ({ api }) => ({}));
export const login = publicApiRoute(async ({ req }) => ({}));
export const exportUsers = resourceExportRoute<User>(usersResource, {
  access: 'users:read',
  fileName: 'users',
});
export const mystery = apiRoute(buildOptions(), async () => ({}));
export const {
  list: listUsers,
  create: createUser,
  remove: deleteUser,
} = resourceRoutes<User>(usersResource, {
  access: { read: 'users:read', create: 'users:create', update: 'users:update', delete: 'users:delete' },
});
export async function loadDashboard() {}
`;

  it('reads the requirement a handler factory declares', () => {
    const access = (name: string) => handlerAccess(source, name);
    expect(access('overview')).toEqual({ kind: 'restricted', requirement: 'compliance:read' });
    expect(access('restore')).toEqual({ kind: 'restricted', requirement: 'users:restore' });
    expect(access('me')).toEqual({ kind: 'signed-in' });
    expect(access('login')).toEqual({ kind: 'public' });
    expect(access('exportUsers')).toEqual({ kind: 'restricted', requirement: 'users:read' });
    expect(access('listUsers')).toEqual({ kind: 'restricted', requirement: 'users:read' });
    expect(access('createUser')).toEqual({ kind: 'restricted', requirement: 'users:create' });
    expect(access('deleteUser')).toEqual({ kind: 'restricted', requirement: 'users:delete' });
  });

  it('never guesses: what it cannot read is custom or unknown', () => {
    expect(handlerAccess(source, 'mystery')).toEqual({ kind: 'custom' });
    expect(handlerAccess(source, 'loadDashboard')).toEqual({ kind: 'custom' });
    expect(handlerAccess(source, 'doesNotExist')).toEqual({ kind: 'unknown' });
  });
});

describe('scaffold', () => {
  const spec = {
    names: pageNames('loan-reports'),
    permission: 'loans:read',
    icon: 'Wallet',
    sessionModule: '@/features/auth/api/session',
  };

  it('derives names and rejects anything that is not kebab-case', () => {
    expect(spec.names).toEqual({
      kebab: 'loan-reports',
      camel: 'loanReports',
      pascal: 'LoanReports',
      title: 'Loan reports',
    });
    expect(pageNames('faq', "Help & FAQ's").title).toBe("Help & FAQ's");
    expect(() => pageNames('Loan Reports')).toThrow(/kebab-case/);
    expect(() => pageNames('../etc')).toThrow(/kebab-case/);
  });

  it('renders a guarded route, a client component and messages that agree on names', () => {
    const route = routeFile(spec);
    expect(route).toContain("await requireUser({ permission: 'loans:read' });");
    expect(route).toContain("from '@/features/loan-reports/components/loan-reports-page'");
    expect(routeFile({ ...spec, permission: undefined })).toContain('await requireUser();');
    expect(routeFile({ ...spec, names: pageNames('faq', "Help & FAQ's") })).toContain(
      "title: 'Help & FAQ\\'s'",
    );
    const component = componentFile(spec);
    expect(component.startsWith("'use client';")).toBe(true);
    expect(component).toContain("useTranslations('loanReports')");
    expect(Object.keys(JSON.parse(messagesFile(spec)) as object)).toEqual(['loanReports']);
    expect(navigationEntry(spec)).toContain("labelKey: 'loanReports.nav'");
    expect(navigationEntry({ ...spec, permission: undefined })).not.toContain('permissions');
  });

  it('inserts before a marker once, and reports a missing marker', () => {
    const source = 'items: [\n    a,\n    // appcore:nav (generator)\n  ],\n';
    const once = insertBeforeMarker(source, '// appcore:nav', '    b,\n');
    expect(once).toBe('items: [\n    a,\n    b,\n    // appcore:nav (generator)\n  ],\n');
    expect(insertBeforeMarker(once!, '// appcore:nav', '    b,\n')).toBe(once);
    expect(insertBeforeMarker('nothing here', '// appcore:nav', 'x')).toBeNull();
  });
});

describe('runCli', () => {
  const run = async (...argv: string[]) => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const runtime: CliRuntime = {
      commands: [
        {
          name: 'demo:ok',
          summary: 'Works',
          run: ({ out }) => out.emit({ ok: true }, () => out.line('fine')),
        },
        { name: 'demo:check', summary: 'Finds a problem', run: () => ExitCode.CHECK_FAILED },
        {
          name: 'demo:boom',
          summary: 'Throws',
          run: () => {
            throw new Error('broken');
          },
        },
      ],
      title: 'Test CLI',
      version: '9.9.9',
      invocation: 'cli',
      groups: { demo: 'Demo' },
      root: '.',
      streams: {
        stdout: { write: (c) => stdout.push(c) },
        stderr: { write: (c) => stderr.push(c) },
      },
      env: {} as NodeJS.ProcessEnv,
      colorSupported: false,
    };
    return { code: await runCli(argv, runtime), stdout: stdout.join(''), stderr: stderr.join('') };
  };

  it('maps outcomes to the documented exit codes', async () => {
    expect((await run('demo:ok')).code).toBe(ExitCode.OK);
    expect((await run('demo:check')).code).toBe(ExitCode.CHECK_FAILED);
    expect((await run('demo:boom')).code).toBe(ExitCode.ERROR);
    const unknown = await run('demo:okk');
    expect(unknown.code).toBe(ExitCode.USAGE);
    expect(unknown.stderr).toContain('did you mean "demo:ok"?');
    expect((await run('demo:ok', '--nope')).code).toBe(ExitCode.USAGE);
  });

  it('prints help, the version and clean JSON', async () => {
    expect((await run()).stdout).toContain('Demo');
    expect((await run('help', 'demo:ok')).stdout).toContain('demo:ok — Works');
    expect((await run('--version')).stdout.trim()).toBe('9.9.9');
    expect(JSON.parse((await run('demo:ok', '--json')).stdout)).toEqual({ ok: true });
  });
});

describe('runCli help and refusals', () => {
  const run = async (...argv: string[]) => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const runtime: CliRuntime = {
      commands: [
        {
          name: 'demo:guarded',
          summary: 'Refuses',
          description: 'Needs a confirmation.',
          args: [
            { name: 'target', description: 'What to act on' },
            { name: 'note', description: 'Optional note', required: false },
          ],
          options: [{ name: 'yes', type: 'boolean', description: 'Confirm' }],
          examples: ['demo:guarded users --yes'],
          run: () => {
            throw new RefusedError('confirmation required');
          },
        },
        {
          name: 'demo:odd',
          summary: 'Throws a non-error',
          run: () => {
            throw 'plain string';
          },
        },
        {
          name: 'demo:boom',
          summary: 'Throws',
          run: () => {
            throw new Error('broken');
          },
        },
      ],
      title: 'Test CLI',
      version: '1.0.0',
      invocation: 'cli',
      groups: { demo: 'Demo' },
      root: '.',
      streams: {
        stdout: { write: (c) => stdout.push(c) },
        stderr: { write: (c) => stderr.push(c) },
      },
      env: {} as NodeJS.ProcessEnv,
      colorSupported: false,
    };
    const code = await runCli(argv, runtime);
    return { code, stdout: stdout.join(''), stderr: stderr.join('') };
  };

  it('prints command help with arguments, options and examples', async () => {
    const help = await run('demo:guarded', '--help');
    expect(help.code).toBe(ExitCode.OK);
    expect(help.stdout).toContain('Usage: cli demo:guarded <target> [note] [options]');
    expect(help.stdout).toContain('Needs a confirmation.');
    expect(help.stdout).toContain('What to act on');
    expect(help.stdout).toContain('demo:guarded users --yes');
    expect((await run('demo:guarded', '-h')).code).toBe(ExitCode.OK);
    expect((await run('help')).stdout).toContain('Demo');
  });

  it('reports refusals and failures with their exit codes', async () => {
    const refused = await run('demo:guarded', 'users');
    expect(refused.code).toBe(ExitCode.REFUSED);
    expect(refused.stderr).toContain('confirmation required');
    expect((await run('demo:odd')).stderr).toContain('plain string');
    const verbose = await run('demo:boom', '--verbose');
    expect(verbose.code).toBe(ExitCode.ERROR);
    expect(verbose.stderr).toContain('broken');
  });
});

describe('production and single sign-on findings', () => {
  const review = (raw: Record<string, string>) =>
    reviewEnvironment(raw, Object.keys(raw), Object.keys(raw)).map(
      (f) => `${f.level} ${f.variable}`,
    );

  it('asks for the public address, structured logs and a quiet log level', () => {
    expect(review({ NODE_ENV: 'production', LOG_PRETTY: 'true', LOG_LEVEL: 'debug' })).toEqual(
      expect.arrayContaining(['warning AUTH_URL', 'warning LOG_PRETTY', 'warning LOG_LEVEL']),
    );
    expect(
      review({
        NODE_ENV: 'production',
        AUTH_URL: 'https://app.nib.et',
        BACKEND_URL: 'http://localhost:4000',
      }),
    ).toEqual([]);
  });

  it('compares the SSO provider with the backend', () => {
    const secret = 's'.repeat(40);
    const frontend = {
      BACKEND_SERVICE_CLIENT_ID: 'web',
      BACKEND_SERVICE_CLIENT_SECRET: secret,
      AUTH_OIDC_ISSUER: 'https://sso.nib.et',
    };
    const backend = { SERVICE_CLIENTS: `web:${secret}` };
    const sso = (f: Record<string, string>, b: Record<string, string>) =>
      compareWithBackend({ ...frontend, ...f }, { ...backend, ...b })
        .filter((x) => x.variable.startsWith('AUTH_OIDC'))
        .map((x) => `${x.level} ${x.variable}`);
    expect(sso({}, {})).toEqual(['warning AUTH_OIDC_ISSUER']);
    expect(sso({ AUTH_OIDC_BACKEND_PROVIDER: 'entra' }, { OIDC_ENABLED: 'true' })).toEqual([
      'error AUTH_OIDC_BACKEND_PROVIDER',
    ]);
    expect(
      sso(
        { AUTH_OIDC_BACKEND_PROVIDER: 'entra' },
        { OIDC_ENABLED: 'true', OIDC_PROVIDER_NAME: 'entra' },
      ),
    ).toEqual([]);
    expect(sso({}, { OIDC_ENABLED: 'true' })).toEqual([]);
  });
});
