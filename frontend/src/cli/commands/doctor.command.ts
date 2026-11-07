import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CliCommand } from '../kernel/command';
import { ExitCode } from '../kernel/errors';
import {
  checkAppConfig,
  checkEnvironment,
  checkI18n,
  checkRoutes,
  countOf,
  loadAppConfig,
} from '../support/checks';
import { loadEnvironment } from '../support/env-check';

type Status = 'ok' | 'warning' | 'failed' | 'skipped';

interface CheckLine {
  check: string;
  status: Status;
  detail: string;
  /** Command that shows the details. */
  inspect?: string;
}

const fromFindings = (
  findings: readonly { level: string }[],
  ok: string,
): Pick<CheckLine, 'status' | 'detail'> => {
  const errors = countOf(findings, 'error');
  const warnings = countOf(findings, 'warning');
  if (errors) return { status: 'failed', detail: `${errors} error(s), ${warnings} warning(s)` };
  if (warnings) return { status: 'warning', detail: `${warnings} warning(s)` };
  return { status: 'ok', detail: ok };
};

function nodeVersion(root: string): CheckLine {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    engines?: { node?: string };
  };
  const required = Number(/\d+/.exec(manifest.engines?.node ?? '')?.[0] ?? 0);
  const actual = Number(process.versions.node.split('.')[0]);
  const requirement = required ? ` (requires ${manifest.engines?.node})` : '';
  return {
    check: 'Node.js',
    status: actual >= required ? 'ok' : 'failed',
    detail: `v${process.versions.node}${requirement}`,
  };
}

function contract(root: string): CheckLine {
  const script = join(root, 'scripts/generate-api-contract.mjs');
  if (!existsSync(script))
    return { check: 'API contract', status: 'skipped', detail: 'no generator script' };
  const result = spawnSync(process.execPath, [script, '--check'], { cwd: root, encoding: 'utf8' });
  return result.status === 0
    ? {
        check: 'API contract',
        status: 'ok',
        detail: 'generated types match contracts/openapi.json',
      }
    : {
        check: 'API contract',
        status: 'failed',
        detail: 'generated types are stale',
        inspect: 'npm run api:generate',
      };
}

async function backend(root: string): Promise<CheckLine> {
  const url = loadEnvironment({ root }).raw.BACKEND_URL;
  if (!url) return { check: 'Backend', status: 'skipped', detail: 'BACKEND_URL is not set' };
  const target = `${url.replace(/\/$/, '')}/health/ready`;
  try {
    const response = await fetch(target, { signal: AbortSignal.timeout(3_000) });
    return response.ok
      ? { check: 'Backend', status: 'ok', detail: `${target} is ready` }
      : { check: 'Backend', status: 'warning', detail: `${target} answered ${response.status}` };
  } catch {
    return {
      check: 'Backend',
      status: 'warning',
      detail: `${target} is not reachable (is it running?)`,
    };
  }
}

export const doctor: CliCommand = {
  name: 'doctor',
  summary: 'Run every check: environment, configuration, translations, routes, contract',
  description: [
    'One command before a pull request or a deployment. Each line names the command that',
    'shows the details. Exit code 2 when a check failed; warnings do not fail unless',
    '--strict is given.',
  ].join('\n'),
  options: [
    { name: 'strict', type: 'boolean', description: 'Treat warnings as failures' },
    { name: 'offline', type: 'boolean', description: 'Do not try to reach the backend' },
  ],
  examples: ['doctor', 'doctor --strict --offline', 'doctor --json'],
  async run({ root, options, out }) {
    const lines: CheckLine[] = [nodeVersion(root)];
    const guarded = async (
      check: string,
      inspect: string,
      run: () => Promise<CheckLine> | CheckLine,
    ) => {
      try {
        lines.push({ inspect, ...(await run()) });
      } catch (error) {
        lines.push({
          check,
          inspect,
          status: 'failed',
          detail: error instanceof Error ? error.message.split('\n')[0]! : String(error),
        });
      }
    };

    await guarded('Environment', 'env:check', () => {
      const result = checkEnvironment(root);
      return {
        check: 'Environment',
        ...fromFindings(
          result.findings,
          result.comparedWith ? 'valid; shared secrets match the backend' : 'valid',
        ),
      };
    });
    await guarded('Configuration', 'config:check', async () => ({
      check: 'Configuration',
      ...fromFindings(checkAppConfig(root, await loadAppConfig()).findings, 'consistent'),
    }));
    await guarded('Translations', 'i18n:check', async () => {
      const result = checkI18n(root, (await loadAppConfig()).i18n);
      return {
        check: 'Translations',
        ...fromFindings(
          result.findings,
          `${result.keys} messages in ${result.catalogues} catalogues`,
        ),
      };
    });
    await guarded('Routes', 'routes:list --check', () => {
      const result = checkRoutes(root);
      return {
        check: 'Routes',
        ...fromFindings(
          result.findings,
          `${result.pages.length} pages, ${result.api.length} API routes`,
        ),
      };
    });
    lines.push(
      contract(root),
      options.flag('offline')
        ? { check: 'Backend', status: 'skipped', detail: '--offline' }
        : await backend(root),
    );

    const strict = options.flag('strict');
    const failed = lines.some((l) => l.status === 'failed' || (strict && l.status === 'warning'));
    const symbol: Record<Status, string> = {
      ok: out.paint('✔', 'green'),
      warning: out.paint('!', 'yellow'),
      failed: out.paint('✖', 'red'),
      skipped: out.paint('–', 'dim'),
    };
    out.emit({ healthy: !failed, checks: lines }, () => {
      const width = Math.max(...lines.map((l) => l.check.length));
      for (const line of lines) {
        const hint =
          line.status !== 'ok' && line.status !== 'skipped' && line.inspect
            ? out.paint(`  → ${line.inspect}`, 'dim')
            : '';
        out.line(`  ${symbol[line.status]} ${line.check.padEnd(width)}  ${line.detail}${hint}`);
      }
      out.line();
      if (failed) out.error('The frontend is not ready.');
      else out.success('The frontend is healthy.');
    });
    return failed ? ExitCode.CHECK_FAILED : ExitCode.OK;
  },
};
