import 'reflect-metadata';
import { bootApplication } from '../src/cli/boot.js';
import { COMMAND_GROUPS, COMMANDS } from '../src/cli/commands/index.js';
import { ExitCode } from '../src/cli/kernel/errors.js';
import type { BootedApp } from '../src/cli/kernel/runner.js';
import { runCli } from '../src/cli/kernel/runner.js';
import { unique } from './support/api.js';

// The operations CLI against the test database: every command through the
// real kernel (parsing, production controls, audit), sharing one booted
// application per boot mode instead of starting one per command.

const booted = new Map<string, Promise<BootedApp>>();

function cli(password = 'Kx9#mPq2Lw!7') {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const run = (...argv: string[]) =>
    runCli(argv, {
      commands: COMMANDS,
      help: {
        title: 'AppCore backend CLI',
        version: '0.0.0-test',
        invocation: 'cli',
        groups: COMMAND_GROUPS,
      },
      streams: {
        stdout: { write: (chunk: string) => stdout.push(chunk) },
        stderr: { write: (chunk: string) => stderr.push(chunk) },
      },
      terminal: {
        interactive: false,
        ask: () => Promise.resolve('yes'),
        askHidden: () => Promise.resolve(password),
        readPiped: () => Promise.resolve(`${password}\n`),
      },
      env: { ...process.env, APPCORE_OPERATOR: 'api-tests' },
      colorSupported: false,
      boot: (mode, options) => {
        if (!booted.has(mode)) booted.set(mode, bootApplication(mode, options));
        // Closed once, after every test.
        return booted.get(mode)!.then((app) => ({ ...app, close: () => Promise.resolve() }));
      },
    });
  return {
    run: async (...argv: string[]) => {
      stdout.length = 0;
      stderr.length = 0;
      const code = await run(...argv);
      return { code, stdout: stdout.join(''), stderr: stderr.join('') };
    },
  };
}

afterAll(async () => {
  for (const app of booted.values()) await (await app).close();
});

describe('backend CLI', () => {
  const { run } = cli();

  it('checks and shows the configuration, and lists routes', async () => {
    expect((await run('config:check')).code).toBeLessThan(ExitCode.USAGE);
    expect((await run('config:check', '--json')).code).toBeLessThan(ExitCode.USAGE);
    expect((await run('config:show')).stdout).toContain('database');
    expect(JSON.parse((await run('config:show', '--json')).stdout)).toBeTypeOf('object');
    const routes = await run('routes:list', '--check');
    expect(routes.code).toBe(ExitCode.OK);
    expect((await run('routes:list', '--json')).stdout).toContain('/api/v1/users');
  });

  it('diagnoses the database and key/value store', async () => {
    expect((await run('health')).code).toBe(ExitCode.OK);
    expect((await run('health', '--json')).code).toBe(ExitCode.OK);
    const status = await run('db:status');
    expect(status.code).toBeLessThan(ExitCode.USAGE);
    expect((await run('db:status', '--json')).stdout).toContain('users');
  });

  it('compares and syncs the permission catalogue, and lists roles', async () => {
    expect((await run('permissions:list')).code).toBeLessThan(ExitCode.USAGE);
    expect((await run('permissions:list', '--json')).code).toBeLessThan(ExitCode.USAGE);
    expect((await run('permissions:sync', '--yes', '--reason', 'API tests sync')).code).toBe(
      ExitCode.OK,
    );
    expect((await run('roles:list')).stdout).toContain('SUPER_ADMIN');
    expect((await run('roles:list', '--json')).code).toBe(ExitCode.OK);
  });

  it('administers a user from creation to sign-out', async () => {
    const username = unique('cli.');
    const create = await run(
      'users:create',
      '--username',
      username,
      '--email',
      `${username}@example.com`,
      '--full-name',
      'CLI User',
      '--role',
      'USER',
      '--branch',
      'HQ',
      '--phone',
      '+251911000222',
      '--password-stdin',
      '--yes',
      '--reason',
      'API tests create',
    );
    expect(create.code, create.stderr).toBe(ExitCode.OK);
    expect((await run('users:list', '--search', username)).stdout).toContain(username);
    expect(
      (
        await run(
          'users:list',
          '--status',
          'ACTIVE',
          '--branch',
          'HQ',
          '--page',
          '1',
          '--page-size',
          '5',
          '--json',
        )
      ).code,
    ).toBe(ExitCode.OK);
    expect((await run('users:show', username)).stdout).toContain(username);
    expect((await run('users:show', username, '--json')).code).toBe(ExitCode.OK);
    expect((await run('users:show', 'no.such.user')).code).not.toBe(ExitCode.OK);

    const yes = ['--yes', '--reason', 'API tests change'];
    expect(
      (await run('users:roles', username, '--add', 'AUDITOR', '--remove', 'USER', ...yes)).code,
    ).toBe(ExitCode.OK);
    expect((await run('users:roles', username, ...yes)).code).toBe(ExitCode.USAGE);
    expect((await run('users:set-status', username, 'DISABLED', ...yes)).code).toBe(ExitCode.OK);
    expect((await run('users:set-status', username, 'ACTIVE', ...yes)).code).toBe(ExitCode.OK);
    expect((await run('users:set-status', username, 'SLEEPING', ...yes)).code).not.toBe(
      ExitCode.OK,
    );
    expect((await run('users:unlock', username, ...yes)).code).toBeLessThan(ExitCode.USAGE);
    expect((await run('users:reset-password', username, '--password-stdin', ...yes)).code).toBe(
      ExitCode.OK,
    );
    expect((await run('users:revoke-sessions', username, ...yes)).code).toBe(ExitCode.OK);
  });

  it('reports on, verifies and anchors the audit trail', async () => {
    expect((await run('audit:status')).code).toBe(ExitCode.OK);
    expect((await run('audit:status', '--json')).code).toBe(ExitCode.OK);
    const verify = await run('audit:verify');
    expect(verify.code, verify.stdout + verify.stderr).toBe(ExitCode.OK);
    expect((await run('audit:verify', '--json')).code).toBe(ExitCode.OK);
    expect((await run('audit:anchor', '--yes', '--reason', 'API tests anchor')).code).toBe(
      ExitCode.OK,
    );
  });

  it('previews and runs retention, and runs background jobs', async () => {
    expect((await run('retention:preview')).code).toBe(ExitCode.OK);
    expect((await run('retention:preview', '--json')).code).toBe(ExitCode.OK);
    expect(
      (await run('retention:run', '--dry-run', '--yes', '--reason', 'API tests retention')).code,
    ).toBe(ExitCode.OK);
    expect((await run('jobs:list')).stdout).toContain('data-retention');
    expect((await run('jobs:list', '--json')).code).toBe(ExitCode.OK);
    expect(
      (await run('jobs:run', 'approval-expiry', '--yes', '--reason', 'API tests job')).code,
    ).toBe(ExitCode.OK);
    expect(
      (await run('jobs:run', 'no-such-job', '--yes', '--reason', 'API tests job')).code,
    ).not.toBe(ExitCode.OK);
  });

  it('prints help for every command', async () => {
    for (const command of COMMANDS) {
      const help = await run('help', command.name);
      expect(help.code).toBe(ExitCode.OK);
      expect(help.stdout).toContain(command.name);
    }
  });
});
