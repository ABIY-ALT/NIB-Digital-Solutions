#!/usr/bin/env node
/**
 * Development launcher for the backend CLI:  npm run cli -- <command> [options]
 *
 * The CLI is part of the application (src/cli) and runs compiled, like the
 * server. This launcher rebuilds only when a source file is newer than the
 * build, then hands over to dist/cli/main.js.
 *
 * Production images have no sources: run `node dist/cli/main.js <command>` there.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'dist/cli/main.js');

/** Newest modification time under a directory, for files matching the filter. */
function newest(dir, matches) {
  let latest = 0;
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) latest = Math.max(latest, newest(path, matches));
    else if (matches(item.name)) latest = Math.max(latest, statSync(path).mtimeMs);
  }
  return latest;
}

function needsBuild() {
  if (!existsSync(entry)) return true;
  const src = join(root, 'src');
  if (!existsSync(src)) return false; // production image: nothing to build from
  const sources = newest(src, (name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'));
  return sources > newest(join(root, 'dist'), (name) => name.endsWith('.js'));
}

if (needsBuild()) {
  if (!existsSync(join(root, 'src'))) {
    console.error('✖ dist/cli/main.js is missing and there are no sources to build it from.');
    process.exit(1);
  }
  process.stderr.write('Building the backend (sources changed)…\n');
  // The Nest CLI runs on this Node binary: no PATH lookup, no shell.
  const nest = createRequire(import.meta.url).resolve('@nestjs/cli/bin/nest.js');
  const build = spawnSync(process.execPath, [nest, 'build'], {
    cwd: root,
    stdio: ['ignore', 2, 2], // build output on stderr: stdout stays clean for --json
  });
  if (build.status !== 0) {
    console.error('✖ Build failed; the command was not run.');
    process.exit(1);
  }
}

// The application resolves .env and prisma/ relative to the backend directory.
process.chdir(root);
process.env.APPCORE_CLI_INVOCATION ??= 'npm run cli --';
await import(pathToFileURL(entry).href);
