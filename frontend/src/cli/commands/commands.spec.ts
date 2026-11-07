import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ExitCode } from '../kernel/errors';
import { runCli } from '../kernel/runner';
import { COMMAND_GROUPS, COMMANDS } from '.';

/**
 * The frontend CLI end to end: the checks against this project (whatever its
 * local .env), and make:page in a throwaway copy of src/.
 */
async function cli(root: string, ...argv: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli(argv, {
    commands: COMMANDS,
    title: 'AppCore frontend CLI',
    version: '0.0.0-test',
    invocation: 'cli',
    groups: COMMAND_GROUPS,
    root,
    streams: {
      stdout: { write: (c) => stdout.push(c) },
      stderr: { write: (c) => stderr.push(c) },
    },
    env: {} as NodeJS.ProcessEnv,
    colorSupported: false,
  });
  return { code, stdout: stdout.join(''), stderr: stderr.join('') };
}

const project = process.cwd();
const checkOutcome = [ExitCode.OK, ExitCode.CHECK_FAILED];

describe('project checks', () => {
  it('checks the app config, translations and routes of this project', async () => {
    const config = await cli(project, 'config:check');
    expect(config.code).toBe(ExitCode.OK);
    expect(JSON.parse((await cli(project, 'config:check', '--json')).stdout)).toBeTypeOf('object');

    expect((await cli(project, 'i18n:check')).code).toBe(ExitCode.OK);
    expect((await cli(project, 'i18n:check', '--feature', 'users', '--json')).code).toBe(
      ExitCode.OK,
    );

    const routes = await cli(project, 'routes:list', '--check');
    expect(routes.code).toBe(ExitCode.OK);
    expect(routes.stdout).toContain('/api/users');
    for (const args of [
      ['--type', 'pages'],
      ['--type', 'api', '--filter', 'users'],
      ['--access', 'public'],
      ['--json'],
    ]) {
      expect((await cli(project, 'routes:list', ...args)).code).toBe(ExitCode.OK);
    }
  });

  it('reviews environment files, with and without the backend', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-check-'));
    const secret = 's'.repeat(40);
    const key = `k1:${Buffer.alloc(32, 1).toString('base64')}`;
    writeFileSync(
      join(dir, 'frontend.env'),
      [
        'BACKEND_URL=http://localhost:4000',
        'AUTH_SECRET=__GENERATE__',
        'CSRF_SECRET=same-secret-same-secret-same-secret',
        `BACKEND_SERVICE_CLIENT_SECRET=${secret}`,
        'BACKEND_SERVICE_CLIENT_ID=web',
        `PAYLOAD_ENCRYPTION_KEYS=${key}`,
        'PAYLOAD_ENCRYPTION_ACTIVE_KEY_ID=k1',
        'NEXT_PUBLIC_API_KEY=abc',
      ].join('\n'),
    );
    writeFileSync(
      join(dir, 'backend.env'),
      [
        `SERVICE_CLIENTS=web:${secret}`,
        `PAYLOAD_ENCRYPTION_KEYS=${key}`,
        'PAYLOAD_ENCRYPTION_ACTIVE_KEY_ID=k1',
      ].join('\n'),
    );
    try {
      const file = await cli(
        project,
        'env:check',
        '--env-file',
        join(dir, 'frontend.env'),
        '--backend-env',
        join(dir, 'backend.env'),
      );
      expect(file.code).toBe(ExitCode.CHECK_FAILED);
      expect(file.stdout + file.stderr).toContain('AUTH_SECRET');
      const json = await cli(
        project,
        'env:check',
        '--env-file',
        join(dir, 'frontend.env'),
        '--production',
        '--json',
      );
      expect(checkOutcome).toContain(json.code);
      expect(JSON.parse(json.stdout)).toBeTypeOf('object');
      expect(checkOutcome).toContain((await cli(project, 'env:check')).code);
      expect(checkOutcome).toContain((await cli(project, 'env:check', '--strict')).code);
      expect(
        (await cli(project, 'env:check', '--env-file', join(dir, 'missing.env'))).code,
      ).not.toBe(ExitCode.OK);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runs the doctor offline', async () => {
    const doctor = await cli(project, 'doctor', '--offline');
    expect(checkOutcome).toContain(doctor.code);
    expect(doctor.stdout).toMatch(/Node/i);
    expect(checkOutcome).toContain(
      (await cli(project, 'doctor', '--offline', '--strict', '--json')).code,
    );
  });
});

describe('make:page', () => {
  const copy = mkdtempSync(join(tmpdir(), 'make-page-'));
  cpSync(join(project, 'src'), join(copy, 'src'), { recursive: true });
  cpSync(join(project, 'package.json'), join(copy, 'package.json'));
  afterAll(() => rmSync(copy, { recursive: true, force: true }));

  it('shows what it would write on a dry run, writing nothing', async () => {
    const dry = await cli(
      copy,
      'make:page',
      'loan-reports',
      '--permission',
      'loans:read',
      '--nav',
      '--icon',
      'FileText',
      '--dry-run',
    );
    expect(dry.code, dry.stderr).toBe(ExitCode.OK);
    expect(dry.stdout).toContain('loan-reports');
    expect(existsSync(join(copy, 'src/features/loan-reports'))).toBe(false);
  });

  it('writes the page, its messages and registrations, and refuses to overwrite them', async () => {
    const made = await cli(copy, 'make:page', 'help-centre', '--title', 'Help centre', '--nav');
    expect(made.code, made.stderr).toBe(ExitCode.OK);
    expect(existsSync(join(copy, 'src/app/(app)/help-centre/page.tsx'))).toBe(true);
    expect(readFileSync(join(copy, 'src/features/help-centre/i18n/en.json'), 'utf8')).toContain(
      'Help centre',
    );
    expect(readFileSync(join(copy, 'src/infrastructure/i18n/messages.ts'), 'utf8')).toContain(
      'help-centre/i18n/en.json',
    );

    expect((await cli(copy, 'make:page', 'help-centre')).code).toBe(ExitCode.REFUSED);
    expect((await cli(copy, 'make:page', 'help-centre', '--force', '--json')).code).toBe(
      ExitCode.OK,
    );
  });

  it('refuses malformed permissions and unknown icons', async () => {
    expect((await cli(copy, 'make:page', 'x-page', '--permission', 'nope')).code).toBe(
      ExitCode.USAGE,
    );
    expect((await cli(copy, 'make:page', 'x-page', '--icon', 'NoSuchIcon')).code).toBe(
      ExitCode.USAGE,
    );
    expect((await cli(copy, 'help', 'make:page')).stdout).toContain('make:page');
  });
});
