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

  const { PrismaService } = await import('../dist/core/infrastructure/prisma/prisma.service.js');
  const { KEY_VALUE_STORE } = await import('../dist/core/infrastructure/kv/key-value-store.js');
  return {
    express: app.getHttpAdapter().getInstance(),
    diagnose: () => diagnose(app.get(PrismaService), app.get(KEY_VALUE_STORE), config),
  };
}

/** Masks the user:password part of a connection URL. */
const maskCredentials = (text) =>
  String(text).replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1***@');

/** Scheme and host of a connection URL: enough to spot a wrong one, nothing secret. */
function describeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`;
  } catch {
    return 'unparseable';
  }
}

/** Runs one check with a time limit; reports the reason when it fails. */
async function probe(check, timeoutMs = 8_000) {
  const started = Date.now();
  let timer;
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`no answer within ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
    return { status: 'up', ms: Date.now() - started };
  } catch (error) {
    return {
      status: 'down',
      ms: Date.now() - started,
      code: error?.code === undefined ? undefined : String(error.code),
      error: maskCredentials(error instanceof Error ? error.message : error)
        .split('\n')[0]
        .slice(0, 300),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /health/diagnose — /health/ready says only "unavailable" in production,
 * and both checks swallow their errors. This reports why each dependency is
 * down: the error with credentials masked, and the scheme and host it uses.
 */
async function diagnose(prisma, kv, config) {
  return {
    node: process.version,
    database: {
      target: describeUrl(config.database.url),
      ...(await probe(() => prisma.client.$queryRaw`SELECT 1`)),
    },
    kvStore: {
      driver: kv.driver,
      target: kv.driver === 'redis' ? describeUrl(process.env.REDIS_URL) : undefined,
      connection: kv.client?.status,
      ...(await probe(() => (kv.client ? kv.client.ping() : kv.ping()))),
    },
  };
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
    // The runtime decides whether CommonJS packages may require() ES-module
    // ones (ERR_REQUIRE_ESM otherwise): Node 22.12+ allows it by default.
    node: process.version,
    requireModule: process.features?.require_module ?? false,
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
    const { express, diagnose: runDiagnosis } = await server;
    if (req.method === 'GET' && req.url?.split('?')[0] === '/health/diagnose') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(await runDiagnosis()));
      return;
    }
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
