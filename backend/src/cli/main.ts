import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { bootApplication } from './boot.js';
import { COMMAND_GROUPS, COMMANDS } from './commands/index.js';
import { ProcessTerminal } from './kernel/prompt.js';
import { runCli } from './kernel/runner.js';

/**
 * AppCore backend CLI — operations without the HTTP layer.
 *
 *   development   npm run cli -- <command>         (builds when the sources changed)
 *   production    node dist/cli/main.js <command>
 *
 * Commands run the same use cases as the API, as the operator who started
 * them, and every change lands in the audit trail. `help` lists them.
 */
function version(): string {
  try {
    const manifest = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { version?: string };
    return manifest.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const code = await runCli(process.argv.slice(2), {
  commands: COMMANDS,
  help: {
    title: 'AppCore backend CLI',
    version: version(),
    invocation: process.env.APPCORE_CLI_INVOCATION ?? 'node dist/cli/main.js',
    groups: COMMAND_GROUPS,
  },
  streams: process,
  terminal: new ProcessTerminal(),
  env: process.env,
  colorSupported: Boolean(process.stdout.isTTY),
  boot: bootApplication,
});

process.exitCode = code;
// Anything still holding the event loop (a socket, a worker) must not keep a one-off command alive.
setTimeout(() => process.exit(code), 3_000).unref();
