import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { UNPREFIXED_ROUTES } from '#bootstrap/setup-app.js';
import { KEY_VALUE_STORE, type KeyValueStore } from '#core/infrastructure/kv/key-value-store.js';
import { PrismaService } from '#core/infrastructure/prisma/prisma.service.js';
import type { CliCommand } from '../kernel/command.js';
import { ExitCode } from '../kernel/errors.js';
import { collectRoutes, describeAccess, isWrite } from '../support/routes.js';

const routesList: CliCommand = {
  name: 'routes:list',
  summary: 'List every API endpoint with the access control that protects it',
  description: [
    'Reads the decorator metadata the guards enforce (no database needed), so the',
    'listing is what the running application does — useful for security reviews.',
    '',
    '--check fails (exit 2) when an endpoint declares no authorization. Such an',
    'endpoint is denied at runtime, so it is always a mistake: run it in CI.',
  ].join('\n'),
  boot: 'preview',
  options: [
    {
      name: 'filter',
      type: 'string',
      valueName: 'text',
      description: 'Only endpoints whose path or controller contains the text',
    },
    {
      name: 'permission',
      type: 'string',
      valueName: 'code',
      description: 'Only endpoints that require this permission',
    },
    {
      name: 'access',
      type: 'string',
      choices: ['public', 'authenticated', 'restricted', 'denied'],
      description: 'Only endpoints with this kind of access',
    },
    { name: 'check', type: 'boolean', description: 'Fail when an endpoint has no authorization' },
  ],
  examples: [
    'routes:list',
    'routes:list --access public',
    'routes:list --permission users:update',
    'routes:list --check',
  ],
  run({ app, config, options, out }) {
    const all = collectRoutes(app, {
      apiPrefix: config.app.apiPrefix,
      defaultVersion: config.app.defaultVersion,
      unprefixed: UNPREFIXED_ROUTES,
    });
    const filter = options.string('filter')?.toLowerCase();
    const permission = options.string('permission');
    const access = options.string('access');
    const routes = all.filter(
      (r) =>
        (!filter ||
          r.path.toLowerCase().includes(filter) ||
          r.controller.toLowerCase().includes(filter)) &&
        (!access || r.access.kind === access) &&
        (!permission ||
          (r.access.kind === 'restricted' &&
            [...r.access.all, ...r.access.any].includes(permission))),
    );
    const undeclared = all.filter((r) => r.access.kind === 'denied');
    const unauditedWrites = all.filter((r) => isWrite(r) && r.access.kind !== 'public' && !r.audit);

    out.emit(
      {
        routes,
        summary: {
          total: all.length,
          shown: routes.length,
          public: all.filter((r) => r.access.kind === 'public').length,
          undeclared: undeclared.length,
          unauditedWrites: unauditedWrites.length,
        },
      },
      () => {
        out.table(
          [
            { header: 'METHOD', value: (r) => r.method },
            { header: 'PATH', value: (r) => r.path },
            { header: 'ACCESS', value: (r) => describeAccess(r.access), maxWidth: 60 },
            { header: 'AUDIT', value: (r) => r.audit },
            {
              header: 'FLAGS',
              value: (r) =>
                [r.idempotent ? 'idempotent' : '', r.authRateLimit ? 'auth-limit' : '']
                  .filter(Boolean)
                  .join(' '),
            },
          ],
          routes,
        );
        out.line();
        out.info(
          `${routes.length} of ${all.length} endpoints · ` +
            `${all.filter((r) => r.access.kind === 'public').length} public · ` +
            `${unauditedWrites.length} state-changing without an @Audit record`,
        );
        for (const route of undeclared) {
          out.error(
            `${route.method} ${route.path} (${route.controller}.${route.handler}) declares no authorization — every call is denied.`,
          );
        }
      },
    );
    return options.flag('check') && undeclared.length ? ExitCode.CHECK_FAILED : ExitCode.OK;
  },
};

interface MigrationRow {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
}

/** The pending migrations, 0, or "unknown" when this build ships no migrations folder. */
function pendingSummary(shipped: string[] | null, pending: string[]): string[] | number | string {
  if (!shipped) return 'unknown (prisma/migrations not found)';
  return pending.length ? pending : 0;
}

const dbStatus: CliCommand = {
  name: 'db:status',
  summary: 'Database connectivity, schema migrations and record counts',
  description:
    'Compares the migrations applied to the database with the ones shipped in\n' +
    'prisma/migrations. Exit code 2 when migrations are pending or one has failed:\n' +
    'use it as a release gate before switching traffic.',
  examples: ['db:status', 'db:status --json'],
  async run({ get, out }) {
    const prisma = get<PrismaService>(PrismaService);
    const [server] = await prisma.client.$queryRaw<
      Array<{ version: string; database: string; size: string }>
    >`SELECT current_setting('server_version') AS version, current_database() AS database,
             pg_size_pretty(pg_database_size(current_database())) AS size`;

    let applied: MigrationRow[] | null = null;
    try {
      applied = await prisma.client.$queryRaw<MigrationRow[]>`
        SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at`;
    } catch {
      /* table missing: the schema was never migrated */
    }

    const directory = resolve(process.cwd(), 'prisma/migrations');
    const shipped = existsSync(directory)
      ? readdirSync(directory, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort()
      : null;
    const done = new Set(
      (applied ?? [])
        .filter((m) => m.finished_at && !m.rolled_back_at)
        .map((m) => m.migration_name),
    );
    const failed = (applied ?? [])
      .filter((m) => !m.finished_at && !m.rolled_back_at)
      .map((m) => m.migration_name);
    const pending = (shipped ?? []).filter((name) => !done.has(name));
    const unknown = shipped ? [...done].filter((name) => !shipped.includes(name)) : [];

    const [users, roles, permissions] = applied
      ? await Promise.all([
          prisma.client.user.count({ where: { deletedAt: null } }),
          prisma.client.role.count({ where: { deletedAt: null } }),
          prisma.client.permission.count({ where: { deletedAt: null } }),
        ])
      : [0, 0, 0];
    const healthy = applied !== null && failed.length === 0 && pending.length === 0;

    out.emit(
      {
        healthy,
        server,
        migrations: {
          initialised: applied !== null,
          applied: done.size,
          pending,
          failed,
          unknown,
          shippedKnown: shipped !== null,
        },
        records: { users, roles, permissions },
      },
      () => {
        out.heading('Server');
        out.keyValues([
          ['PostgreSQL', server?.version],
          ['Database', server?.database],
          ['Size', server?.size],
        ]);
        out.heading('Migrations');
        out.keyValues([
          ['Applied', done.size],
          ['Pending', pendingSummary(shipped, pending)],
          ['Failed', failed.length ? failed : 0],
          ...(unknown.length ? ([['Not in this release', unknown]] as const) : []),
        ]);
        out.heading('Records');
        out.keyValues([
          ['Users', users],
          ['Roles', roles],
          ['Permissions', permissions],
        ]);
        out.line();
        if (applied === null)
          out.error('The schema is not initialised. Run: npx prisma migrate deploy');
        else if (failed.length)
          out.error('A migration failed part-way. Resolve it before deploying.');
        else if (pending.length)
          out.error('Migrations are pending. Run: npx prisma migrate deploy');
        else out.success('The database schema is up to date.');
        if (applied !== null && permissions === 0) {
          out.warn('The permission catalogue is empty. Run: permissions:sync');
        }
      },
    );
    return healthy ? ExitCode.OK : ExitCode.CHECK_FAILED;
  },
};

const health: CliCommand = {
  name: 'health',
  summary: 'Check that the database and key/value store are reachable',
  description:
    'The same dependencies as the readiness probe, checked from this process: useful\n' +
    'before a deployment and when the HTTP probe itself cannot be reached.',
  examples: ['health', 'health --json'],
  async run({ get, config, out }) {
    const prisma = get<PrismaService>(PrismaService);
    const kv = get<KeyValueStore>(KEY_VALUE_STORE);
    const time = async (check: () => Promise<boolean>): Promise<{ up: boolean; ms: number }> => {
      const started = performance.now();
      const up = await check().catch(() => false);
      return { up, ms: Math.round(performance.now() - started) };
    };
    const [database, store] = await Promise.all([time(() => prisma.ping()), time(() => kv.ping())]);
    const healthy = database.up && store.up;

    out.emit(
      {
        healthy,
        environment: config.app.env,
        database,
        keyValueStore: { ...store, driver: kv.driver },
      },
      () => {
        out.table(
          [
            { header: 'DEPENDENCY', value: (r) => r.name },
            { header: 'STATUS', value: (r) => (r.up ? 'up' : 'DOWN') },
            { header: 'LATENCY', value: (r) => `${r.ms} ms`, align: 'right' },
          ],
          [
            { name: 'PostgreSQL', ...database },
            { name: `Key/value store (${kv.driver})`, ...store },
          ],
        );
        out.line();
        if (healthy) out.success(`All dependencies are reachable (${config.app.env}).`);
        else out.error('A dependency is not reachable.');
        if (kv.driver === 'memory') {
          out.warn(
            'KV_STORE=memory: sessions and locks live inside each process and are not shared with the server.',
          );
        }
      },
    );
    return healthy ? ExitCode.OK : ExitCode.CHECK_FAILED;
  },
};

export const systemCommands: CliCommand[] = [health, dbStatus, routesList];
