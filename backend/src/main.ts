import 'reflect-metadata';
import '#core/presentation/http/express-request.js';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { setupApp, setupSwagger } from '#bootstrap/setup-app.js';
import type { AppConfig } from '#config/app-config.js';
import { APP_CONFIG } from '#config/config.module.js';

async function bootstrap(): Promise<void> {
  // Configuration is validated while the module graph is built: invalid or
  // missing settings abort startup here, before a port is opened.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);

  const config = app.get<AppConfig>(APP_CONFIG);
  setupApp(app, config);
  setupSwagger(app, config);

  process.on('unhandledRejection', (reason) =>
    logger.error({ err: reason }, 'Unhandled promise rejection'),
  );

  await app.listen(config.app.port);
  logger.log(
    `AppCore backend listening on :${config.app.port} (${config.app.env}) — API /${config.app.apiPrefix}/v${config.app.defaultVersion}` +
      (config.docs.enabled ? `, docs /${config.docs.path}` : ''),
  );
}

try {
  await bootstrap();
} catch (error: unknown) {
  console.error(
    '\n✖ AppCore backend failed to start\n',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
}
