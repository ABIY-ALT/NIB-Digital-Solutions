import 'reflect-metadata';
import '#core/presentation/http/express-request.js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { buildOpenApiDocument, UNPREFIXED_ROUTES } from '#bootstrap/setup-app.js';
import { buildAppConfig } from '#config/app-config.js';
import { validateEnv } from '#config/env.schema.js';

/**
 * Writes the shared API contract (OpenAPI 3) to ../contracts/openapi.json
 * without starting the server or touching the database (Nest preview mode:
 * the module graph is scanned, no provider is instantiated).
 *
 *   npm run contract:export          write the contract
 *   npm run contract:check           fail if the committed contract is stale (CI)
 *
 * The frontend generates its types from the same file (`npm run api:generate`).
 */
async function main(): Promise<void> {
  const check = process.argv.includes('--check');
  const target = resolve(process.cwd(), '../contracts/openapi.json');
  const config = buildAppConfig(validateEnv(process.env));

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    preview: true,
    logger: false,
    abortOnError: false,
  });
  app.setGlobalPrefix(config.app.apiPrefix, { exclude: UNPREFIXED_ROUTES });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: config.app.defaultVersion });

  const json = `${JSON.stringify(stable(buildOpenApiDocument(app)), null, 2)}\n`;
  await app.close();

  if (check) {
    let current = '';
    try {
      current = readFileSync(target, 'utf8');
    } catch {
      /* missing = stale */
    }
    if (current !== json) {
      console.error('✖ contracts/openapi.json is out of date. Run `npm run contract:export`.');
      process.exit(1);
    }
    console.log('✔ API contract is up to date.');
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, json);
  console.log(`✔ API contract written to ${target}`);
}

/** Deterministic key order so the contract diffs cleanly in code review. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stable(v)]),
    );
  }
  return value;
}

try {
  await main();
} catch (error: unknown) {
  console.error(error);
  process.exit(1);
}
