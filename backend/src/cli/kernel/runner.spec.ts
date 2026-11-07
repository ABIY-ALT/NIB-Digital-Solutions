import type { INestApplicationContext } from '@nestjs/common';
import type { AppConfig } from '#config/app-config.js';
import { AUDIT_LOGGER, type AuditEntry } from '#core/application/ports/audit-logger.port.js';
import { ConflictError } from '#core/domain/errors/app-error.js';
import { RequestContext } from '#core/infrastructure/context/request-context.js';
import type { CliCommand } from './command.js';
import { ExitCode } from './errors.js';
import type { Terminal } from './prompt.js';
import { runCli, type CliRuntime } from './runner.js';

function harness(
  commands: CliCommand[],
  settings: {
    production?: boolean;
    approvalActions?: string[];
    interactive?: boolean;
    answer?: string;
  } = {},
) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const audited: AuditEntry[] = [];
  const boots: string[] = [];
  let closed = 0;
  const config = {
    app: { isProduction: settings.production ?? false, name: 'appcore-test' },
    approvals: { enabled: true, actions: settings.approvalActions ?? [] },
  } as unknown as AppConfig;
  const app = {
    get: (token: unknown) => {
      if (token === AUDIT_LOGGER) {
        return { record: (entry: AuditEntry) => Promise.resolve(void audited.push(entry)) };
      }
      throw new Error('unexpected provider');
    },
  } as unknown as INestApplicationContext;
  const terminal: Terminal = {
    interactive: settings.interactive ?? false,
    ask: () => Promise.resolve(settings.answer ?? ''),
    askHidden: () => Promise.resolve('typed-secret'),
    readPiped: () => Promise.resolve('piped-secret\n'),
  };
  const runtime: CliRuntime = {
    commands,
    help: { title: 'Test CLI', version: '1.2.3', invocation: 'cli', groups: { users: 'Users' } },
    streams: {
      stdout: { write: (chunk) => stdout.push(chunk) },
      stderr: { write: (chunk) => stderr.push(chunk) },
    },
    terminal,
    env: { APPCORE_OPERATOR: 'abebe' },
    colorSupported: false,
    boot: (mode) => {
      boots.push(mode);
      return Promise.resolve({ app, config, close: () => Promise.resolve(void closed++) });
    },
  };
  return {
    run: (...argv: string[]) => runCli(argv, runtime),
    stdout: () => stdout.join(''),
    stderr: () => stderr.join(''),
    audited,
    boots,
    closed: () => closed,
  };
}

const change = (overrides: Partial<CliCommand> = {}): CliCommand => ({
  name: 'users:change',
  summary: 'Change a user',
  mutates: true,
  audit: { action: 'CLI_USER_CHANGE', category: 'SECURITY', resourceType: 'User' },
  run: ({ auditTarget }) => auditTarget('u-1', { username: 'jdoe' }),
  ...overrides,
});

describe('runCli', () => {
  it('prints help without starting the application', async () => {
    const h = harness([change()]);
    expect(await h.run()).toBe(ExitCode.OK);
    expect(await h.run('help', 'users:change')).toBe(ExitCode.OK);
    expect(await h.run('users:change', '--help')).toBe(ExitCode.OK);
    expect(h.stdout()).toContain('Users');
    expect(h.stdout()).toContain('Audited as CLI_USER_CHANGE.');
    expect(h.boots).toEqual([]);
  });

  it('maps usage mistakes to exit code 64 with a hint', async () => {
    const h = harness([change()]);
    expect(await h.run('users:chnage')).toBe(ExitCode.USAGE);
    expect(await h.run('users:change', '--nope')).toBe(ExitCode.USAGE);
    expect(h.stderr()).toContain('did you mean "users:change"?');
    expect(h.stderr()).toContain('help users:change');
  });

  it('runs a command as the operator, audits it and closes the application', async () => {
    let seen: { userId?: string; correlationId?: string } = {};
    const h = harness([
      change({
        run: ({ principal, auditTarget }) => {
          seen = { userId: principal.userId, correlationId: RequestContext.get()?.correlationId };
          auditTarget('u-1', { username: 'jdoe' });
        },
      }),
    ]);
    expect(await h.run('users:change', '--reason', 'CHG-1', '--yes')).toBe(ExitCode.OK);
    expect(seen.userId).toBe('cli:abebe');
    expect(seen.correlationId).toMatch(/^cli-/);
    expect(h.closed()).toBe(1);
    expect(h.audited).toHaveLength(1);
    expect(h.audited[0]).toMatchObject({
      action: 'CLI_USER_CHANGE',
      outcome: 'SUCCESS',
      resourceId: 'u-1',
      actorId: 'cli:abebe',
      metadata: { channel: 'cli', command: 'users:change', username: 'jdoe', reason: 'CHG-1' },
    });
    // Option values never reach the audit trail — only the names (the reason has its own field).
    expect(h.audited[0]!.metadata).toMatchObject({ options: ['yes'] });
  });

  it('audits failures with the error code and reports them on stderr', async () => {
    const h = harness([
      change({
        run: () => {
          throw new ConflictError('The username is already taken.');
        },
      }),
    ]);
    expect(await h.run('users:change')).toBe(ExitCode.ERROR);
    expect(h.audited[0]).toMatchObject({ outcome: 'FAILURE', errorCode: 'CONFLICT' });
    expect(h.stderr()).toContain('The username is already taken. [CONFLICT]');
    expect(h.closed()).toBe(1);
  });

  it('returns the exit code a command reports', async () => {
    const h = harness([
      change({ mutates: false, audit: undefined, run: () => ExitCode.CHECK_FAILED }),
    ]);
    expect(await h.run('users:change')).toBe(ExitCode.CHECK_FAILED);
  });

  it('keeps stdout to one JSON document in --json mode', async () => {
    const h = harness([
      change({
        run: ({ out }) => {
          out.success('done');
          out.emit({ ok: true }, () => out.line('human'));
        },
      }),
    ]);
    expect(await h.run('users:change', '--json')).toBe(ExitCode.OK);
    expect(JSON.parse(h.stdout())).toEqual({ ok: true });
    expect(h.stderr()).toContain('done');
  });

  describe('production', () => {
    it('refuses a change without a reason', async () => {
      const h = harness([change()], { production: true });
      expect(await h.run('users:change', '--yes')).toBe(ExitCode.REFUSED);
      expect(h.stderr()).toContain('need --reason');
      expect(h.audited).toHaveLength(0);
    });

    it('refuses a change that nobody confirmed when not on a terminal', async () => {
      const h = harness([change()], { production: true });
      expect(await h.run('users:change', '--reason', 'CHG-1042')).toBe(ExitCode.REFUSED);
      expect(h.stderr()).toContain('pass --yes');
    });

    it('asks on a terminal and proceeds only on "yes"', async () => {
      const declined = harness([change()], { production: true, interactive: true, answer: 'y' });
      expect(await declined.run('users:change', '--reason', 'CHG-1042')).toBe(ExitCode.REFUSED);
      const confirmed = harness([change()], { production: true, interactive: true, answer: 'yes' });
      expect(await confirmed.run('users:change', '--reason', 'CHG-1042')).toBe(ExitCode.OK);
      expect(confirmed.audited[0]!.metadata).toMatchObject({ reason: 'CHG-1042' });
    });

    it('does not gate read-only commands', async () => {
      const h = harness([change({ mutates: false, audit: undefined })], { production: true });
      expect(await h.run('users:change')).toBe(ExitCode.OK);
    });
  });

  describe('maker–checker', () => {
    const gated = change({ approvalAction: 'users.update' });

    it('refuses and audits a direct change to an action under four-eyes control', async () => {
      const h = harness([gated], { approvalActions: ['users.update'] });
      expect(await h.run('users:change')).toBe(ExitCode.REFUSED);
      expect(h.stderr()).toContain('--break-glass');
      expect(h.audited[0]).toMatchObject({ outcome: 'DENIED', errorCode: 'CLI_APPROVAL_REQUIRED' });
    });

    it('applies it with --break-glass and records that', async () => {
      const h = harness([gated], { approvalActions: ['users.update'] });
      expect(await h.run('users:change', '--break-glass')).toBe(ExitCode.OK);
      expect(h.audited[0]!.metadata).toMatchObject({ breakGlass: true });
    });

    it('lets the change through when the action is not under approval', async () => {
      const h = harness([gated], { approvalActions: ['roles.update'] });
      expect(await h.run('users:change')).toBe(ExitCode.OK);
    });
  });

  describe('destructive commands and dry runs', () => {
    const purge = change({
      name: 'data:purge',
      options: [{ name: 'dry-run', type: 'boolean', description: '' }],
      mutates: (o) => !o.flag('dry-run'),
      destructive: (o) => !o.flag('dry-run'),
    });

    it('always asks before removing data', async () => {
      const h = harness([purge]);
      expect(await h.run('data:purge')).toBe(ExitCode.REFUSED);
      expect(await h.run('data:purge', '--yes')).toBe(ExitCode.OK);
      expect(h.audited).toHaveLength(1);
    });

    it('runs a dry run without confirmation and without a command record', async () => {
      const h = harness([purge], { production: true });
      expect(await h.run('data:purge', '--dry-run')).toBe(ExitCode.OK);
      expect(h.audited).toHaveLength(0);
    });
  });

  it('reads a piped secret and strips the trailing newline', async () => {
    let secret = '';
    const h = harness([
      change({
        mutates: false,
        audit: undefined,
        run: async ({ readSecret }) => {
          secret = await readSecret('Password');
        },
      }),
    ]);
    expect(await h.run('users:change')).toBe(ExitCode.OK);
    expect(secret).toBe('piped-secret');
  });

  it('does not start the application for boot: none commands', async () => {
    const h = harness([
      change({ boot: 'none', mutates: false, audit: undefined, run: () => undefined }),
    ]);
    expect(await h.run('users:change')).toBe(ExitCode.OK);
    expect(h.boots).toEqual([]);
  });
});
