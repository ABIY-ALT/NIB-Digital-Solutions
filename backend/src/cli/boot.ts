import type { BootMode } from './kernel/command.js';
import type { BootedApp } from './kernel/runner.js';

/**
 * Starts the application for a one-off command: the same module graph, use
 * cases and repositories as the server, without the HTTP layer.
 *
 * The process-wide settings below are set BEFORE the module graph is loaded
 * (variables already in the environment win over the .env file):
 *   JOBS_ENABLED=false   a CLI process must never start background timers
 *   LOG_STREAM=stderr    stdout carries only the command's output (--json)
 *   LOG_LEVEL=error      unless --verbose (commands print their own warnings)
 *   DATABASE_TRANSACTION_TIMEOUT_MS=60000  unless set: an operator's machine may
 *                        be far from a hosted database, and a use case that does
 *                        a dozen round trips in one transaction then outlasts
 *                        Prisma's 5 s default and rolls back
 */
export async function bootApplication(
  mode: Exclude<BootMode, 'none'>,
  options: { verbose: boolean },
): Promise<BootedApp> {
  process.env.JOBS_ENABLED = 'false';
  process.env.LOG_STREAM = 'stderr';
  process.env.LOG_PRETTY = 'false';
  if (!options.verbose) process.env.LOG_LEVEL = 'error';
  process.env.DATABASE_TRANSACTION_TIMEOUT_MS ??= '60000';

  const [{ NestFactory }, { AppModule }, { APP_CONFIG }] = await Promise.all([
    import('@nestjs/core'),
    import('../app.module.js'),
    import('#config/config.module.js'),
  ]);

  if (mode === 'preview') {
    // Module graph only: no provider is instantiated, no connection is opened.
    const [{ buildAppConfig }, { validateEnv }] = await Promise.all([
      import('#config/app-config.js'),
      import('#config/env.schema.js'),
    ]);
    const config = buildAppConfig(validateEnv(process.env));
    const app = await NestFactory.createApplicationContext(AppModule, {
      preview: true,
      logger: false,
      abortOnError: false,
    });
    return { app, config, close: () => app.close() };
  }

  const { Logger } = await import('nestjs-pino');
  try {
    const app = await NestFactory.createApplicationContext(AppModule, {
      bufferLogs: true,
      abortOnError: false,
    });
    app.useLogger(app.get(Logger));
    return { app, config: app.get(APP_CONFIG), close: () => app.close() };
  } catch (error) {
    throw explain(error);
  }
}

/** Turns the usual start-up failures into a message an operator can act on. */
function explain(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith('Invalid AppCore backend configuration')) {
    return new Error(`${message}\n\n  Check it without starting anything: config:check`);
  }
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|Can't reach database|connect/i.test(message)) {
    return new Error(
      `Could not connect to the database or key/value store: ${message}\n` +
        '  Check DATABASE_URL / REDIS_URL and that the services are reachable from this host.',
      { cause: error },
    );
  }
  return error instanceof Error ? error : new Error(message);
}
