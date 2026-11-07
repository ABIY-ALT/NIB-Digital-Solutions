// Vercel entry point: serves the NestJS backend as one Vercel Function.
//
// Vercel's own NestJS build compiles src/ with its own TypeScript settings, which
// differ from tsconfig.json and break type resolution (e.g. @anthropic-ai/sdk).
// Instead, the project's own `nest build` (vercel.json buildCommand) compiles
// src/ to dist/, and this plain-JS handler only loads that output. It mirrors
// src/main.ts, except that Vercel owns the HTTP server, so the app is
// initialised instead of listening on a port.
import 'reflect-metadata';
// Vercel copies only the files its tracer (@vercel/nft) finds by following
// imports from this entry. Through the "#..." subpath imports it reaches the
// files below but does not follow their own imports, so the function crashed
// at startup with these packages missing. Importing them here makes the
// tracer include them. To recheck after adding a dependency, trace this file
// with @vercel/nft and compare against the packages dist/ imports.
import '../dist/generated/prisma/client.js';
import '@prisma/adapter-pg';
import 'argon2';
import 'dotenv';
import 'ioredis';
import 'pdfkit';

/** One Nest app per function instance, reused across warm invocations. */
let server;

async function createServer() {
  // Imported here, not at the top: the config module validates the environment
  // while it loads, and a failure there must reach the catch in the handler
  // instead of crashing the function (FUNCTION_INVOCATION_FAILED, no details).
  await import('../dist/core/presentation/http/express-request.js');
  const { NestFactory } = await import('@nestjs/core');
  const { Logger } = await import('nestjs-pino');
  const { AppModule } = await import('../dist/app.module.js');
  const { setupApp, setupSwagger } = await import('../dist/bootstrap/setup-app.js');
  const { APP_CONFIG } = await import('../dist/config/config.module.js');

  // abortOnError: false — Nest would otherwise exit the process on a startup
  // error, which Vercel reports as FUNCTION_INVOCATION_FAILED with no details.
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
    abortOnError: false,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);

  const config = app.get(APP_CONFIG);
  setupApp(app, config);
  setupSwagger(app, config);

  await app.init();
  return app.getHttpAdapter().getInstance();
}

/**
 * Configuration problems name the variable and the rule it breaks, never its
 * value, so they are safe to return and spare a trip to the function logs.
 */
function startupProblems(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.startsWith('Invalid AppCore backend configuration')) return undefined;
  return message
    .split('\n')
    .slice(1)
    .map((line) => line.replace(/^\s*•\s*/, '').trim())
    .filter(Boolean);
}

/**
 * Any other startup error (database or Redis unreachable, a missing module):
 * its type, code and first line, with credentials in connection URLs masked,
 * so a failed deployment can be diagnosed from the response. The full error,
 * stack included, goes to the function logs.
 */
function startupError(error) {
  if (startupProblems(error)) return undefined;
  const root = error?.cause instanceof Error ? error.cause : error;
  const message = String(root instanceof Error ? root.message : root)
    .split('\n')[0]
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1***@')
    .slice(0, 300);
  return {
    type: root instanceof Error ? root.name : typeof root,
    code: root?.code === undefined ? undefined : String(root.code),
    message,
  };
}

export default async function handler(req, res) {
  server ??= createServer().catch((error) => {
    // Let the next request retry instead of caching the failure.
    server = undefined;
    throw error;
  });

  try {
    const express = await server;
    express(req, res);
  } catch (error) {
    console.error('AppCore backend failed to start:', error);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      JSON.stringify({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'The backend failed to start. See the function logs.',
          configProblems: startupProblems(error),
          startupError: startupError(error),
        },
      }),
    );
  }
}
