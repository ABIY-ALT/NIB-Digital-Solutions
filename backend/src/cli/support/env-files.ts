import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { UsageError } from '../kernel/errors.js';

export interface LoadedEnvironment {
  raw: Record<string, string | undefined>;
  /** Variables that were read from files (typos can only be detected there). */
  fileKeys: string[];
  /** Human-readable description of where the values came from. */
  sources: string[];
}

/** Same files and precedence as the application (config.module.ts): environment › .env.local › .env. */
const DEFAULT_FILES = ['.env.local', '.env'];

/**
 * Reads the environment the way the application would — or, with `envFile`,
 * ONLY that file, so a production file can be checked from any machine without
 * the local shell leaking into the result.
 */
export function loadEnvironment(options: {
  cwd: string;
  envFile?: string;
  processEnv?: NodeJS.ProcessEnv;
}): LoadedEnvironment {
  if (options.envFile) {
    const path = resolve(options.cwd, options.envFile);
    if (!existsSync(path)) throw new UsageError(`Environment file not found: ${path}`);
    const values = parse(readFileSync(path));
    return { raw: { ...values }, fileKeys: Object.keys(values), sources: [path] };
  }

  const fromFiles: Record<string, string> = {};
  const sources: string[] = [];
  for (const file of DEFAULT_FILES) {
    const path = resolve(options.cwd, file);
    if (!existsSync(path)) continue;
    sources.push(file);
    for (const [key, value] of Object.entries(parse(readFileSync(path)))) {
      fromFiles[key] ??= value;
    }
  }
  sources.push('process environment');
  return {
    raw: { ...fromFiles, ...(options.processEnv ?? process.env) },
    fileKeys: Object.keys(fromFiles),
    sources,
  };
}
