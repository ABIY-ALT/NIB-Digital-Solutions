import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMAND_GROUPS, COMMANDS } from './commands';
import { runCli } from './kernel/runner';

/**
 * AppCore frontend CLI — project checks and scaffolding.
 *
 *   npm run cli -- <command>        (runs with tsx: no build step, same "@/" aliases)
 *
 * Nothing here is bundled into the application: src/cli is only reachable
 * from this entry point. `help` lists the commands.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function version(): string {
  try {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      version?: string;
    };
    return manifest.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

process.exitCode = await runCli(process.argv.slice(2), {
  commands: COMMANDS,
  title: 'AppCore frontend CLI',
  version: version(),
  invocation: process.env.APPCORE_CLI_INVOCATION ?? 'npm run cli --',
  groups: COMMAND_GROUPS,
  root,
  streams: process,
  env: process.env,
  colorSupported: Boolean(process.stdout.isTTY),
});
