// Vercel entry point: serves the NestJS backend as one Vercel Function.
//
// Vercel's own NestJS build compiles src/ with its own TypeScript settings, which
// differ from tsconfig.json and break type resolution (e.g. @anthropic-ai/sdk).
// Instead, the project's own `nest build` (vercel.json buildCommand) compiles
// src/ to dist/, and this plain-JS handler only loads that output. It mirrors
// src/main.ts, except that Vercel owns the HTTP server, so the app is
// initialised instead of listening on a port.
import 'reflect-metadata';
import '../dist/core/presentation/http/express-request.js';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from '../dist/app.module.js';
import { setupApp, setupSwagger } from '../dist/bootstrap/setup-app.js';
import { APP_CONFIG } from '../dist/config/config.module.js';

/** One Nest app per function instance, reused across warm invocations. */
let server;

async function createServer() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  const config = app.get(APP_CONFIG);
  setupApp(app, config);
  setupSwagger(app, config);

  await app.init();
  return app.getHttpAdapter().getInstance();
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
    console.error('AppCore backend failed to start:', error instanceof Error ? error.message : error);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: { code: 'SERVICE_UNAVAILABLE' } }));
  }
}
