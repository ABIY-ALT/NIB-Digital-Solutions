#!/usr/bin/env node
/**
 * AppCore workspace CLI — one entry point for both projects.
 *
 *   npm run appcore -- <command>            (in the appcore root)
 *
 *   setup                 first-time setup: env files with matching secrets, install, database
 *   doctor                is everything consistent? backend config + database, frontend checks
 *   backend <command>     the backend CLI   (operations: users, audit, retention, …)
 *   frontend <command>    the frontend CLI  (checks and scaffolding)
 *   generate <…>          the feature generator (a full vertical slice)
 *
 * Dependency-free, like the generator: it only orchestrates the two projects.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractJson, prepareEnvironments } from './env.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BACKEND = join(ROOT, 'backend');
const FRONTEND = join(ROOT, 'frontend');
const INVOCATION = 'npm run appcore --';

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (text) => (tty ? `\u001b[${code}m${text}\u001b[0m` : text);
const bold = paint(1);
const dim = paint(2);
const red = paint(31);
const green = paint(32);
const yellow = paint(33);
const cyan = paint(36);

const ExitCode = { OK: 0, ERROR: 1, CHECK_FAILED: 2, USAGE: 64 };

// ── Running the project CLIs ─────────────────────────────────────────────────

const PROJECTS = {
  backend: { cwd: BACKEND, entry: ['scripts/cli.mjs'] },
  // tsx's own CLI through node: no shell, so arguments are passed verbatim.
  frontend: { cwd: FRONTEND, entry: ['node_modules/tsx/dist/cli.mjs', 'src/cli/main.ts'] },
};

function projectCli(project, args, { capture = false } = {}) {
  const { cwd, entry } = PROJECTS[project];
  if (!existsSync(join(cwd, 'node_modules'))) {
    return { status: ExitCode.ERROR, stdout: '', missing: true };
  }
  const result = spawnSync(process.execPath, [...entry, ...args], {
    cwd,
    env: { ...process.env, APPCORE_CLI_INVOCATION: `${INVOCATION} ${project}` },
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
  });
  return { status: result.status ?? ExitCode.ERROR, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function npm(args, cwd) {
  console.log(dim(`  $ npm ${args.join(' ')}  (${cwd === ROOT ? '.' : cwd.slice(ROOT.length + 1)})`));
  // npm is a .cmd shim on Windows, so it needs a shell; the arguments are fixed strings.
  return spawnSync(`npm ${args.join(' ')}`, { cwd, stdio: 'inherit', shell: true }).status ?? 1;
}

// ── Commands ─────────────────────────────────────────────────────────────────

function help() {
  console.log(`${bold('AppCore workspace CLI')}

Usage: ${INVOCATION} <command> [options]

${bold('Workspace')}
  ${cyan('setup')}                First-time setup: environment files with matching secrets,
                       dependencies, database schema and development data
  ${cyan('doctor')}               Check both projects: configuration, shared secrets, database,
                       translations, routes, API contract

${bold('Projects')}
  ${cyan('backend')} <command>    Backend CLI: users, roles, audit trail, retention, jobs, config
  ${cyan('frontend')} <command>   Frontend CLI: environment, translations, routes, scaffolding
  ${cyan('generate')} <…>         Feature generator (backend + frontend + contract)

${bold('Options')}
  setup    --skip-install   do not run npm install
           --skip-db        do not migrate or seed the database
           --dry-run        show what would be done
  doctor   --strict         treat warnings as failures
           --json           machine-readable result
           --offline        do not try to reach the database or the backend

Each project lists its own commands:
  ${INVOCATION} backend help
  ${INVOCATION} frontend help

Exit codes: 0 success · 1 error · 2 a check found a problem · 3 refused · 64 wrong usage`);
  return ExitCode.OK;
}

function setup(flags) {
  const dryRun = flags.has('--dry-run');
  const major = Number(process.versions.node.split('.')[0]);
  console.log(bold(`\nAppCore setup${dryRun ? ' (dry run)' : ''}\n`));
  if (major < 24) {
    console.error(red(`✖ Node.js 24 or newer is required (this is v${process.versions.node}).`));
    return ExitCode.ERROR;
  }
  console.log(`${green('✔')} Node.js v${process.versions.node}`);

  // 1. Environment files — never overwrites a value that is already set.
  const files = {
    backend: { target: join(BACKEND, '.env'), template: join(BACKEND, '.env.example') },
    frontend: { target: join(FRONTEND, '.env.local'), template: join(FRONTEND, '.env.example') },
  };
  const current = Object.fromEntries(
    Object.entries(files).map(([side, f]) => [
      side,
      readFileSync(existsSync(f.target) ? f.target : f.template, 'utf8'),
    ]),
  );
  const prepared = prepareEnvironments(current);
  for (const [side, f] of Object.entries(files)) {
    const created = !existsSync(f.target);
    const keys = prepared.filled[side];
    const name = f.target.slice(ROOT.length + 1).replace(/\\/g, '/');
    if (!created && keys.length === 0) {
      console.log(`${green('✔')} ${name} ${dim('already complete — left untouched')}`);
      continue;
    }
    if (!dryRun) writeFileSync(f.target, prepared[side]);
    console.log(
      `${green('✔')} ${name} ${created ? 'created' : 'completed'}${keys.length ? dim(` — generated ${keys.join(', ')}`) : ''}`,
    );
  }
  console.log(dim('  The service identity and payload key ring are identical in both files.'));
  if (dryRun) {
    console.log(dim('\nDry run: nothing was written; install and database steps were skipped.'));
    return ExitCode.OK;
  }

  // 2. Dependencies
  if (!flags.has('--skip-install')) {
    console.log(bold('\nInstalling dependencies'));
    for (const cwd of [BACKEND, FRONTEND]) {
      if (npm(['install'], cwd) !== 0) return ExitCode.ERROR;
    }
  }

  // 3. Database: schema for every environment, demo data for development only.
  if (!flags.has('--skip-db')) {
    console.log(bold('\nPreparing the database'));
    if (npm(['run', 'prisma:deploy'], BACKEND) !== 0) {
      console.error(red('✖ Could not apply the migrations. Is PostgreSQL running and DATABASE_URL correct?'));
      console.error(dim(`  Check: ${INVOCATION} backend config:show --section database`));
      return ExitCode.ERROR;
    }
    if (npm(['run', 'db:seed'], BACKEND) !== 0) return ExitCode.ERROR;
  }

  console.log(`\n${green('✔')} ${bold('AppCore is ready.')}

  Start the backend    cd backend  && npm run start:dev     ${dim('→ http://localhost:4000/docs')}
  Start the frontend   cd frontend && npm run dev           ${dim('→ http://localhost:3000')}
  Check everything     ${INVOCATION} doctor
`);
  return ExitCode.OK;
}

function doctor(flags) {
  const json = flags.has('--json');
  const strict = flags.has('--strict');
  const offline = flags.has('--offline');
  const lines = [];
  const add = (project, check, status, detail, inspect) =>
    lines.push({ project, check, status, detail, ...(inspect ? { inspect } : {}) });

  // Backend configuration (no database needed).
  const config = projectCli('backend', ['config:check', '--json'], { capture: true });
  const configResult = extractJson(config.stdout);
  if (config.missing) add('backend', 'Dependencies', 'failed', 'not installed', `${INVOCATION} setup`);
  else if (!configResult) add('backend', 'Configuration', 'failed', 'the backend CLI did not run (build error?)', `${INVOCATION} backend config:check`);
  else {
    const { length: errors } = configResult.errors;
    const { length: warnings } = configResult.warnings;
    add(
      'backend',
      'Configuration',
      errors ? 'failed' : warnings ? 'warning' : 'ok',
      errors || warnings ? `${errors} error(s), ${warnings} warning(s)` : `valid (${configResult.environment})`,
      `${INVOCATION} backend config:check`,
    );
  }

  // Backend database and migrations.
  if (offline) add('backend', 'Database', 'skipped', '--offline');
  else if (configResult?.valid) {
    const db = extractJson(projectCli('backend', ['db:status', '--json'], { capture: true }).stdout);
    if (!db) add('backend', 'Database', 'failed', 'not reachable', `${INVOCATION} backend db:status`);
    else {
      const { pending, failed } = db.migrations;
      add(
        'backend',
        'Database',
        db.healthy ? 'ok' : 'failed',
        db.healthy
          ? `PostgreSQL ${db.server.version}, ${db.migrations.applied} migrations applied`
          : `${pending.length} pending, ${failed.length} failed migration(s)`,
        `${INVOCATION} backend db:status`,
      );
      if (db.healthy && db.records.permissions === 0) {
        add('backend', 'Permissions', 'warning', 'the catalogue is empty', `${INVOCATION} backend permissions:sync`);
      }
    }
  }

  // Frontend: its own doctor covers env, shared secrets, config, i18n, routes, contract.
  const frontend = projectCli('frontend', ['doctor', '--json', ...(offline ? ['--offline'] : [])], { capture: true });
  const frontendResult = extractJson(frontend.stdout);
  if (frontend.missing) add('frontend', 'Dependencies', 'failed', 'not installed', `${INVOCATION} setup`);
  else if (!frontendResult) add('frontend', 'Checks', 'failed', 'the frontend CLI did not run', `${INVOCATION} frontend doctor`);
  else {
    for (const line of frontendResult.checks) {
      add('frontend', line.check, line.status, line.detail, line.inspect ? `${INVOCATION} frontend ${line.inspect}` : undefined);
    }
  }

  const failed = lines.some((l) => l.status === 'failed' || (strict && l.status === 'warning'));
  if (json) {
    console.log(JSON.stringify({ healthy: !failed, checks: lines }, null, 2));
    return failed ? ExitCode.CHECK_FAILED : ExitCode.OK;
  }
  const symbol = { ok: green('✔'), warning: yellow('!'), failed: red('✖'), skipped: dim('–') };
  const width = Math.max(...lines.map((l) => l.check.length));
  for (const project of ['backend', 'frontend']) {
    console.log(bold(`\n${project === 'backend' ? 'Backend' : 'Frontend'}`));
    for (const line of lines.filter((l) => l.project === project)) {
      const hint = line.inspect && !['ok', 'skipped'].includes(line.status) ? dim(`  → ${line.inspect}`) : '';
      console.log(`  ${symbol[line.status]} ${line.check.padEnd(width)}  ${line.detail}${hint}`);
    }
  }
  console.log(failed ? `\n${red('✖')} AppCore is not ready.` : `\n${green('✔')} AppCore is healthy.`);
  return failed ? ExitCode.CHECK_FAILED : ExitCode.OK;
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

const [command, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((arg) => arg.startsWith('--')));
const KNOWN_FLAGS = {
  setup: ['--skip-install', '--skip-db', '--dry-run'],
  doctor: ['--strict', '--json', '--offline'],
};

function run() {
  if (!command || command === 'help' || command === '--help' || command === '-h') return help();
  if (command === 'backend' || command === 'frontend') {
    const result = projectCli(command, rest);
    if (result.missing) {
      console.error(red(`✖ ${command}/node_modules is missing. Run: ${INVOCATION} setup`));
    }
    return result.status;
  }
  if (command === 'generate') {
    return (
      spawnSync(process.execPath, [join(ROOT, 'tools/generator/index.mjs'), ...rest], {
        cwd: ROOT,
        stdio: 'inherit',
      }).status ?? ExitCode.ERROR
    );
  }
  if (command === 'setup' || command === 'doctor') {
    const unknown = rest.filter((arg) => !KNOWN_FLAGS[command].includes(arg));
    if (unknown.length) {
      console.error(red(`✖ Unknown option ${unknown[0]} for "${command}"`));
      console.error(dim(`  Help: ${INVOCATION} help`));
      return ExitCode.USAGE;
    }
    return command === 'setup' ? setup(flags) : doctor(flags);
  }
  console.error(red(`✖ Unknown command "${command}"`));
  console.error(dim(`  Help: ${INVOCATION} help`));
  return ExitCode.USAGE;
}

process.exitCode = run();
